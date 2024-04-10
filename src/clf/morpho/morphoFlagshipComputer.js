const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const { fnName, getDay, roundTo, retry } = require('../../utils/utils');
const fs = require('fs');
const { default: axios } = require('axios');
dotenv.config();
const { getBlocknumberForTimestamp } = require('../../utils/web3.utils');
const { normalize, getConfTokenBySymbol, getTokenSymbolByAddress } = require('../../utils/token.utils');
const { config, morphoBlueAbi, metamorphoAbi } = require('./morphoFlagshipComputer.config');
const { RecordMonitoring } = require('../../utils/monitoring');
const { DATA_DIR } = require('../../utils/constants');
const { getRollingVolatility, getLiquidityAll, getLiquidityAverageV2 } = require('../../data.interface/data.interface');
const spans = [7, 30, 180];

// morphoFlagshipComputer(60);
/**
 * Compute the CLFs values for Morpho
 * @param {number} fetchEveryMinutes 
 */
async function morphoFlagshipComputer(fetchEveryMinutes, startDate=Date.now()) {
    const MONITORING_NAME = 'Morpho Flagship CLF Computer';
    const start = Date.now();
    try {
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'running',
            'lastStart': Math.round(start / 1000),
            'runEvery': fetchEveryMinutes * 60
        });
        if (!process.env.RPC_URL) {
            throw new Error('Could not find RPC_URL env variable');
        }

        console.log(new Date(startDate));

        if (!fs.existsSync(path.join(DATA_DIR, 'clf'))) {
            fs.mkdirSync(path.join(DATA_DIR, 'clf'));
        }

        console.log(`${fnName()}: starting`);
        const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
        // precompute the fromBlocks for all spans
        // fromBlocks will look like that for spans 7, 30, 180: 
        // {
        //     7: 15784154, --> block 7 days ago
        //     30: 14878410, --> block 30 days ago
        //     180: 112548787 --> block 180 days ago
        // }
        const fromBlocks = {};
        for(const span of spans) {
            const startBlock = await getBlocknumberForTimestamp(Math.round(startDate/ 1000) - (span * 24 * 60 * 60));
            fromBlocks[span] = startBlock;
        }

        const currentBlock = await getBlocknumberForTimestamp(Math.round(startDate/ 1000));
        const results = {};
        const averagePerAsset = {};
        const startDateUnixSecond = Math.round(startDate/1000);

        /// for all vaults in morpho config
        for (const vault of Object.values(config.vaults)) {
            const clfValue = await computeCLFForVault(config.blueAddress, vault.address, vault.name, vault.baseAsset, web3Provider, fromBlocks, currentBlock, startDateUnixSecond);
            if(clfValue) {
                results[vault.baseAsset] = clfValue;
                const averagePoolData = computeAverageCLFForVault(results[vault.baseAsset]);
                results[vault.baseAsset]['weightedCLF'] = averagePoolData.weightedCLF;
                results[vault.baseAsset]['totalCollateral'] = averagePoolData.totalCollateral;
                averagePerAsset[vault.baseAsset] = averagePoolData;
                console.log(`results[${vault.baseAsset}]`, results[vault.baseAsset]);
            } else {
                console.log(`not data for vault ${vault.name}`);
            }
        }

        const protocolWeightedCLF = computeProtocolWeightedCLF(averagePerAsset);

        const toRecord = {
            protocol: 'morpho',
            weightedCLF: protocolWeightedCLF,
            results
        };

        console.log('firing record function');
        recordResults(toRecord, startDate);

        console.log('Morpho CLF Computer: ending');

        const runEndDate = Math.round(Date.now() / 1000);
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'success',
            'lastEnd': runEndDate,
            'lastDuration': runEndDate - Math.round(start / 1000),
            'lastBlockFetched': currentBlock
        });
    } catch (error) {
        const errorMsg = `An exception occurred: ${error}`;
        console.error(errorMsg);
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'error',
            'error': errorMsg
        });
    }
}

/**
 * Compute CLF value for a vault
 * @param {string} cometAddress 
 * @param {string} baseAsset 
 * @param {{index: number, symbol: string, address: string, coinGeckoID: string}[]} collaterals 
 * @param {ethers.providers.StaticJsonRpcProvider} web3Provider 
 * @param {{[span: number]: number}} fromBlocks 
 * @param {number} endBlock 
 * @returns {Promise<{collateralsData: {[collateralSymbol: string]: {collateral: {inKindSupply: number, usdSupply: number}, clfs: {7: {volatility: number, liquidity: number}, 30: {volatility: number, liquidity: number}, 180: {volatility: number, liquidity: number}}}}>}
 */
async function computeCLFForVault(blueAddress, vaultAddress, vaultName, baseAsset, web3Provider, fromBlocks, endBlock, startDateUnixSec) {
    const resultsData = {
        collateralsData: {}
    };

    console.log(`Started work on Morpho flagship --- ${baseAsset} --- vault`);
    const morphoBlue = new ethers.Contract(blueAddress, morphoBlueAbi, web3Provider);
    const metamorphoVault = new ethers.Contract(vaultAddress, metamorphoAbi, web3Provider);

    // find the vault markets
    const marketIds = await getVaultMarkets(metamorphoVault, endBlock);

    if(marketIds.length == 0) {
        return undefined;
    }

    const baseToken = getConfTokenBySymbol(baseAsset);

    // compute clf for all markets with a collateral
    for(const marketId of marketIds) {
        const marketParams = await retry(() => morphoBlue.idToMarketParams(marketId, {blockTag: endBlock}), []);
        if(marketParams.collateralToken != ethers.constants.AddressZero) {
            const collateralTokenSymbol = getTokenSymbolByAddress(marketParams.collateralToken);
            const uniqueId = `${collateralTokenSymbol}_${marketId}`;
            console.log(`market collateral is ${collateralTokenSymbol}`);
            const collateralToken = getConfTokenBySymbol(collateralTokenSymbol);
            const marketConfig = await retry(() => metamorphoVault.config(marketId, {blockTag: endBlock}), []);
            const blueMarket = await retry(() => morphoBlue.market(marketId, {blockTag: endBlock}), []);
            // assetParameters { liquidationBonusBPS: 1200, supplyCap: 900000, LTV: 70 }
            const LTV = normalize(marketParams.lltv, 18) * 100;
            const liquidationBonusBPS = getLiquidationBonusForLtv(LTV/100);
            // max(config cap from metamorpho vault, current market supply)
            const configCap = normalize(marketConfig.cap, baseToken.decimals);
            const currentSupply = normalize(blueMarket.totalSupplyAssets, baseToken.decimals);
            const supplyCap = Math.max(configCap, currentSupply); // SUPPLY CAP IS IN BASE ASSET. FOR THE ETH VAULT IT'S IN ETH
            const assetParameters = {
                liquidationBonusBPS,
                supplyCap,
                LTV
            };

            resultsData.collateralsData[uniqueId] = {};
            // collateral data { inKindSupply: 899999.9260625947, usdSupply: 45764996.240282945 }
            const basePrice = await getHistoricalPrice(baseToken.address, startDateUnixSec);
            const quotePrice = await getHistoricalPrice(collateralToken.address, startDateUnixSec);
            resultsData.collateralsData[uniqueId].collateral = {
                inKindSupply: currentSupply,
                usdSupply: currentSupply * basePrice
            };

            resultsData.collateralsData[uniqueId].clfs = await computeMarketCLFBiggestDailyChange(marketId, assetParameters, collateralToken.symbol, baseAsset, fromBlocks, endBlock, startDateUnixSec, web3Provider, vaultName, basePrice, quotePrice);
        }
    }

    return resultsData;
}

function getLiquidationBonusForLtv(ltv) {
    switch (ltv) {
        default: 
            throw new Error(`No liquidation bonus for ltv ${ltv}`);
        case 0.98:
            return 50;
        case 0.965:
            return 100;
        case 0.945:
            return 150;
        case 0.915:
            return 250;
        case 0.86:
            return 400;
        case 0.77:
            return 700;
        case 0.625:
            return 1250;
    }
}

async function getVaultMarkets(vault, currentBlock) {
    try {
        const marketIds = [];
        const withdrawQueueLengthBn = await vault.withdrawQueueLength({blockTag: currentBlock});
        const vaultQueueLength = Number(withdrawQueueLengthBn.toString());
        for (let i = 0; i < vaultQueueLength; i++) {
            const marketId = await vault.withdrawQueue(i, {blockTag: currentBlock});
            marketIds.push(marketId);
        }
    
        return marketIds;
    } catch(e) {
        console.log('cannot find vault: vault does not exist yet');
        return [];
    }
}

async function getHistoricalPrice(tokenAddress, dateUnixSec) {
    const apiUrl = `https://coins.llama.fi/prices/historical/${dateUnixSec}/ethereum:${tokenAddress}?searchWidth=12h`;
    const historicalPriceResponse = await retry(axios.get, [apiUrl], 0, 100);
    return historicalPriceResponse.data.coins[`ethereum:${tokenAddress}`].price;
}

/**
 * 
 * @param {number} volatility 
 * @param {number} liquidity 
 * @param {number} liquidationBonus 
 * @param {number} ltv 
 * @param {number} borrowCap 
 * @returns 
 */
function findCLFFromParameters(volatility, liquidity, liquidationBonus, ltv, borrowCap) {
    ltv = Number(ltv) / 100;
    const sqrtResult = Math.sqrt(liquidity / borrowCap);
    const sqrtBySigma = sqrtResult / volatility;
    const ltvPlusBeta = Number(ltv) + Number(liquidationBonus);
    const lnLtvPlusBeta = Math.log(ltvPlusBeta);
    const c = -1 * lnLtvPlusBeta * sqrtBySigma;
    return c;
}

function findRiskLevelFromParameters(volatility, liquidity, liquidationBonus, ltv, borrowCap) {
    const sigma = volatility;
    const d = borrowCap;
    const beta = liquidationBonus;
    const l = liquidity;
    ltv = Number(ltv) / 100;

    const sigmaTimesSqrtOfD = sigma * Math.sqrt(d);
    const ltvPlusBeta = ltv + beta;
    const lnOneDividedByLtvPlusBeta = Math.log(1/ltvPlusBeta);
    const lnOneDividedByLtvPlusBetaTimesSqrtOfL = lnOneDividedByLtvPlusBeta * Math.sqrt(l);
    const r = sigmaTimesSqrtOfD / lnOneDividedByLtvPlusBetaTimesSqrtOfL;

    return r;
}

/**
 * 
 * @param {{collateralsData: {[collateralSymbol: string]: {collateral: {inKindSupply: number, usdSupply: number}, clfs: {7: {volatility: number, liquidity: number}, 30: {volatility: number, liquidity: number}, 180: {volatility: number, liquidity: number}}}}} poolData 
 * @returns 
 */
function computeAverageCLFForVault(poolData) {
    //get pool total collateral in usd
    let totalCollateral = 0;
    for (const value of Object.values(poolData.collateralsData)) {
        if (value) {
            totalCollateral += value.collateral.usdSupply;
        }
    }
    const weightMap = {};
    // get each collateral weight
    for (const [collateral, value] of Object.entries(poolData.collateralsData)) {
        if (value) {
            const weight = value.collateral.usdSupply / totalCollateral;
            const clf = value['clfs']['7']['7'] ? value['clfs']['7']['7'] : value['clfs']['30']['7'] ? value['clfs']['30']['7'] : value['clfs']['180']['7'];
            weightMap[collateral] = weight * clf;
        }
    }
    let weightedCLF = 0;
    for (const weight of Object.values(weightMap)) {
        weightedCLF += weight;
    }
    weightedCLF = roundTo(weightedCLF, 2);
    return { weightedCLF, totalCollateral };
}

/**
 * 
 * @param {{[baseAsset: string]: {totalCollateral: number, weightedCLF: number}}} protocolData 
 * @returns 
 */
function computeProtocolWeightedCLF(protocolData) {
    let protocolCollateral = 0;
    const weightMap = {};
    for (const marketData of Object.values(protocolData)) {
        if (marketData) {
            protocolCollateral += marketData['totalCollateral'];
        }
    }
    // get each collateral weight
    for (const [market, marketData] of Object.entries(protocolData)) {
        if (marketData) {
            const weight = marketData['totalCollateral'] / protocolCollateral;
            const clf = marketData['weightedCLF'];
            weightMap[market] = weight * clf;
        }
    }
    let weightedCLF = 0;
    for (const value of Object.values(weightMap)) {
        weightedCLF += value;
    }
    weightedCLF = roundTo(weightedCLF, 2);
    return weightedCLF;
}

function recordParameters(marketId, pair, data, timestamp) {
    const date = getDay(timestamp);
    if (!fs.existsSync(`${DATA_DIR}/clf/morpho/${date}`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/morpho/${date}`, {recursive: true});
    }
    const withUniqueId = pair.split('-')[0] + '_' + marketId + ('-') + pair.split('-')[1];

    const datedProtocolFilename = path.join(DATA_DIR, `clf/morpho/${date}/${date}_${withUniqueId}_morpho_CLFs.json`);
    const objectToWrite = JSON.stringify(data, null, 2);
    console.log('recording results');
    fs.writeFileSync(datedProtocolFilename, objectToWrite, 'utf8');
}

function recordResults(results, timestamp) {
    const date = getDay(timestamp);
    if (!fs.existsSync(`${DATA_DIR}/clf/morpho/${date}`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/morpho/${date}`, {recursive: true});
    }
    if (!fs.existsSync(`${DATA_DIR}/clf/morpho/latest`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/morpho/latest`, {recursive: true});
    }
    const datedProtocolFilename = path.join(DATA_DIR, `clf/morpho/${date}/${date}_morpho_CLFs.json`);
    const latestFullFilename = path.join(DATA_DIR, 'clf/morpho/latest/morpho_CLFs.json');
    const objectToWrite = JSON.stringify(results, null, 2);
    console.log('recording results');
    fs.writeFileSync(datedProtocolFilename, objectToWrite, 'utf8');
    fs.writeFileSync(latestFullFilename, objectToWrite, 'utf8');

}


/**
 * 
 * @param {{liquidationBonusBPS: number, supplyCap: number, LTV: number}} assetParameters 
 * @param {{index: number, symbol: string, volatilityPivot: string, address: string, coinGeckoID: string}} collateral 
 * @param {string} baseAsset 
 * @param {{[span: number]: number}]} fromBlocks 
 * @param {number} endBlock 
 * @returns {Promise<{7: {volatility: number, liquidity: number}, 30: {volatility: number, liquidity: number}, 180: {volatility: number, liquidity: number}}>}
 */
async function computeMarketCLFBiggestDailyChange(marketId, assetParameters, collateralSymbol , baseAsset, fromBlocks, endBlock, startDateUnixSec, web3Provider, vaultname, basePrice, quotePrice) {
    // for ETH vault, for the wstETH/WETH market, collateralSymbol = wstETH, baseAsset = WETH
    const startDate = new Date(startDateUnixSec * 1000);

    const parameters = {};

    // for each platform, compute the volatility and the avg liquidity
    const rollingVolatility = await getRollingVolatility('all', collateralSymbol, baseAsset, web3Provider);
    const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= endBlock && _.blockEnd >= endBlock)[0];
    
    let volatility = 0;
    if(volatilityAtBlock) {
        volatility = volatilityAtBlock.current;
    } else if(rollingVolatility.latest && rollingVolatility.latest.current) {
        volatility = rollingVolatility.latest.current;
    }
    else {
        throw new Error('CANNOT FIND VOLATILITY');
    }

    console.log(`[${collateralSymbol}-${baseAsset}] volatility: ${roundTo(volatility*100)}%`);

    for (const span of spans) {
        parameters[span] = {
            volatility,
            liquidityUsd: 0,
        };
    }
    
    // compute the liquidity data for each spans
    for (const span of spans) {
        const fromBlock = fromBlocks[span];
        const avgLiquidity = await getLiquidityAverageV2('all', collateralSymbol, baseAsset, fromBlock, endBlock);
        const liquidityToAdd = avgLiquidity.slippageMap[assetParameters.liquidationBonusBPS];
        // FOR wstETH/ETH market, this liquidity is in wstETH, need to change to usd before calling the risk compute function
        parameters[span].liquidityUsd = liquidityToAdd * quotePrice; 
        console.log(`[${collateralSymbol}-${baseAsset}] [${span}d] all dexes liquidity: ${liquidityToAdd}`);
    }

    console.log('parameters', parameters);


    recordParameters(marketId, `${collateralSymbol}-${baseAsset}`, { parameters, assetParameters }, startDate, vaultname);
    /// compute CLFs for all spans and all volatilities
    const results = {};
    for(const volatilitySpan of spans) {
        results[volatilitySpan] = {};
        for(const liquiditySpan of spans) {

            // supplyCap is in baseAsset (WETH for the WETH vault)
            // and liquidity is in collateral (wstETH for the wstETH/WETH market)
            // so we need to translate everything to $ before computing the risk level
            const capInUSD = assetParameters.supplyCap * basePrice;
            const liquidityInUSD = parameters[liquiditySpan].liquidityUsd;
            results[volatilitySpan][liquiditySpan] = findRiskLevelFromParameters(
                parameters[volatilitySpan].volatility,
                liquidityInUSD,
                assetParameters.liquidationBonusBPS / 10000,
                assetParameters.LTV,
                capInUSD);
        }
    }
    
    console.log('results', results);
    return results;
}


module.exports = { morphoFlagshipComputer };

const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const { fnName, getDay, roundTo, retry } = require('../../utils/utils');
const fs = require('fs');
const { default: axios } = require('axios');
dotenv.config();
const { getBlocknumberForTimestamp } = require('../../utils/web3.utils');
const { normalize, getConfTokenBySymbol } = require('../../utils/token.utils');
const { compoundV3Pools, cometABI } = require('./compoundV3Computer.config');
const { RecordMonitoring } = require('../../utils/monitoring');
const { DATA_DIR, PLATFORMS, REFERENCE_BLOCK } = require('../../utils/constants');
const { getLiquidity, getRollingVolatility } = require('../../data.interface/data.interface');
const { computeParkinsonVolatility, computeBiggestDailyChange, medianPricesOverBlocks, rollingBiggestDailyChange } = require('../../utils/volatility');
const { getPricesAtBlockForIntervalViaPivot } = require('../../data.interface/internal/data.interface.utils');
const spans = [7, 30, 180];

/**
 * Compute the CLFs values for compound v3
 * @param {number} fetchEveryMinutes 
 */
async function compoundV3Computer(fetchEveryMinutes, startDate=Date.now()) {
    const MONITORING_NAME = 'CompoundV3 CLF Computer';
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
        /// for all pools in compound v3
        for (const pool of Object.values(compoundV3Pools)) {
            results[pool.baseAsset] = await computeCLFForPool(pool.cometAddress, pool.baseAsset, Object.values(pool.collateralTokens), web3Provider, fromBlocks, currentBlock, startDateUnixSecond);
            const averagePoolData = computeAverageCLFForPool(results[pool.baseAsset]);
            results[pool.baseAsset]['weightedCLF'] = averagePoolData.weightedCLF;
            results[pool.baseAsset]['totalCollateral'] = averagePoolData.totalCollateral;
            averagePerAsset[pool.baseAsset] = averagePoolData;
            // console.log(`results[${pool.baseAsset}]`, results[pool.baseAsset]);
        }

        let protocolWeightedCLF = undefined;
        try {
            protocolWeightedCLF = computeProtocolWeightedCLF(averagePerAsset);
        }
        catch (error) {
            console.error(error);
        }
        const toRecord = {
            protocol: 'compound v3',
            weightedCLF: protocolWeightedCLF,
            results
        };

        console.log('firing record function');
        recordResults(toRecord, startDate);

        console.log('CompoundV3 CLF Computer: ending');

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
 * Compute CLF value for a pool
 * @param {string} cometAddress 
 * @param {string} baseAsset 
 * @param {{index: number, symbol: string, address: string, coinGeckoID: string}[]} collaterals 
 * @param {ethers.providers.StaticJsonRpcProvider} web3Provider 
 * @param {{[span: number]: number}} fromBlocks 
 * @param {number} endBlock 
 * @returns {Promise<{collateralsData: {[collateralSymbol: string]: {collateral: {inKindSupply: number, usdSupply: number}, clfs: {7: {volatility: number, liquidity: number}, 30: {volatility: number, liquidity: number}, 180: {volatility: number, liquidity: number}}}}>}
 */
async function computeCLFForPool(cometAddress, baseAsset, collaterals, web3Provider, fromBlocks, endBlock, startDateUnixSec) {
    const resultsData = {
        collateralsData: {}
    };

    console.log(`Started work on Compound v3 --- ${baseAsset} --- pool`);
    const cometContract = new ethers.Contract(cometAddress, cometABI, web3Provider);
    /// for all collaterals in selected pool
    for (const collateral of collaterals) {
        try {
            console.log(`Computing CLFs for ${collateral.symbol}`);
            const assetParameters = await getAssetParameters(cometContract, collateral, endBlock);
            console.log('assetParameters', assetParameters);
            resultsData.collateralsData[collateral.symbol] = {};
            resultsData.collateralsData[collateral.symbol].collateral = await getCollateralAmount(collateral, cometContract, startDateUnixSec, endBlock);
            console.log('collateral data', resultsData.collateralsData[collateral.symbol].collateral);
            // resultsData.collateralsData[collateral.symbol].clfs = await computeMarketCLF(assetParameters, collateral, baseAsset, fromBlocks, endBlock, startDateUnixSec);
            resultsData.collateralsData[collateral.symbol].clfs = await computeMarketCLFBiggestDailyChange(assetParameters, collateral, baseAsset, fromBlocks, endBlock, startDateUnixSec, web3Provider);
            
            // resultsData.collateralsData[collateral.symbol].liquidityHistory = await computeLiquidityHistory(collateral, fromBlocks, endBlock, baseAsset, assetParameters);
            console.log('resultsData', resultsData);
        }
        catch (error) {
            console.error('error', error);
            resultsData[collateral.symbol] = null;
        }
    }
    return resultsData;
}

/**
 * Get collateral amount from on-chaind data
 * @param {{index: number, symbol: string, address: string, coinGeckoID: string}} collateral 
 * @param {ethers.Contract} cometContract 
 * @returns 
 */
async function getCollateralAmount(collateral, cometContract, priceDateUnixSeconds, currentBlock) {
    const [totalSupplyAsset] = await cometContract.totalsCollateral(collateral.address, {blockTag: currentBlock});
    const decimals = getConfTokenBySymbol(collateral.symbol).decimals;
    let price = undefined;
    const apiUrl = `https://coins.llama.fi/prices/historical/${priceDateUnixSeconds}/ethereum:${collateral.address}?searchWidth=12h`;

    const historicalPriceResponse = await retry(axios.get, [apiUrl], 0, 100);
    try {
        price = historicalPriceResponse.data.coins[`ethereum:${collateral.address}`].price;
    }
    catch (error) {
        console.error('error fetching price', error);
        price = 0;
    }

    const totalSupplyNormalized = normalize(totalSupplyAsset, decimals);
    const results = {
        inKindSupply: totalSupplyNormalized,
        usdSupply: totalSupplyNormalized * price
    };
    return results;
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
async function computeMarketCLF(assetParameters, collateral , baseAsset, fromBlocks, endBlock, startDateUnixSec) {
    const startDate = new Date(startDateUnixSec * 1000);
    const from = collateral.symbol;

    const parameters = {};

    // for each platform, compute the volatility and the avg liquidity
    // only request one data (the biggest span) and recompute the avg for each spans
    const maxSpan = Math.max(...spans);

    for(const platform of PLATFORMS) {
        const oldestBlock = fromBlocks[maxSpan];
        const fullLiquidityDataForPlatform = getLiquidity(platform, from, baseAsset, oldestBlock, endBlock);
        const fullPricesAtBlock = getPricesAtBlockForIntervalViaPivot(platform, from, baseAsset, oldestBlock, endBlock, collateral.volatilityPivot);
        if(!fullLiquidityDataForPlatform) {
            continue;
        } 
        
        if(!fullPricesAtBlock) {
            continue;
        }

        const allBlockNumbers = Object.keys(fullLiquidityDataForPlatform).map(_ => Number(_));
        const allPricesBlockNumbers = Object.keys(fullPricesAtBlock).map(_ => Number(_));
        // compute the data for each spans
        for (const span of spans) {
            const fromBlock = fromBlocks[span];
            const blockNumberForSpan = allBlockNumbers.filter(_ => _ >= fromBlock); 
            const priceBlockNumberForSpan = allPricesBlockNumbers.filter(_ => _ >= fromBlock); 

            let volatilityToAdd = 0;
            let liquidityToAdd = 0;
            if(blockNumberForSpan.length > 0) {
                let sumLiquidityForTargetSlippageBps = 0;
                for(const blockNumber of blockNumberForSpan) {
    
                    sumLiquidityForTargetSlippageBps += fullLiquidityDataForPlatform[blockNumber].slippageMap[assetParameters.liquidationBonusBPS].base;
                }
    
                liquidityToAdd = sumLiquidityForTargetSlippageBps / blockNumberForSpan.length;
            }

            if(priceBlockNumberForSpan.length > 0) {
                const pricesAtBlock = {};
                for(const blockNumber of priceBlockNumberForSpan) {
                    pricesAtBlock[blockNumber] = fullPricesAtBlock[blockNumber];
                }

                volatilityToAdd = computeParkinsonVolatility(pricesAtBlock, from, baseAsset, fromBlock, endBlock, span);
            }

            if(!parameters[span]) {
                parameters[span] = {
                    volatility: 0,
                    liquidity: 0,
                    // the weight will be calculated as the avg liquidity available
                    volatilityWeight: 0

                };
            }

            // here the volatility is stored weighted by the available liquidity
            parameters[span].volatility += volatilityToAdd * liquidityToAdd;
            parameters[span].liquidity += liquidityToAdd;
            if(volatilityToAdd > 0) {
                parameters[span].volatilityWeight += liquidityToAdd;
            }

            console.log(`[${from}-${baseAsset}] [${span}d] [${platform}] volatility: ${roundTo(volatilityToAdd*100, 2)}%`);
            console.log(`[${from}-${baseAsset}] [${span}d] [${platform}] liquidity: ${liquidityToAdd}`);
        }
    }

    // at the end, avg the volatility
    for(const span of spans) {
        parameters[span].volatility = parameters[span].volatility / parameters[span].volatilityWeight;
    }

    console.log('parameters', parameters);
    recordParameters(`${from}-${baseAsset}`, { parameters, assetParameters }, startDate);
    
    /// compute CLFs for all spans and all volatilities
    const results = {};
    for (let i = 0; i < spans.length; i++) {
        const volatilitySpan = spans[i];
        results[volatilitySpan] = {};
        for (let j = 0; j < spans.length; j++) {
            const liquiditySpan = spans[j];
            if (parameters[volatilitySpan].volatility !== 0) {
                let volatilityToUse = parameters[volatilitySpan].volatility;
                if(volatilityToUse < 1 / 10000) {
                    volatilityToUse = parameters[spans[i+1]].volatility;
                }

                results[volatilitySpan][liquiditySpan] = findRiskLevelFromParameters(volatilityToUse, parameters[liquiditySpan].liquidity, assetParameters.liquidationBonusBPS / 10000, assetParameters.LTV, assetParameters.supplyCap * assetParameters.LTV / 100);
            }
        }
    }
    console.log('results', results);
    return results;
}

/**
 * 
 * @param {ethers.Contract} cometContract 
 * @param {{index: number, symbol: string, address: string, coinGeckoID: string}} collateral 
 * @param {number} currentBlock 
 * @returns 
 */
async function getAssetParameters(cometContract, collateral, currentBlock) {
    const results = await cometContract.getAssetInfo(collateral.index, {blockTag: currentBlock});
    const liquidationBonusBPS = Math.round((1 - normalize(results.liquidationFactor, 18)) * 10000);
    const LTV = normalize(results.liquidateCollateralFactor, 18) * 100;
    const tokenConf = getConfTokenBySymbol(collateral.symbol);
    const supplyCap = normalize(results.supplyCap, tokenConf.decimals);
    return { liquidationBonusBPS, supplyCap, LTV };

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
function computeAverageCLFForPool(poolData) {
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

function recordParameters(pair, data, timestamp) {
    const date = getDay(timestamp);
    if (!fs.existsSync(`${DATA_DIR}/clf/${date}`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/${date}`);
    }

    const datedProtocolFilename = path.join(DATA_DIR, `clf/${date}/${date}_${pair}_compoundv3_CLFs.json`);
    const objectToWrite = JSON.stringify(data, null, 2);
    console.log('recording results');
    try {
        fs.writeFileSync(datedProtocolFilename, objectToWrite, 'utf8');
    }
    catch (error) {
        console.error(error);
        console.log('Compound Computer failed to write files');
    }
}

function recordResults(results, timestamp) {
    const date = getDay(timestamp);
    if (!fs.existsSync(`${DATA_DIR}/clf/${date}`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/${date}`);
    }
    if (!fs.existsSync(`${DATA_DIR}/clf/latest`)) {
        fs.mkdirSync(`${DATA_DIR}/clf/latest`);
    }
    const datedProtocolFilename = path.join(DATA_DIR, `clf/${date}/${date}_compoundv3_CLFs.json`);
    const latestFullFilename = path.join(DATA_DIR, 'clf/latest/compoundv3_CLFs.json');
    const objectToWrite = JSON.stringify(results, null, 2);
    console.log('recording results');
    try {
        fs.writeFileSync(datedProtocolFilename, objectToWrite, 'utf8');
        fs.writeFileSync(latestFullFilename, objectToWrite, 'utf8');
    }
    catch (error) {
        console.error(error);
        console.log('Compound Computer failed to write files');
    }
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
async function computeMarketCLFBiggestDailyChange(assetParameters, collateral , baseAsset, fromBlocks, endBlock, startDateUnixSec, web3Provider) {
    const startDate = new Date(startDateUnixSec * 1000);
    const from = collateral.symbol;

    const parameters = {};

    // for each platform, compute the volatility and the avg liquidity
    // only request one data (the biggest span) and recompute the avg for each spans
    const maxSpan = Math.max(...spans);

    for(const platform of PLATFORMS) {
        const oldestBlock = fromBlocks[maxSpan];
        const fullLiquidityDataForPlatform = getLiquidity(platform, from, baseAsset, oldestBlock, endBlock);
        if(!fullLiquidityDataForPlatform) {
            continue;
        }

        const rollingVolatility = await getRollingVolatility(platform, from, baseAsset, endBlock, web3Provider);

        const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= endBlock && _.blockEnd >= endBlock)[0];

        if(!volatilityAtBlock) {
            throw new Error(`Could not find volatility data for block ${endBlock}`);
        }

        const allBlockNumbers = Object.keys(fullLiquidityDataForPlatform).map(_ => Number(_));
        // compute the data for each spans
        for (const span of spans) {
            const fromBlock = fromBlocks[span];
            const blockNumberForSpan = allBlockNumbers.filter(_ => _ >= fromBlock); 

            let volatilityToAdd = volatilityAtBlock.current;
            let liquidityToAdd = 0;
            if(blockNumberForSpan.length > 0) {
                let sumLiquidityForTargetSlippageBps = 0;
                for(const blockNumber of blockNumberForSpan) {
    
                    sumLiquidityForTargetSlippageBps += fullLiquidityDataForPlatform[blockNumber].slippageMap[assetParameters.liquidationBonusBPS].base;
                }
    
                liquidityToAdd = sumLiquidityForTargetSlippageBps / blockNumberForSpan.length;
            }

            // if(priceBlockNumberForSpan.length > 0) {
            //     const pricesAtBlock = {};
            //     for(const blockNumber of priceBlockNumberForSpan) {
            //         pricesAtBlock[blockNumber] = fullPricesAtBlock[blockNumber];
            //     }

            //     volatilityToAdd = computeParkinsonVolatility(pricesAtBlock, from, baseAsset, fromBlock, endBlock, span);
            // }

            if(!parameters[span]) {
                parameters[span] = {
                    volatility: 0,
                    liquidity: 0,
                    // the weight will be calculated as the avg liquidity available
                    volatilityWeight: 0

                };
            }

            // here the volatility is stored weighted by the available liquidity
            parameters[span].volatility += volatilityToAdd * liquidityToAdd;
            parameters[span].liquidity += liquidityToAdd;
            if(volatilityToAdd > 0) {
                parameters[span].volatilityWeight += liquidityToAdd;
            }

            console.log(`[${from}-${baseAsset}] [${span}d] [${platform}] volatility: ${roundTo(volatilityToAdd*100, 2)}%`);
            console.log(`[${from}-${baseAsset}] [${span}d] [${platform}] liquidity: ${liquidityToAdd}`);
        }
    }

    // at the end, avg the volatility
    for(const span of spans) {
        parameters[span].volatility = parameters[span].volatility / parameters[span].volatilityWeight;
    }

    console.log('parameters', parameters);


    recordParameters(`${from}-${baseAsset}`, { parameters, assetParameters }, startDate);
    /// compute CLFs for all spans and all volatilities
    const results = {};
    for (let i = 0; i < spans.length; i++) {
        const volatilitySpan = spans[i];
        results[volatilitySpan] = {};
        for (let j = 0; j < spans.length; j++) {
            const liquiditySpan = spans[j];
            if (parameters[volatilitySpan].volatility !== 0) {
                let volatilityToUse = parameters[volatilitySpan].volatility;
                if(volatilityToUse < 1 / 10000) {
                    volatilityToUse = parameters[spans[i+1]].volatility;
                }

                results[volatilitySpan][liquiditySpan] = findRiskLevelFromParameters(volatilityToUse, parameters[liquiditySpan].liquidity, assetParameters.liquidationBonusBPS / 10000, assetParameters.LTV, assetParameters.supplyCap * assetParameters.LTV / 100);
            }
        }
    }
    console.log('results', results);
    return results;
}

module.exports = { compoundV3Computer };

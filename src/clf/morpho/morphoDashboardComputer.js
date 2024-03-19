const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const { fnName, roundTo, retry } = require('../../utils/utils');
const fs = require('fs');
const { default: axios } = require('axios');
dotenv.config();
const { normalize, getConfTokenBySymbol, getTokenSymbolByAddress } = require('../../utils/token.utils');
const { config, morphoBlueAbi, metamorphoAbi } = require('./morphoFlagshipComputer.config');
const { RecordMonitoring } = require('../../utils/monitoring');
const { DATA_DIR, BLOCK_PER_DAY } = require('../../utils/constants');



/**
 * Compute the Summary values for Morpho
 * @param {number} fetchEveryMinutes 
 */
async function morphoDashboardSummaryComputer(fetchEveryMinutes) {
    const MONITORING_NAME = 'Morpho Flagship Dashboard Summary Computer';
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

        console.log(new Date(start));
        console.log(`${fnName()}: starting`);
        const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
        const currentBlock = await web3Provider.getBlockNumber();
        const fromBlock = currentBlock - (30 * BLOCK_PER_DAY);

        const results = {};

        /// for all vaults in morpho config
        for (const vault of Object.values(config.vaults)) {
            const riskDataForVault = await computeSummaryForVault(config.blueAddress, vault.address, vault.baseAsset, web3Provider, fromBlock, currentBlock);
            if (riskDataForVault) {
                results[vault.baseAsset] = riskDataForVault;
                console.log(`results[${vault.baseAsset}]`, results[vault.baseAsset]);
            } else {
                console.log(`not data for vault ${vault.name}`);
            }
        }
        
        if (!fs.existsSync(`${DATA_DIR}/precomputed/morpho-dashboard/`)) {
            fs.mkdirSync(`${DATA_DIR}/precomputed/morpho-dashboard/`, { recursive: true });
        }
        const summaryFilePath = path.join(DATA_DIR, 'precomputed/morpho-dashboard/morpho-summary.json');
        const objectToWrite = JSON.stringify(results, null, 2);
        fs.writeFileSync(summaryFilePath, objectToWrite, 'utf8');
        console.log('Morpho Dashboard Summary Computer: ending');

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
 * Computes a summary for a vault, including its overall risk level and detailed metrics for each of its sub-markets.
 * 
 * @param {string} blueAddress The address of the Morpho Blue contract.
 * @param {string} vaultAddress The address of the Metamorpho Vault contract.
 * @param {string} baseAsset The symbol of the base asset in the vault.
 * @param {ethers.providers.StaticJsonRpcProvider} web3Provider A web3 provider instance for blockchain interaction.
 * @param {number} fromBlock The starting block number for historical data queries.
 * @param {number} endBlock The ending block number for historical data queries.
 * @param {number} startDateUnixSec The start date in Unix seconds for price history queries.
 * 
 * @returns {Promise<{
 *   riskLevel: number,
 *   subMarkets: Array<{
 *     quote: string, // The symbol of the collateral asset
 *     LTV: number, // The loan-to-value ratio
 *     liquidationBonus: number, // The liquidation bonus as a percentage
 *     supplyCapInKind: number, // The supply cap in base asset kind
 *     supplyCapUsd: number, // The supply cap in USD
 *     basePrice: number, // The price of the base asset at the start date
 *     quotePrice: number, // The price of the collateral asset at the start date
 *     riskLevel: number, // The calculated risk level for the sub-market
 *     volatility: number, // The volatility of the sub-market asset
 *     liquidityInKind: number // The liquidity of the sub-market asset
 *     liquidityUsd: number // The liquidity of the sub-market asset
 *   }>
 * }>} A promise that resolves to an object containing the overall risk level of the vault and an array of objects representing each sub-market's metrics.
 * 
 * This function assesses the risk level of a vault by calculating the risk metrics for each of its sub-markets based on
 * the market configuration, historical price data, and the provided asset parameters. The overall risk level of the vault
 * is determined by the highest risk level among its sub-markets.
 */
async function computeSummaryForVault(blueAddress, vaultAddress, baseAsset, web3Provider, fromBlock, endBlock) {
    const vaultData = {
        'riskLevel': 0,
        'loanAssetPrice': 0,
        'subMarkets': []
    };

    console.log(`Started work on Morpho flagship --- ${baseAsset} --- vault`);
    const morphoBlue = new ethers.Contract(blueAddress, morphoBlueAbi, web3Provider);
    const metamorphoVault = new ethers.Contract(vaultAddress, metamorphoAbi, web3Provider);

    // find the vault markets
    const marketIds = await getVaultMarkets(metamorphoVault);

    if (marketIds.length == 0) {
        return undefined;
    }

    const baseToken = getConfTokenBySymbol(baseAsset);

    // compute summary data for all markets with a collateral
    for (const marketId of marketIds) {
        const marketParams = await morphoBlue.idToMarketParams(marketId);
        if (marketParams.collateralToken != ethers.constants.AddressZero) {
            const collateralTokenSymbol = getTokenSymbolByAddress(marketParams.collateralToken);
            console.log(`market collateral is ${collateralTokenSymbol}`);
            const collateralToken = getConfTokenBySymbol(collateralTokenSymbol);
            const marketConfig = await metamorphoVault.config(marketId);
            const blueMarket = await morphoBlue.market(marketId);
            // assetParameters { liquidationBonusBPS: 1200, supplyCap: 900000, LTV: 70 }
            const LTV = normalize(marketParams.lltv, 18);
            const liquidationBonusBPS = getLiquidationBonusForLtv(LTV);
            // max(config cap from metamorpho vault, current market supply)
            const configCap = normalize(marketConfig.cap, baseToken.decimals);
            const currentSupply = normalize(blueMarket.totalSupplyAssets, baseToken.decimals);
            const supplyCap = Math.max(configCap, currentSupply);
            
            const pairData = {
                base: collateralTokenSymbol,
                LTV: LTV,
                liquidationBonus: liquidationBonusBPS / 10000,
                supplyCapInKind: supplyCap
            };
            const marketPrice = await getPrice(baseToken.address);
            vaultData.loanAssetPrice = marketPrice;
            const basePrice = await getPrice(collateralToken.address);

            const supplyCapUsd = supplyCap * basePrice;
            pairData.supplyCapUsd = supplyCapUsd;

            pairData.basePrice = basePrice;
            const assetParameters = {
                liquidationBonusBPS,
                supplyCapUsd,
                LTV
            };

            const riskData = await computeMarketRiskLevel(assetParameters, collateralToken.symbol, baseAsset, fromBlock, endBlock, web3Provider, quotePrice);
            pairData.riskLevel = riskData.riskLevel;
            if (riskData.riskLevel > vaultData.riskLevel) {
                vaultData.riskLevel = riskData.riskLevel;
            }
            pairData.volatility = riskData.volatility;
            pairData.liquidityInKind = riskData.liquidityInKind;
            pairData.liquidityUsd = riskData.liquidityUsd;
            vaultData.subMarkets.push(pairData);
        }
    }

    return vaultData;
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

async function getVaultMarkets(vault) {
    try {
        const marketIds = [];
        const withdrawQueueLengthBn = await vault.withdrawQueueLength();
        const vaultQueueLength = Number(withdrawQueueLengthBn.toString());
        for (let i = 0; i < vaultQueueLength; i++) {
            const marketId = await vault.withdrawQueue(i);
            marketIds.push(marketId);
        }

        return marketIds;
    } catch (e) {
        console.warn(e);
        return [];
    }
}

async function getPrice(tokenAddress) {
    const apiUrl = `https://coins.llama.fi/prices/current/ethereum:${tokenAddress}?searchWidth=12h`;
    const priceResponse = await retry(axios.get, [apiUrl], 0, 100);
    return priceResponse.data.coins[`ethereum:${tokenAddress}`].price;
}

function findRiskLevelFromParameters(volatility, liquidity, liquidationBonus, ltv, borrowCap) {
    const sigma = volatility;
    const d = borrowCap;
    const beta = liquidationBonus;
    const l = liquidity;
    ltv = Number(ltv);

    const sigmaTimesSqrtOfD = sigma * Math.sqrt(d);
    const ltvPlusBeta = ltv + beta;
    const lnOneDividedByLtvPlusBeta = Math.log(1 / ltvPlusBeta);
    const lnOneDividedByLtvPlusBetaTimesSqrtOfL = lnOneDividedByLtvPlusBeta * Math.sqrt(l);
    const r = sigmaTimesSqrtOfD / lnOneDividedByLtvPlusBetaTimesSqrtOfL;

    return r;
}


/**
 * Computes the market risk level based on the biggest daily change in volatility and liquidity.
 * This calculation is used to assess the risk associated with a given market.
 * 
 * @param {{liquidationBonusBPS: number, supplyCapUsd: number, LTV: number}} assetParameters Asset parameters including liquidation bonus in basis points, supply cap, and loan-to-value ratio.
 * @param {string} collateralSymbol The symbol for the collateral asset.
 * @param {string} baseAsset The base asset symbol.
 * @param {number} fromBlock The starting block number for the calculation period.
 * @param {number} endBlock The ending block number for the calculation period.
 * @param {ethers.providers.StaticJsonRpcProvider} web3Provider The web3 provider for making blockchain calls.
 * @param {number} collateralPrice the collateral price (in usd)
 * @returns {Promise<{
 *   volatility: number,
 *   liquidity: number,
 *   riskLevel: number
 * }>} An object containing the computed volatility and liquidity of the market, as well as the overall risk level.
 * 
 * The function calculates volatility based on historical data up to `endBlock` and computes the average liquidity
 * within the specified block range (`fromBlock` to `endBlock`). The risk level is derived from these metrics in conjunction
 * with the provided asset parameters.
 */
async function computeMarketRiskLevel(assetParameters, collateralSymbol, baseAsset, fromBlock, endBlock, web3Provider, collateralPrice) {
    const toReturn = {
        riskLevel: 0,
        volatility: 0,
        liquidityUsd: 0,
        liquidityInKind: 0,
    };
    const from = collateralSymbol;
    const {volatility, liquidityInKind} = getLiquidityAndVolatilityFromDashboardData(from, baseAsset, assetParameters.liquidationBonusBPS);



    console.log(`[${from}-${baseAsset}] volatility: ${roundTo(volatility * 100)}%`);


    const liquidityUsd = liquidityInKind * collateralPrice; 
    console.log(`[${from}-${baseAsset}] [30d] all dexes liquidity: ${liquidityInKind}`);
    const computedRiskLevel = findRiskLevelFromParameters(volatility, liquidityUsd, assetParameters.liquidationBonusBPS / 10000, assetParameters.LTV, assetParameters.supplyCapUsd);
    
    toReturn.volatility = volatility;
    toReturn.liquidityInKind = liquidityInKind;
    toReturn.liquidityUsd = liquidityUsd;
    toReturn.riskLevel = computedRiskLevel;

    return toReturn;
}

function getLiquidityAndVolatilityFromDashboardData(base, quote, liquidationBonusBPS) {
    const filePath = path.join(DATA_DIR, 'precomputed', 'dashboard', `${base}-${quote}-all.json`);
    const dashboardData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const dataKeys = Object.keys(dashboardData.liquidity);
    const latestKey = dataKeys[dataKeys.length - 1];
    const liquidityData = dashboardData.liquidity[latestKey];
    const volatilityData = liquidityData.volatility;
    const slippageMap = liquidityData.avgSlippageMap;
    return {volatility: volatilityData, liquidityInKind: slippageMap[liquidationBonusBPS].base};
}


module.exports = { morphoDashboardSummaryComputer };

const { computeAggregatedVolumeFromPivot } = require('../../utils/aggregator');
const { DEFAULT_STEP_BLOCK } = require('../../utils/constants');
const { fnName } = require('../../utils/utils');
const { getUnifiedDataForInterval, getBlankUnifiedData, getDefaultSlippageMap } = require('./data.interface.utils');

const PIVOTS = ['USDC', 'WETH', 'WBTC'];

/**
 * Get the average liquidity in a block interval, for a platform, with or without pivot route jumps
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {string} platform
 * @param {bool} withJumps 
 */
function getAverageLiquidityForInterval(fromSymbol, toSymbol, fromBlock, toBlock, platform, withJumps) {

    const liquidityDataForInterval = getSlippageMapForInterval(fromSymbol, toSymbol, fromBlock, toBlock, platform, withJumps);

    if(!liquidityDataForInterval || Object.keys(liquidityDataForInterval).length == 0) {
        return {avgPrice: 0, avgSlippageMap: getDefaultSlippageMap()};
    }

    const avgData = computeAverageData(liquidityDataForInterval, fromBlock, toBlock);

    return avgData;
}

/**
 * Get the slippage map for a pair
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {string} platform
 * @param {bool} withJumps 
 * @param {stepBlock} stepBlock 
 */
function getSlippageMapForInterval(fromSymbol, toSymbol, fromBlock, toBlock, platform, withJumps, stepBlock=DEFAULT_STEP_BLOCK) {
    // with jumps mean that we will try to add pivot routes (with WBTC, WETH and USDC as pivot)
    if(withJumps) {
        const liquidityDataWithJumps = getSlippageMapForIntervalWithJumps(fromSymbol, toSymbol, fromBlock, toBlock, platform, stepBlock);
        return liquidityDataWithJumps;
    } else {
        const liquidityData = getUnifiedDataForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, []);
        return liquidityData;
    }
}

/**
 * Compute average slippage map and price
 * @param {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: number}}}} liquidityDataForInterval 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @returns {{avgPrice: number, avgSlippageMap: {[slippageBps: number]: {base: number, quote: number}}}
 */
function computeAverageData(liquidityDataForInterval, fromBlock, toBlock) {
    let dataToUse = liquidityDataForInterval[fromBlock];
    const avgSlippageMap = getDefaultSlippageMap();

    let avgPrice = 0;
    let cptValues = 0;
    for (let targetBlock = fromBlock; targetBlock <= toBlock; targetBlock++) {
        cptValues++;
        if (liquidityDataForInterval[targetBlock]) {
            dataToUse = liquidityDataForInterval[targetBlock];
        }

        avgPrice += dataToUse.price;
        for (const slippageBps of Object.keys(avgSlippageMap)) {
            avgSlippageMap[slippageBps].base += dataToUse.slippageMap[slippageBps].base;
            avgSlippageMap[slippageBps].quote += dataToUse.slippageMap[slippageBps].quote;
        }
    }

    avgPrice = avgPrice / cptValues;

    for (const slippageBps of Object.keys(avgSlippageMap)) {
        avgSlippageMap[slippageBps].base = avgSlippageMap[slippageBps].base / cptValues;
        avgSlippageMap[slippageBps].quote = avgSlippageMap[slippageBps].quote / cptValues;
    }

    return {avgPrice: avgPrice, avgSlippageMap: avgSlippageMap};
}

/**
 * Get the slippage maps for each blocks of the interval
 * Using WBTC, WETH and USDC as pivot to try to find aggregated volumes
 * example, for UNI->USDC, we will add UNI/USDC volume to UNI->WETH->USDC and UNI->WBTC->USDC volumes
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {string}  
 * @returns {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}}}
 */
function getSlippageMapForIntervalWithJumps(fromSymbol, toSymbol, fromBlock, toBlock, platform, stepBlock=DEFAULT_STEP_BLOCK) {
    const liquidityData = {};
    const alreadyUsedPools = [];
    let data = getUnifiedDataForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
    
    const pivots = structuredClone(PIVOTS);
    if([fromSymbol, toSymbol].includes('stETH')) {
        pivots.push('wstETH');
    }
    if([fromSymbol, toSymbol].includes('wstETH')) {
        pivots.push('stETH');
    }

    const pivotData = getPivotUnifiedData(pivots, platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
    if(!data) {
        // if no data and no pivot data, can return undefined: we don't have any liquidity even
        // from jump routes
        if(Object.keys(pivotData).length == 0) {
            return undefined;
        }
        // if no data found for fromSymbol/toSymbol but some pivot data are available, consider base data blank 
        // but we will still try to add "jump routes" to this empty base.
        // Good example is sushiswap COMP/USDC which is an empty pool but we have COMP/WETH and WETH/USDC
        // available. So even if COMP/USDC is empty, we will still use the liquidity from COMP/WETH and WETH/USDC 
        // to get some liquidity for COMP/USDC
        else {
            data = getBlankUnifiedData(fromBlock, toBlock, stepBlock);
        }
    }

    for(const [blockNumber, platformData] of Object.entries(data)) {
        liquidityData[blockNumber] = {
            price: platformData.price,
            slippageMap: getDefaultSlippageMap(),
        };

        const aggregatedSlippageMap = platformData.slippageMap ? structuredClone(platformData.slippageMap) : getDefaultSlippageMap();

        // try to add pivot routes
        for(const pivot of pivots) {
            if(fromSymbol == pivot) {
                continue;
            }
            if(toSymbol == pivot) {
                continue;
            }

            const segment1DataForBlock = getPivotDataForBlock(pivotData, fromSymbol, pivot, blockNumber);
                
            if(!segment1DataForBlock) {
                continue;
            }

            const segment2DataForBlock = getPivotDataForBlock(pivotData, pivot, toSymbol, blockNumber);
            if(!segment2DataForBlock) {
                continue;
            }

            if(!liquidityData[blockNumber].price) {
                const computedPrice = segment1DataForBlock.price * segment2DataForBlock.price;
                liquidityData[blockNumber].price = computedPrice;
            }


            for(const slippageBps of Object.keys(aggregatedSlippageMap)) {
                const aggregVolume = computeAggregatedVolumeFromPivot(segment1DataForBlock.slippageMap, segment2DataForBlock.slippageMap, slippageBps);
                aggregatedSlippageMap[slippageBps].base += aggregVolume.base;
                aggregatedSlippageMap[slippageBps].quote += aggregVolume.quote;
            }
        }

        for(const slippageBps of Object.keys(aggregatedSlippageMap)) {
            const slippageToAdd = aggregatedSlippageMap[slippageBps];
            liquidityData[blockNumber].slippageMap[slippageBps].base += slippageToAdd.base;
            liquidityData[blockNumber].slippageMap[slippageBps].quote += slippageToAdd.quote;
        }
    }

    console.log(`${fnName()}[${fromSymbol}/${toSymbol}]: used pivots ${pivots} and pools ${alreadyUsedPools}`);
    return liquidityData;
}

function getPivotDataForBlock(pivotData, base, quote, blockNumber) {
    if(!pivotData) {
        return undefined;
    }

    if(!pivotData[base]) {
        return undefined;
    }

    if(!pivotData[base][quote]) {
        return undefined;
    }

    if(!pivotData[base][quote][blockNumber]) {
        return undefined;
    }

    return pivotData[base][quote][blockNumber];
}

function getPivotUnifiedData(pivots, platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock=DEFAULT_STEP_BLOCK, alreadyUsedPools) {
    const pivotData = {};

    for (const pivot of pivots) {
        if (fromSymbol == pivot) {
            continue;
        }
        if (toSymbol == pivot) {
            continue;
        }

        const segment1Data = getUnifiedDataForInterval(platform, fromSymbol, pivot, fromBlock, toBlock, stepBlock, alreadyUsedPools);
        if (!segment1Data || Object.keys(segment1Data).length == 0) {
            continue;
        }

        const segment2Data = getUnifiedDataForInterval(platform, pivot, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
        if (!segment2Data || Object.keys(segment2Data).length == 0) {
            continue;
        }

        if (!pivotData[fromSymbol]) {
            pivotData[fromSymbol] = {};
        }

        if (!pivotData[pivot]) {
            pivotData[pivot] = {};
        }

        pivotData[fromSymbol][pivot] = segment1Data;
        pivotData[pivot][toSymbol] = segment2Data;
    }

    return pivotData;
}

module.exports = { getAverageLiquidityForInterval, getSlippageMapForInterval};
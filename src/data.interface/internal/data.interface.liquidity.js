const { computeAggregatedVolumeFromPivot } = require('../../utils/aggregator');
const { DEFAULT_STEP_BLOCK, PLATFORMS } = require('../../utils/constants');
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
        return liquidityData.unifiedData;
    }
}

/**
 * Compute average slippage map and price from a liquidity data
 * @param {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: number}}}} liquidityData
 * @returns {{price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}
 */
function computeAverageSlippageMap(liquidityData) {
    const avgSlippageMap = {
        price: 0,
        slippageMap: getDefaultSlippageMap()
    };
  
    // this is the number of data we will avg against
    const blockNumbers = Object.keys(liquidityData);
  
    // sum all values (price and liquidity for each slippage bps)
    for (const block of blockNumbers) {
        avgSlippageMap.price += liquidityData[block].price;
        for (const slippageBps of Object.keys(avgSlippageMap.slippageMap)) {
            avgSlippageMap.slippageMap[slippageBps].base += liquidityData[block].slippageMap[slippageBps].base;
            avgSlippageMap.slippageMap[slippageBps].quote += liquidityData[block].slippageMap[slippageBps].quote;
        }
    }
  
    // divide by the number of values ==> blockNumbers.length
    avgSlippageMap.price /= blockNumbers.length;
    for (const slippageBps of Object.keys(avgSlippageMap.slippageMap)) {
        avgSlippageMap.slippageMap[slippageBps].base /= blockNumbers.length;
        avgSlippageMap.slippageMap[slippageBps].quote /= blockNumbers.length;
    }
  
    return avgSlippageMap;
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
    if(data.unifiedData) {
        alreadyUsedPools.push(...data.usedPools);
    }
    
    const pivots = structuredClone(PIVOTS);
    const pivotData = getPivotUnifiedData(pivots, platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
    if(!data.unifiedData) {
        // if no data and no pivot data, can return undefined: we don't have any liquidity even
        // from jump routes
        if(Object.keys(pivotData).length == 0) {
            return undefined;
        } else {
            // if no data found for fromSymbol/toSymbol but some pivot data are available, consider base data blank 
            // but we will still try to add "jump routes" to this empty base.
            // Good example is sushiswap COMP/USDC which is an empty pool but we have COMP/WETH and WETH/USDC
            // available. So even if COMP/USDC is empty, we will still use the liquidity from COMP/WETH and WETH/USDC 
            // to get some liquidity for COMP/USDC
            data.unifiedData = getBlankUnifiedData(fromBlock, toBlock, stepBlock);
        }
    }

    for(const [blockNumber, platformData] of Object.entries(data.unifiedData)) {
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
        if (!segment1Data.unifiedData || Object.keys(segment1Data.unifiedData).length == 0) {
            continue;
        }

        // add the segment 1 used pools to alreadyUsedPools before checking for segment2 data
        const stepUsedPools = alreadyUsedPools.concat(segment1Data.usedPools);

        const segment2Data = getUnifiedDataForInterval(platform, pivot, toSymbol, fromBlock, toBlock, stepBlock, stepUsedPools);
        if (!segment2Data.unifiedData || Object.keys(segment2Data.unifiedData).length == 0) {
            continue;
        }

        alreadyUsedPools.push(...segment1Data.usedPools);
        alreadyUsedPools.push(...segment2Data.usedPools);

        if (!pivotData[fromSymbol]) {
            pivotData[fromSymbol] = {};
        }

        if (!pivotData[pivot]) {
            pivotData[pivot] = {};
        }

        pivotData[fromSymbol][pivot] = segment1Data.unifiedData;
        pivotData[pivot][toSymbol] = segment2Data.unifiedData;
    }

    return pivotData;
}

function getLiquidityAccrossDexes(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock = DEFAULT_STEP_BLOCK) {
    const liquidityData = {};

    // get the direct route liquidity from all dexes
    const data = getSumSlippageMapAcrossDexes(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock);

    // init to 0 if no data
    if (!data.unifiedData) {
        data.unifiedData = getBlankUnifiedData(fromBlock, toBlock, stepBlock);
        for (const block of Object.keys(data.unifiedData)) {
            data.unifiedData[block].slippageMap = getDefaultSlippageMap();
        }
    }

    const pivots = structuredClone(PIVOTS);
    const pivotData = getPivotUnifiedDataAccrossDexes(pivots, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, data.usedPools);

    for(const [blockNumber, platformData] of Object.entries(data.unifiedData)) {
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

    // console.log(`${fnName()}[${fromSymbol}/${toSymbol}]: used pivots ${pivots} and pools ${data.usedPools}`);
    // console.log(`[${fromSymbol}/${toSymbol}] | [ALL] | 5% slippage: ${liquidityData[fromBlock].slippageMap[500].base}`);

    return liquidityData;
}

function getPivotUnifiedDataAccrossDexes(pivots, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock=DEFAULT_STEP_BLOCK, alreadyUsedPools) {
    const pivotData = {};

    for (const pivot of pivots) {
        if (fromSymbol == pivot) {
            continue;
        }
        if (toSymbol == pivot) {
            continue;
        }

        const segment1Data = getSumSlippageMapAcrossDexes(fromSymbol, pivot, fromBlock, toBlock, stepBlock, alreadyUsedPools);
        if (!segment1Data.unifiedData || Object.keys(segment1Data.unifiedData).length == 0) {
            continue;
        }

        // add the segment 1 used pools to alreadyUsedPools before checking for segment2 data
        const stepUsedPools = alreadyUsedPools.concat(segment1Data.usedPools);

        const segment2Data = getSumSlippageMapAcrossDexes(pivot, toSymbol, fromBlock, toBlock, stepBlock, stepUsedPools);
        if (!segment2Data.unifiedData || Object.keys(segment2Data.unifiedData).length == 0) {
            continue;
        }

        alreadyUsedPools.push(...segment1Data.usedPools);
        alreadyUsedPools.push(...segment2Data.usedPools);

        if (!pivotData[fromSymbol]) {
            pivotData[fromSymbol] = {};
        }

        if (!pivotData[pivot]) {
            pivotData[pivot] = {};
        }

        pivotData[fromSymbol][pivot] = segment1Data.unifiedData;
        pivotData[pivot][toSymbol] = segment2Data.unifiedData;
    }

    return pivotData;
}

function getSumSlippageMapAcrossDexes(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, usedPools= []) {
    let baseData = undefined;

    for (const platform of PLATFORMS) {
        const platformData = getUnifiedDataForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, usedPools);
        if (platformData && platformData.unifiedData) {
            if (!baseData) {
                baseData = getBlankUnifiedData(fromBlock, toBlock, stepBlock);
            }
            usedPools.push(...platformData.usedPools);
            // console.log(`[${fromSymbol}/${toSymbol}] | [${platform}] | 5% slippage: ${platformData.unifiedData[fromBlock].slippageMap[500].base}`);

            for (const block of Object.keys(baseData)) {
                if (!baseData[block].price) {
                    baseData[block].price = platformData.unifiedData[block].price;
                }
                if (!baseData[block].slippageMap) {
                    baseData[block].slippageMap = platformData.unifiedData[block].slippageMap;
                } else {
                    for (const slippageBps of Object.keys(baseData[block].slippageMap)) {
                        baseData[block].slippageMap[slippageBps].base += platformData.unifiedData[block].slippageMap[slippageBps].base;
                        baseData[block].slippageMap[slippageBps].quote += platformData.unifiedData[block].slippageMap[slippageBps].quote;
                    }
                }
            }

        }
    }

    // if(baseData) {
    //     console.log(`[${fromSymbol}/${toSymbol}] | [ALL] | 5% slippage: ${baseData[fromBlock].slippageMap[500].base}`);
    // } else {
    //     console.log(`[${fromSymbol}/${toSymbol}] | [ALL] | NO DATA FOR ROUTE IN ANY DEXES`);
    // }

    return {unifiedData: baseData, usedPools: usedPools};
}


module.exports = { getAverageLiquidityForInterval, getSlippageMapForInterval, getLiquidityAccrossDexes, computeAverageSlippageMap, getSumSlippageMapAcrossDexes};
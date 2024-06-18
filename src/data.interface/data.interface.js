////////////////////////////////////////
/////// THIS IS THE DATA INTERFACE /////
// IT ALLOWS EASY ACCESS TO CSV DATA ///
/// IT SHOULD BE THE ONLY THING USED ///
/// TO ACCESS THE DATA GENERATED BY ////
//////////// THE FETCHERS //////////////

const { getPrices } = require('./internal/data.interface.price');
const lp_solve = require('@3lden/lp_solve');
const { getSlippageMapForInterval, getLiquidityAccrossDexes, getSumSlippageMapAcrossDexes, computeAverageSlippageMap } = require('./internal/data.interface.liquidity');
const { logFnDurationWithLabel } = require('../utils/utils');
const { PLATFORMS, DEFAULT_STEP_BLOCK, LAMBDA, BLOCK_PER_DAY, MAX_SLIPPAGE } = require('../utils/constants');
const { rollingBiggestDailyChange } = require('../utils/volatility');
const { getUnifiedDataForInterval, getLastMedianPriceForBlock } = require('./internal/data.interface.utils');
const { writeGLPMSpec, parseGLPMOutput } = require('../utils/glpm');
const { GetPairToUse, newAssetsForMinVolatility } = require('../global.config');
const fs = require('fs');
const { sleep } = require('../utils/utils');


const ALL_PIVOTS = [ 'USDT', 'mETH', 'WETH', 'USDC'];

//    _____  _   _  _______  ______  _____   ______        _____  ______     ______  _    _  _   _   _____  _______  _____  ____   _   _   _____ 
//   |_   _|| \ | ||__   __||  ____||  __ \ |  ____|/\    / ____||  ____|   |  ____|| |  | || \ | | / ____||__   __||_   _|/ __ \ | \ | | / ____|
//     | |  |  \| |   | |   | |__   | |__) || |__  /  \  | |     | |__      | |__   | |  | ||  \| || |        | |     | | | |  | ||  \| || (___  
//     | |  | . ` |   | |   |  __|  |  _  / |  __|/ /\ \ | |     |  __|     |  __|  | |  | || . ` || |        | |     | | | |  | || . ` | \___ \ 
//    _| |_ | |\  |   | |   | |____ | | \ \ | |  / ____ \| |____ | |____    | |     | |__| || |\  || |____    | |    _| |_| |__| || |\  | ____) |
//   |_____||_| \_|   |_|   |______||_|  \_\|_| /_/    \_\\_____||______|   |_|      \____/ |_| \_| \_____|   |_|   |_____|\____/ |_| \_||_____/ 
//                                                                                                                                               
// only use these functions when querying csv data :)                                                                                                                                               

/**
 * Get the slippage maps since fromBlock to toBlock
 * Aggregating from each 'platforms' requested and possibly using "jumps"
 * @param {string} fromSymbol base symbol (WETH, USDC...)
 * @param {string} toSymbol quote symbol (WETH, USDC...)
 * @param {number} fromBlock start block of the query (included)
 * @param {number} toBlock endblock of the query (included)
 * @param {string[] | undefined} platforms platforms (univ2, univ3...), default to PLATFORMS
 * @param {bool} withJumps default true. pivot route jump: from UNI to MKR, we will add "additional routes" using UNI->USDC->MKR + UNI->WETH->MKR + UNI->WBTC+MKR
 * @param {number} stepBlock default to 50. The amount of block between each data point
 * @returns {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}}}
 */
function getLiquidity(platform, fromSymbol, toSymbol, fromBlock, toBlock, withJumps = true, stepBlock = DEFAULT_STEP_BLOCK) {
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    checkPlatform(platform);
    const start = Date.now();
    const liquidity = getSlippageMapForInterval(actualFrom, actualTo, fromBlock, toBlock, platform, withJumps, stepBlock);
    logFnDurationWithLabel(start, `p: ${platform}, [${fromSymbol}/${toSymbol}], blocks: ${(toBlock-fromBlock)}, jumps: ${withJumps}, step: ${stepBlock}`);
    return liquidity;
}

async function getLiquidityV2(platform, fromSymbol, toSymbol, atBlock, step = 50, specificPivots = []) {
    return getLiquidityAverageV2(platform, fromSymbol, toSymbol, atBlock, atBlock, step, specificPivots);
}

/**
 * 
 * @param {*} platform 
 * @param {*} fromSymbol 
 * @param {*} toSymbol 
 * @param {*} fromBlock 
 * @param {*} toBlock 
 * @returns {Promise<{slippageMap: {[slippageBps: number]: number}}>}
 */
async function getLiquidityAverageV2(platform, fromSymbol, toSymbol, fromBlock, toBlock, step = 50, specificPivots = []) {
    const startDataFetch = Date.now();
    const start = Date.now();
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);

    // Remove base quote
    if(specificPivots.length > 0) {
        specificPivots = specificPivots.filter(e => e != fromSymbol && e != toSymbol); // remove actual from and actual to
    }
    
    const pivotsToUse = specificPivots.length === 0 ? getPivotsToUse(actualFrom, actualTo) : specificPivots;
    console.log('Pivot to use : ' + pivotsToUse);

    // generate list of routes
    const allPairs = getAllPairs(actualFrom, actualTo, pivotsToUse);

    const prices = {};
    prices['USDC'] = 1;
    const usedPools = [];

    let directRouteLiquidity = {};
    if(platform == 'all') {
        directRouteLiquidity = getSumSlippageMapAcrossDexes(actualFrom, actualTo, fromBlock, toBlock, DEFAULT_STEP_BLOCK, usedPools);
    } else {
        directRouteLiquidity = getUnifiedDataForInterval(platform, actualFrom, actualTo, fromBlock, toBlock, DEFAULT_STEP_BLOCK, usedPools);
    }

    if(directRouteLiquidity && directRouteLiquidity.unifiedData) {
        directRouteLiquidity.usedPools.forEach(pool => usedPools.push(pool));
        directRouteLiquidity = computeAverageSlippageMap(directRouteLiquidity.unifiedData);
    } else {
        directRouteLiquidity = undefined;
    }

    if(!prices[actualFrom]) {
        prices[actualFrom] = getLastMedianPriceForBlock('all', actualFrom, 'USDC', toBlock);
    }
    
    // get all the routes liquidities
    const pairData = {};
    for(const pair of allPairs) {
        // console.log(`[${pair.from}->${pair.to}] getting liquidity for pair. Currently used pools: ${usedPools.join(', ')}`);

        let liquidityData = {};
        if(platform == 'all') { 
            liquidityData = getSumSlippageMapAcrossDexes(pair.from, pair.to, fromBlock, toBlock, DEFAULT_STEP_BLOCK, usedPools);
        } else {
            liquidityData = getUnifiedDataForInterval(platform, pair.from, pair.to, fromBlock, toBlock, DEFAULT_STEP_BLOCK, usedPools);
        }
        
        if(!prices[pair.from]) {
            prices[pair.from] =  getLastMedianPriceForBlock('all', pair.from, 'USDC', toBlock);
        }

        if(!prices[pair.from]) {
            throw new Error(`Cannot find ${pair.from}/USDC price`);
        }

        if(liquidityData && liquidityData.unifiedData) {
            // console.log(`[${pair.from}->${pair.to}] liquidity found, used pools: ${liquidityData.usedPools.join(', ')}`);
            liquidityData.usedPools.forEach(pool => usedPools.push(pool));

            liquidityData = computeAverageSlippageMap(liquidityData.unifiedData);

            if(!pairData[pair.from]) {
                pairData[pair.from] = {};
            }
            if(!pairData[pair.from][pair.to]) {
                pairData[pair.from][pair.to] = {};
            }
    
            pairData[pair.from][pair.to] = liquidityData.slippageMap;
        } else {
            // console.log(`[${pair.from}->${pair.to}] no liquidity available for pair`);
        }
    }

    // const dup = {};
    // for(const pool of usedPools) {
    //     if(!dup[pool]) {
    //         dup[pool] = 0;
    //     }

    //     dup[pool]++;
    // }

    // console.log(dup);

    const result = await computeLiquidityWithSolver(pivotsToUse, actualFrom, actualTo, pairData, prices, directRouteLiquidity, step);
    // logFnDurationWithLabel(start, `p: ${platform}, [${fromSymbol}/${toSymbol}], blocks: ${(toBlock - fromBlock + 1)}`);
    return result;

}

/**
 * 
 * @param {string} platform the platform (all, balancer, uniswapv2...)
 * @param {string} fromSymbol the base asset
 * @param {string} toSymbol the quote asset
 * @param {number[]} blocks the block array
 * @param {number} avgOverBlocks 
 * @param {number} step 
 * @returns {Promise<{slippageMap: {[slippageBps: number]: number}}[]>}
 */
async function getLiquidityAverageV2ForDataPoints(platform, fromSymbol, toSymbol, blocks, avgOverBlocks, step = 50) {
    const stepBlock = 1200;
    const start = Date.now();
    const startDataFetch = Date.now();
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    
    const pivotsToUse = getPivotsToUse(actualFrom, actualTo);

    // generate list of routes
    const allPairs = getAllPairs(actualFrom, actualTo, pivotsToUse);
    const pairDataPerPoint = {};
    const pricesPerPoint = {};
    for(const b of blocks) {
        pricesPerPoint[b] = {
            USDC: 1
        };
        
        if(!pairDataPerPoint[b]) {
            pairDataPerPoint[b] = {};
        }
    }
    const usedPools = [];

    const directRouteLiquidityPerPoint = {};
    let directRouteLiquidity = {};
    if(platform == 'all') {
        directRouteLiquidity = getSumSlippageMapAcrossDexes(actualFrom, actualTo, blocks[0] - avgOverBlocks, blocks.at(-1), stepBlock, usedPools);
    } else {
        directRouteLiquidity = getUnifiedDataForInterval(platform, actualFrom, actualTo, blocks[0] - avgOverBlocks, blocks.at(-1), stepBlock, usedPools);
    }

    if(directRouteLiquidity && directRouteLiquidity.unifiedData) {
        directRouteLiquidity.usedPools.forEach(pool => usedPools.push(pool));
        
        for(const b of blocks) {
            const pointTo = b;
            const pointFrom = pointTo - avgOverBlocks;
            const liquiditiesForPoint = {};
            for(const [block, liquidityData] of Object.entries(directRouteLiquidity.unifiedData)) {
                if(block < pointFrom) {
                    continue;
                }
                if(block > pointTo) {
                    break;
                }

                liquiditiesForPoint[block] = liquidityData;
            }

            if(!pricesPerPoint[b][actualFrom]) {
                pricesPerPoint[b][actualFrom] = getLastMedianPriceForBlock('all', actualFrom, 'USDC', pointTo);
            }
            
            directRouteLiquidityPerPoint[b] = computeAverageSlippageMap(liquiditiesForPoint);
            // console.log(`${p}: ${directRouteLiquidityPerPoint[p].slippageMap[500].base}`);
        }
    } else {
        // if no direct liquidity, stored undefined
        for(const b of blocks) {
            directRouteLiquidityPerPoint[b] = undefined;
        }
    }
    
    // get all the routes liquidities
    for(const pair of allPairs) {
        let liquidityData = {};
        if(platform == 'all') { 
            liquidityData = getSumSlippageMapAcrossDexes(pair.from, pair.to, blocks[0] - avgOverBlocks, blocks.at(-1), stepBlock, usedPools);
        } else {
            liquidityData = getUnifiedDataForInterval(platform, pair.from, pair.to, blocks[0] - avgOverBlocks, blocks.at(-1), stepBlock, usedPools);
        }

        if(liquidityData && liquidityData.unifiedData) {
            liquidityData.usedPools.forEach(pool => usedPools.push(pool));

            for(const b of blocks) {
                const pointTo = b;
                const pointFrom = pointTo - avgOverBlocks;
                const liquiditiesForPoint = {};
                for(const [block, liq] of Object.entries(liquidityData.unifiedData)) {
                    if(block < pointFrom) {
                        continue;
                    }
                    if(block > pointTo) {
                        break;
                    }
    
                    liquiditiesForPoint[block] = liq;
                }
                
                if(!pairDataPerPoint[b][pair.from]) {
                    pairDataPerPoint[b][pair.from] = {};
                }
                if(!pairDataPerPoint[b][pair.from][pair.to]) {
                    pairDataPerPoint[b][pair.from][pair.to] = {};
                }
            
                if(!pricesPerPoint[b][pair.from]) {
                    pricesPerPoint[b][pair.from] = getLastMedianPriceForBlock('all', pair.from, 'USDC', pointTo);
                }
                
                if(!pricesPerPoint[b][pair.from]) {
                    throw new Error(`Cannot find ${pair.from}/USDC price`);
                }
                pairDataPerPoint[b][pair.from][pair.to] = computeAverageSlippageMap(liquiditiesForPoint).slippageMap;
            }
        }
    }
    

    logFnDurationWithLabel(startDataFetch, 'data fetch duration:');
    const liquidities = {}; // will store the liquidities (solver result) for every point of nbPoints
    for(const b of blocks) {
        const directRouteLiquidity = directRouteLiquidityPerPoint[b];
        const pairData = pairDataPerPoint[b];
        const prices = pricesPerPoint[b];
        // console.time('computeLiquidityWithSolver');
        const result = await computeLiquidityWithSolver(pivotsToUse, actualFrom, actualTo, pairData, prices, directRouteLiquidity, step);
        // console.timeEnd('computeLiquidityWithSolver');
        liquidities[b] =  result;
    }

    logFnDurationWithLabel(start, `p: ${platform}, [${fromSymbol}/${toSymbol}], blocks: ${(blocks.at(-1) - blocks[0] + 1)}`);
    return liquidities;
}


async function computeLiquidityWithSolver(pivotsToUse, fromSymbol, toSymbol, pairData, prices, directRouteLiquidity, step) {
    // check if routes exists from actualFrom=>anything
    // and from anything=>actualTo
    // if no routes available from or to, ignore solver and return direct route data
    let atLeastOneExitRoute = false;
    for(const from of Object.keys(pairData)) {
        if(atLeastOneExitRoute) {
            break;
        }
        for(const to of Object.keys(pairData[from])) {
            if(to == toSymbol) {
                atLeastOneExitRoute = true;
                break;
            }
        }
    }

    const liquidity = {
        slippageMap: {}
    };
    if(!pairData[fromSymbol] || !atLeastOneExitRoute) {
        if(!directRouteLiquidity) {
            return undefined;
        } else {
            for (let targetSlippage = step; targetSlippage <= MAX_SLIPPAGE; targetSlippage += step) {
                liquidity.slippageMap[targetSlippage] = directRouteLiquidity.slippageMap[targetSlippage].base;
            }

            return liquidity;
        }
    }

    const promises = [];
    for (let targetSlippage = step; targetSlippage <= MAX_SLIPPAGE; targetSlippage += step) {
        // call the linear programming solver
        const solverParameters = {
            assets: pivotsToUse.concat([fromSymbol, toSymbol]),
            origin: fromSymbol,
            target: toSymbol,
            slippageStepBps: 50,
            targetSlippageBps: targetSlippage,
        };

        const formattedLiquidity = {};

        for (const base of Object.keys(pairData)) {
            for (const quote of Object.keys(pairData[base])) {
                for (const slippageBps of Object.keys(pairData[base][quote])) {
                    // if(slippageBps > targetSlippage) continue;
                    if (!formattedLiquidity[base]) {
                        formattedLiquidity[base] = {};
                    }

                    if (!formattedLiquidity[base][quote]) {
                        formattedLiquidity[base][quote] = [];
                    }

                    formattedLiquidity[base][quote].push(pairData[base][quote][slippageBps].base * prices[base]);
                }

                formattedLiquidity[base][quote] = formattedLiquidity[base][quote].map((e, i, a) => i === 0 ? e : e - a[i - 1]);
            }
        }
        // console.log(formattedLiquidity);
        const glpmSpec = writeGLPMSpec(solverParameters, formattedLiquidity);
        // console.log(glpmSpec);
        // console.time('executeGLPSol');
        const promise = lp_solve.executeGLPSol(glpmSpec);
        // await promise;
        promises.push(promise);
    }

    const results = await Promise.all(promises);
    let cursor = 0;
    for (let targetSlippage = step; targetSlippage <= 2000; targetSlippage += step) {
        const glpmResult = results[cursor++];
        // console.timeEnd('executeGLPSol');
        const liquidityForTargetSlippage = parseGLPMOutput(glpmResult, fromSymbol);
        liquidity.slippageMap[targetSlippage] = 0;
        if (directRouteLiquidity) {
            liquidity.slippageMap[targetSlippage] += directRouteLiquidity.slippageMap[targetSlippage].base * prices[fromSymbol];
        }

        liquidity.slippageMap[targetSlippage] += liquidityForTargetSlippage;

        liquidity.slippageMap[targetSlippage] /= prices[fromSymbol];
    }

    // console.log(actualFrom, actualTo, liquidity);
    return liquidity;
}

async function readPivotsFromFile() {
    for(let i = 0; i < 10; i++) {
        try {
            return JSON.parse(fs.readFileSync('data/permutations.json'));
        } catch {
            console.warn('Couldn\'t read data/permutations.json. Retrying in 2 seconds.');
            await sleep(2000);
        }
    }
}

function getPivotsToUse(fromSymbol, toSymbol) {
    let basePivot = ALL_PIVOTS;

    const pairKey = `${fromSymbol}/${toSymbol}`;

    const specificPivotsOverride = readPivotsFromFile();

    let pivotsOverride = specificPivotsOverride[pairKey];
    if (pivotsOverride !== undefined) {
        console.log(`For ${fromSymbol}/${toSymbol}: using specific pivot for ${pairKey}: ${pivotsOverride}`);
        basePivot = pivotsOverride;
    } else {
        const pairKey = `${fromSymbol}/*`;
        pivotsOverride = specificPivotsOverride[pairKey];
        if (pivotsOverride !== undefined) {
            console.log(`For ${fromSymbol}/${toSymbol}: using specific pivot for ${pairKey}: ${pivotsOverride}`);
            basePivot = pivotsOverride;
        } else {
            const pairKey = `*/${toSymbol}`;
            pivotsOverride = specificPivotsOverride[pairKey];
            if (pivotsOverride !== undefined) {
                console.log(`For ${fromSymbol}/${toSymbol}: using specific pivot for ${pairKey}: ${pivotsOverride}`);
                basePivot = pivotsOverride;
            }  else {
                console.log(`For ${fromSymbol}/${toSymbol}: using default pivots`);
            }
        }
    }

    const pivotsToUse = [];
    for (const pivot of basePivot) {
        if (pivot == fromSymbol || pivot == toSymbol) {
            // do nothing
        } else {
            pivotsToUse.push(pivot);
        }
    }


    return pivotsToUse;
}

function getAllPairs(fromSymbol, toSymbol, pivotsToUse) {
    const allPairs = [];
    for (const pivot of pivotsToUse) {
        allPairs.push({
            from: fromSymbol,
            to: pivot
        });
    }

    for (let assetIn of pivotsToUse) {
        for (let assetOut of pivotsToUse) {
            if (assetIn == assetOut) continue;
            allPairs.push({
                from: assetIn,
                to: assetOut
            });
        }
    }

    for (const pivot of pivotsToUse) {
        allPairs.push({
            from: pivot,
            to: toSymbol
        });
    }

    return allPairs;
}
/**
 * Get the aggregated liquidity (using 'jump routes') from all available platforms (dexes)
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {number} stepBlock 
 * @returns {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}}}
 */
function getLiquidityAll(fromSymbol, toSymbol, fromBlock, toBlock, withJumps = true, stepBlock = DEFAULT_STEP_BLOCK) {
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    if(withJumps) {
        return getLiquidityAccrossDexes(actualFrom, actualTo, fromBlock, toBlock, stepBlock);
    } else {
        return getSumSlippageMapAcrossDexes(actualFrom, actualTo, fromBlock, toBlock, stepBlock).unifiedData;
    }
}

async function getRollingVolatility(platform, fromSymbol, toSymbol, web3Provider, lambda = LAMBDA) {
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    // find the median file
    const medianPrices = getPrices(platform, actualFrom, actualTo);
    if(!medianPrices) {
        console.warn(`No median prices for ${platform}, ${actualFrom}, ${actualTo}`);
        return undefined;
    }

    const rollingVolatility = await rollingBiggestDailyChange(medianPrices, web3Provider, lambda);
    if(newAssetsForMinVolatility.includes(fromSymbol) || newAssetsForMinVolatility.includes(toSymbol)) {
        // set min volatility to 10%
        rollingVolatility.latest.current = Math.max(0.1, rollingVolatility.latest.current);
        rollingVolatility.latest.yesterday = Math.max(0.1, rollingVolatility.latest.yesterday);
        for(let i = 0; i < rollingVolatility.history.length; i++) {
            rollingVolatility.history[i].current = Math.max(0.1, rollingVolatility.history[i].current);
            rollingVolatility.history[i].yesterday = Math.max(0.1, rollingVolatility.history[i].yesterday);
        }
    }

    return rollingVolatility;
}

async function getRollingVolatilityAndPrices(platform, fromSymbol, toSymbol, web3Provider, lambda = LAMBDA) {
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    // find the median file
    const medianPrices = getPrices(platform, actualFrom, actualTo);
    if(!medianPrices || medianPrices.length == 0) {
        console.warn(`No median prices for ${platform}, ${actualFrom}, ${actualTo}`);
        return {
            volatility: undefined,
            prices: undefined,
        };
    }

    const rollingVolatility = await rollingBiggestDailyChange(medianPrices, web3Provider, lambda);
    if(newAssetsForMinVolatility.includes(fromSymbol) || newAssetsForMinVolatility.includes(toSymbol)) {
        // set min volatility to 10%
        rollingVolatility.latest.current = Math.max(0.1, rollingVolatility.latest.current);
        rollingVolatility.latest.yesterday = Math.max(0.1, rollingVolatility.latest.yesterday);
        for(let i = 0; i < rollingVolatility.history.length; i++) {
            rollingVolatility.history[i].current = Math.max(0.1, rollingVolatility.history[i].current);
            rollingVolatility.history[i].yesterday = Math.max(0.1, rollingVolatility.history[i].yesterday);
        }
    }

    return {
        volatility: rollingVolatility,
        prices: medianPrices
    };
}

//    _    _  _______  _____  _        _____ 
//   | |  | ||__   __||_   _|| |      / ____|
//   | |  | |   | |     | |  | |     | (___  
//   | |  | |   | |     | |  | |      \___ \ 
//   | |__| |   | |    _| |_ | |____  ____) |
//    \____/    |_|   |_____||______||_____/ 
//                                           
//                                           

/**
 * Check that the platform request is valid
 * @param {string} platform the platform requested (uniswapv2, v3, curve...)
 */
function checkPlatform(platform) {
    if(!PLATFORMS.includes(platform)) {
        throw new Error(`Platform unknown: ${platform}, use one of ${PLATFORMS}`);
    }
}

async function test() {

    const base = 'wstETH';
    const quote = 'WETH';
    const platform = 'curve';
    //Will compute block from 18355539 to 19638579
    const res = await getLiquidityAverageV2(platform, base, quote, 18355539, 19638579, 100);
    console.log(res);
}

// test();

module.exports = { getLiquidity, getLiquidityV2, getRollingVolatility, getLiquidityAll, getLiquidityAverageV2, getLiquidityAverageV2ForDataPoints, getRollingVolatilityAndPrices, ALL_PIVOTS };
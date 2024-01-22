const { RecordMonitoring } = require('../utils/monitoring');
const { ethers } = require('ethers');
const { fnName, roundTo, sleep, logFnDurationWithLabel, logFnDuration, retry } = require('../utils/utils');
const { DATA_DIR, PLATFORMS } = require('../utils/constants');

const fs = require('fs');
const path = require('path');
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { getLiquidity, getRollingVolatility, getLiquidityAll } = require('../data.interface/data.interface');
const { getDefaultSlippageMap } = require('../data.interface/internal/data.interface.utils');
const { median } = require('simple-statistics');
const { watchedPairs } = require('../global.config');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { getPrices } = require('../data.interface/internal/data.interface.price');
const { default: axios } = require('axios');

const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Dashboard Precomputer';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
const NB_DAYS = 180;
const TARGET_DATA_POINTS = NB_DAYS;
const NB_DAYS_AVG = 30;
const BLOCKINFO_URL = process.env.BLOCKINFO_URL;

const BIGGEST_DAILY_CHANGE_OVER_DAYS = 90; // amount of days to compute the biggest daily change
let BLOCK_PER_DAY = 0; // 7127

async function PrecomputeDashboardData() {
// eslint-disable-next-line no-constant-condition
    while(true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();
        console.log({TARGET_DATA_POINTS});
        console.log({NB_DAYS});
        console.log({NB_DAYS_AVG});
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(runStartDate/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            const currentBlock = await web3Provider.getBlockNumber() - 100;

            // this will be the start of the graph
            const daysAgo = Math.round(Date.now()/1000) - NB_DAYS * 24 * 60 * 60;
            console.log('daysAgo:', new Date(daysAgo*1000));
            const startBlock =  await getBlocknumberForTimestamp(daysAgo);
            console.log({startBlock});

            BLOCK_PER_DAY = Math.round((currentBlock - startBlock) / NB_DAYS);
            console.log({BLOCK_PER_DAY});

            // this is the real amount of day we will get from our files
            // example: if the first displayed data point is 180 days ago and we need to compute avg for 3 months even for the first point
            // then we need to get the data from 180 days + 90 days (3 month)
            const realDaysAgo = Math.round(Date.now()/1000) - (NB_DAYS + BIGGEST_DAILY_CHANGE_OVER_DAYS) * 24 * 60 * 60;
            console.log('realDaysAgo:', new Date(realDaysAgo*1000));
            const realStartBlock =  await getBlocknumberForTimestamp(realDaysAgo);
            console.log({realStartBlock});

            // block step is the amount of blocks between each displayed points
            const blockStep = Math.round((currentBlock - startBlock) / TARGET_DATA_POINTS);
            console.log({blockStep});
            const displayBlocks = [];
            for(let b = startBlock; b <= currentBlock; b+= blockStep) {
                displayBlocks.push(b);
            }

            // find all blocktimes for each display block
            const blockTimeStamps = {};
            console.log(`${fnName()}: getting all block timestamps`);
            for(const blockNumber of displayBlocks) {
                const blockTimestampResp = await retry(axios.get, [BLOCKINFO_URL + `/api/getblocktimestamp?blocknumber=${blockNumber}`], 0, 100);
                blockTimeStamps[blockNumber] = blockTimestampResp.data.timestamp;
            }

            // AVG step is the amount of blocks to be used when computing average liquidity
            // meaning that if we want the average liquidity at block X since 30 days
            // we will take the data from 'X - avgStep' to 'X'
            const avgStep = BLOCK_PER_DAY * NB_DAYS_AVG;
            console.log({avgStep});
            const dirPath = path.join(DATA_DIR, 'precomputed', 'dashboard');
            if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'dashboard'))) {
                fs.mkdirSync(dirPath, {recursive: true});
            }

            const pairsToCompute = [];
            for(const [base, quotes] of Object.entries(watchedPairs)) {
                for(const quoteConfig of quotes) {
                    pairsToCompute.push({
                        base: base,
                        quote: quoteConfig.quote,
                        pivots: quoteConfig.pivots
                    });

                    pairsToCompute.push({
                        base: quoteConfig.quote,
                        quote: base,
                        pivots: quoteConfig.pivots
                    });
                }
            }

            console.log(`Will compute data for ${pairsToCompute.length} pairs`);

            for(const pair of pairsToCompute) {
                await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
                console.log(`${fnName()}: precomputing for pair ${pair.base}/${pair.quote}`);
                for(const platform of PLATFORMS) {
                    console.log(`${fnName()}[${pair.base}/${pair.quote}]: precomputing for platform ${platform}`);
                    // get the liquidity since startBlock - avgStep because, for the first block (= startBlock), we will compute the avg liquidity and volatility also
                    const platformLiquidity = getLiquidity(platform, pair.base, pair.quote, realStartBlock, currentBlock, true);
                    if(platformLiquidity) {
                        let pricesAtBlock = getPrices(platform, pair.base, pair.quote)?.filter(_ => _.block >= realStartBlock);
                        if(!pricesAtBlock) {
                            pricesAtBlock = [];
                            console.warn(`no price at block for for ${platform} ${pair.base} ${pair.quote}`);
                        }

                        const rollingVolatility = await getRollingVolatility(platform, pair.base, pair.quote, web3Provider);

                        const startDate = Date.now();
                        generateDashboardDataFromLiquidityData(platformLiquidity, pricesAtBlock, displayBlocks, avgStep, pair, dirPath, platform, rollingVolatility, blockTimeStamps);                        
                        logFnDurationWithLabel(startDate, 'generateDashboardDataFromLiquidityData');
                    } else {
                        console.log(`no liquidity data for ${platform} ${pair.base} ${pair.quote}`);
                    }
                }

                // here, need to compute avg price and volatility for each block for 'all' platforms
                const pricesAtBlock = getPrices('all', pair.base, pair.quote)?.filter(_ => _.block >= realStartBlock);
                if(!pricesAtBlock) {
                    throw new Error(`Could not get price at block for all ${pair.base} ${pair.quote}`);
                }
                
                const rollingVolatility = await getRollingVolatility('all', pair.base, pair.quote, web3Provider);
                const startDate = Date.now();
                const allPlatformsLiquidity = getLiquidityAll(pair.base, pair.quote, realStartBlock, currentBlock);
                generateDashboardDataFromLiquidityData(allPlatformsLiquidity, pricesAtBlock, displayBlocks, avgStep, pair, dirPath, 'all', rollingVolatility, blockTimeStamps);                        
                logFnDurationWithLabel(startDate, 'generateDashboardDataFromLiquidityData');
            }

            const runEndDate = Math.round(Date.now() / 1000);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(runStartDate / 1000)
            });
    
            logFnDuration(runStartDate, pairsToCompute.length, 'pairs to compute');
            const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - runStartDate);
            if(sleepTime > 0) {
                console.log(`${fnName()}: sleeping ${roundTo(sleepTime/1000/60)} minutes`);
                await sleep(sleepTime);
            }
        } catch(error) {
            console.error(error);
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'error',
                'error': errorMsg
            });

            console.log('sleeping 10 minutes');
            await sleep(10 * 60 * 1000);
        }
    }

}

function generateDashboardDataFromLiquidityData(platformLiquidity, pricesAtBlock, displayBlocks, avgStep, pair, dirPath, platform, rollingVolatility, blockTimeStamps) {
    console.log(`generateDashboardDataFromLiquidityData: starting for ${pair.base}/${pair.quote}`);
    const platformOutputResult = {};
    // compute average liquidity over ~= 30 days for all the display blocks
    const liquidityBlocks = Object.keys(platformLiquidity).map(_ => Number(_));
    // const pricesBlocks = Object.keys(pricesAtBlock).map(_ => Number(_));

    const timeOutputResult = {};
    let previousBlock = undefined;
    for (const block of displayBlocks) {
        platformOutputResult[block] = {};
        const nearestBlockBefore = liquidityBlocks.filter(_ => _ <= block).at(-1);
        if (!nearestBlockBefore) {
            throw new Error(`Could not find blocks <= ${block} in liquidity data`);
        }

        // platformOutputResult[block].slippageMap = platformLiquidity[nearestBlockBefore].slippageMap;
        const prices = pricesAtBlock.filter(_ => _.block >= block - BLOCK_PER_DAY && _.block <= block).map(_ => _.price);
        if (prices.length == 0) {
            if(previousBlock) {
                platformOutputResult[block].priceMedian = platformOutputResult[previousBlock].priceMedian;
                platformOutputResult[block].priceMin = platformOutputResult[previousBlock].priceMin;
                platformOutputResult[block].priceMax =  platformOutputResult[previousBlock].priceMax;
            } else {
                platformOutputResult[block].priceMedian = 0;
                platformOutputResult[block].priceMin = 0;
                platformOutputResult[block].priceMax = 0;
            }
        } else {
            platformOutputResult[block].priceMedian = median(prices);
            platformOutputResult[block].priceMin = Math.min(...prices);
            platformOutputResult[block].priceMax = Math.max(...prices);
        }
        
        // compute avg slippage based on trade price (amount of base sold vs amount of quote obtained)
        // for (const slippageBps of Object.keys(platformOutputResult[block].slippageMap)) {
        //     if(platformOutputResult[block].price > 0) {
        //         const tradePrice = platformOutputResult[block].slippageMap[slippageBps].quote / platformOutputResult[block].slippageMap[slippageBps].base;
        //         platformOutputResult[block].slippageMap[slippageBps].avgSlippage =  1 - (tradePrice / platformOutputResult[block].price);
        //     } else {
        //         platformOutputResult[block].slippageMap[slippageBps].avgSlippage = 0;
        //     }
        // }

        const startBlockForAvg = block - avgStep;
        // average for all blocks in interval [startBlockForAvg -> block]
        const blocksToAverage = liquidityBlocks.filter(_ => _ <= block && _ >= startBlockForAvg);
        const avgSlippage = getDefaultSlippageMap();
        for (const blockToAvg of blocksToAverage) {
            for (const slippageBps of Object.keys(avgSlippage)) {
                avgSlippage[slippageBps].base += platformLiquidity[blockToAvg].slippageMap[slippageBps].base;
                avgSlippage[slippageBps].quote += platformLiquidity[blockToAvg].slippageMap[slippageBps].quote;
            }
        }

        for (const slippageBps of Object.keys(avgSlippage)) {
            avgSlippage[slippageBps].base = avgSlippage[slippageBps].base / blocksToAverage.length;
            avgSlippage[slippageBps].quote = avgSlippage[slippageBps].quote / blocksToAverage.length;
        }

        // const parkinsonsVolatility = computeParkinsonVolatility(pricesAtBlock, pair.base, pair.quote, startBlockForAvg, block, NB_DAYS_AVG);
        // platformOutputResult[block].parkinsonsVolatility = parkinsonsVolatility;

        // find the rolling volatility for the block
        if(rollingVolatility) {
            const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= block && _.blockEnd >= block)[0];
            if(!volatilityAtBlock) {
                if (block < rollingVolatility.latest.blockEnd) {
                    // block too early
                    platformOutputResult[block].volatility = 0;
                }
                else if (block - 7200 > rollingVolatility.latest.blockEnd) {
                    console.warn(`last volatility data is more than 1 day older than block ${block}`);
                    platformOutputResult[block].volatility = 0;
                } else {
                    console.log(`blockdiff: ${block - rollingVolatility.latest.blockEnd}`);
                    platformOutputResult[block].volatility = rollingVolatility.latest.current;
                }
            } else {
                platformOutputResult[block].volatility = volatilityAtBlock.current;
            }
        } else {
            platformOutputResult[block].volatility = -1;
        }

        platformOutputResult[block].avgSlippageMap = avgSlippage;
        previousBlock = block;
        timeOutputResult[blockTimeStamps[block]] = platformOutputResult[block];
    }

    const fullFilename = path.join(dirPath, `${pair.base}-${pair.quote}-${platform}.json`);
    fs.writeFileSync(fullFilename, JSON.stringify({ updated: Date.now(), liquidity: timeOutputResult }));
}

PrecomputeDashboardData();


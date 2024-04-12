const { RecordMonitoring } = require('../utils/monitoring');
const { ethers } = require('ethers');
const { fnName, roundTo, sleep, logFnDurationWithLabel, logFnDuration, retry } = require('../utils/utils');
const { DATA_DIR, PLATFORMS, BLOCK_PER_DAY } = require('../utils/constants');

const fs = require('fs');
const path = require('path');
const { getLiquidityAverageV2ForDataPoints, getRollingVolatilityAndPrices } = require('../data.interface/data.interface');
const { getDefaultSlippageMap } = require('../data.interface/internal/data.interface.utils');
const { median } = require('simple-statistics');
const { watchedPairs } = require('../global.config');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { default: axios } = require('axios');
const { morphoDashboardSummaryComputer } = require('../clf/morpho/morphoDashboardComputer');

const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Dashboard Precomputer';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
const NB_DAYS = 180;
const NB_DAYS_AVG = 30;
const BLOCKINFO_URL = process.env.BLOCKINFO_URL;

async function PrecomputeDashboardData() {
// eslint-disable-next-line no-constant-condition
    while(true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const dirPath = path.join(DATA_DIR, 'precomputed', 'dashboard');
        if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'dashboard'))) {
            fs.mkdirSync(dirPath, {recursive: true});
        }
        
        const runStartDate = Date.now();
        console.log({NB_DAYS});
        console.log({NB_DAYS_AVG});
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(runStartDate/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            // this is all the blocks to be displayed by the dashboard
            const displayBlocks = await getDisplayBlocks();

            // find all blocktimes for each display block
            const blockTimeStamps = await getBlockTimestamps(displayBlocks);

            const pairsToCompute = getPairsToCompute();

            console.log(`Will compute data for ${pairsToCompute.length} pairs`);

            for(const pair of pairsToCompute) {
                await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
                console.log(`${fnName()}: precomputing for pair ${pair.base}/${pair.quote}`);
                for(const platform of PLATFORMS) {
                    const startDateNew = Date.now();
                    await generateDashboardDataForPlatorm(platform, displayBlocks, pair, dirPath, blockTimeStamps);
                    logFnDurationWithLabel(startDateNew, `generateDashboardDataForPlatorm[${platform}]`);
                }

                // do another for 'all' platforms
                const startDate = Date.now();
                await generateDashboardDataForPlatorm('all', displayBlocks, pair, dirPath, blockTimeStamps);
                logFnDurationWithLabel(startDate, 'generateDashboardDataForPlatorm[all]');
            }

            await morphoDashboardSummaryComputer(RUN_EVERY_MINUTES);

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

            process.exit();
            console.log('sleeping 10 minutes');
            await sleep(10 * 60 * 1000);
        }
    }

}

async function getDisplayBlocks() {
    const currentBlock = await web3Provider.getBlockNumber() - 100;
    const startBlock = currentBlock - (NB_DAYS * BLOCK_PER_DAY);
    console.log(`Will compute block from ${startBlock} to ${currentBlock}`);

    // block step is the amount of blocks between each displayed points
    const blockStep = Math.round((currentBlock - startBlock) / NB_DAYS);
    console.log({ blockStep });
    const displayBlocks = [];
    for (let b = startBlock; b <= currentBlock; b += blockStep) {
        displayBlocks.push(b);
    }
    return displayBlocks;
}

async function getBlockTimestamps(displayBlocks) {
    const blockTimeStamps = {};
    console.log(`${fnName()}: getting all block timestamps`);
    const blockPromises = [];
    for (const blockNumber of displayBlocks) {
        // const blockTimestampResp = await retry(axios.get, [BLOCKINFO_URL + `/api/getblocktimestamp?blocknumber=${blockNumber}`], 0, 100);
        // blockTimeStamps[blockNumber] = blockTimestampResp.data.timestamp;
        blockPromises.push(retry(axios.get, [BLOCKINFO_URL + `/api/getblocktimestamp?blocknumber=${blockNumber}`], 0, 100));
        // blockTimeStamps[blockNumber] = Date.now();
    }

    const blockResults = await Promise.all(blockPromises);
    for (let i = 0; i < displayBlocks.length; i++) {
        const blockNumber = displayBlocks[i];
        const timestamp = blockResults[i].data.timestamp;
        blockTimeStamps[blockNumber] = timestamp;
    }
    return blockTimeStamps;
}

function getPairsToCompute() {
    const pairsToCompute = [];
    for (const [base, quotes] of Object.entries(watchedPairs)) {
        for (const quoteConfig of quotes) {
            if (quoteConfig.exportToInternalDashboard) {
                pairsToCompute.push({
                    base: base,
                    quote: quoteConfig.quote
                });

                pairsToCompute.push({
                    base: quoteConfig.quote,
                    quote: base
                });
            }
        }
    }
    return pairsToCompute;
}

async function generateDashboardDataForPlatorm(platform, displayBlocks, pair, dirPath, blockTimeStamps) {
    console.log(`generateDashboardDataFromLiquidityDataForPlatform: starting for ${platform} ${pair.base}/${pair.quote}`);
    const platformOutputResult = {};
    const timeOutputResult = {};
    const volatilityAndPrices = await getRollingVolatilityAndPrices(platform, pair.base, pair.quote, web3Provider);

    let pricesAtBlock = volatilityAndPrices.prices;
    const rollingVolatility = volatilityAndPrices.volatility;
    if(!pricesAtBlock) {
        pricesAtBlock = [];
        console.warn(`no price at block for ${platform} ${pair.base} ${pair.quote}`);
    }

    // check if any data for that pair
    const liquidities = await getLiquidityAverageV2ForDataPoints(platform, pair.base, pair.quote, displayBlocks[0], displayBlocks.at(-1), displayBlocks.length, NB_DAYS_AVG * BLOCK_PER_DAY , 100);
    if(!liquidities || liquidities.every(_ => _ == undefined)) {
        // if not, just ignore the pair
        console.log(`no data for ${platform} ${pair.base} ${pair.quote}`);
        return;
    }

    let previousBlock = undefined;
    for(let blockNum = 0; blockNum < displayBlocks.length; blockNum++) {
        const block = displayBlocks[blockNum];
        const avg30DLiquidityForDay = liquidities[blockNum];

        platformOutputResult[block] = {};
        platformOutputResult[block].avgSlippageMap = 
        avg30DLiquidityForDay && avg30DLiquidityForDay.slippageMap 
            ? avg30DLiquidityForDay.slippageMap 
            : getDefaultSlippageMap();

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
        previousBlock = block;
        timeOutputResult[blockTimeStamps[block]] = platformOutputResult[block];
    }

    const fullFilename = path.join(dirPath, `${pair.base}-${pair.quote}-${platform}.json`);
    fs.writeFileSync(fullFilename, JSON.stringify({ updated: Date.now(), liquidity: timeOutputResult }));
}

PrecomputeDashboardData();


const { RecordMonitoring } = require('../utils/monitoring');
const { ethers } = require('ethers');
const { fnName, roundTo, sleep, logFnDurationWithLabel, logFnDuration, retry } = require('../utils/utils');
const { DATA_DIR, PLATFORMS, BLOCK_PER_DAY } = require('../utils/constants');

const fs = require('fs');
const path = require('path');
const { getLiquidityAverageV2ForDataPoints, getRollingVolatilityAndPrices, getLiquidityAverageV2 } = require('../data.interface/data.interface');
const { getDefaultSlippageMap, getDefaultSlippageMapSimple } = require('../data.interface/internal/data.interface.utils');
const { median } = require('simple-statistics');
const { watchedPairs } = require('../global.config');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { default: axios } = require('axios');
const { morphoDashboardSummaryComputer } = require('../clf/morpho/morphoDashboardComputer');
const { kinzaDashboardPrecomputer } = require('./kinza.dashboard.precomputer');

const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Dashboard Precomputer';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
const NB_DAYS = 180;
const NB_DAYS_AVG = 30;
const BLOCKINFO_URL = process.env.BLOCKINFO_URL;

const dirPath = path.join(DATA_DIR, 'precomputed', 'dashboard');
const dailyDirPath = path.join(DATA_DIR, 'precomputed', 'daily-dashboard-data');

async function PrecomputeDashboardData() {
// eslint-disable-next-line no-constant-condition
    while(true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'dashboard'))) {
            fs.mkdirSync(dirPath, {recursive: true});
        }
        if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'daily-dashboard'))) {
            fs.mkdirSync(dailyDirPath, {recursive: true});
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
                    await generateDashboardDataForPlatormFull(platform, displayBlocks, pair, dirPath, blockTimeStamps);
                    logFnDurationWithLabel(startDateNew, `generateDashboardDataForPlatorm[${platform}]`);
                }

                // do another for 'all' platforms
                const startDate = Date.now();
                await generateDashboardDataForPlatormFull('all', displayBlocks, pair, dirPath, blockTimeStamps);
                logFnDurationWithLabel(startDate, 'generateDashboardDataForPlatorm[all]');
            }

            mergeDailyData();

            await morphoDashboardSummaryComputer(RUN_EVERY_MINUTES);
            await kinzaDashboardPrecomputer(RUN_EVERY_MINUTES);

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

function mergeDailyData() {
    const firstTag = getDayDirTag(NB_DAYS);
    const lastTag = getDayDirTag(0);
    const firstDate = getDateFromTag(firstTag);
    const lastDate = getDateFromTag(lastTag);
    console.log(`starting from ${firstDate.toISOString()} to ${lastDate.toISOString()}`);
    let currentDate = firstDate;
    const allPairsData = {};
    while(currentDate <= lastDate) {
        // read all files from day dir
        console.log(`Working on date ${currentDate.toISOString()}`);
        const currentTag = tagFromDate(currentDate);
        const dayDir = path.join(dailyDirPath, currentTag);
        const allFiles = fs.readdirSync(dayDir).filter(_ => _.endsWith('.json'));
        for(const file of allFiles) {
            // console.log(`working on ${file}`);
            // file is "2023-10-17_WETH_rETH_all.json"
            const splt = file.replace('.json', '').split('_');
            const base = splt[1];
            const quote = splt[2];
            const platform = splt[3];

            const fileObj = JSON.parse(fs.readFileSync(path.join(dayDir, file)));

            if(!allPairsData[platform]) {
                allPairsData[platform] = {};
            }
            if(!allPairsData[platform][base]) {
                allPairsData[platform][base] = {};
            }
            if(!allPairsData[platform][base][quote]) {
                allPairsData[platform][base][quote] = {
                    updated: Date.now(),
                    liquidity: {}
                };
            }

            allPairsData[platform][base][quote].liquidity[Math.round(currentDate.getTime()/1000)] = fileObj;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // here, all data are in allPairsData[platform][base][quote], output them in dashboard dir
    for(const platform of Object.keys(allPairsData)) {
        for(const base of Object.keys(allPairsData[platform])) {
            for(const quote of Object.keys(allPairsData[platform][base])) {
                const fileName = `${base}-${quote}-${platform}.json`;
                const fileData = allPairsData[platform][base][quote];
                fs.writeFileSync(path.join(dirPath, fileName), JSON.stringify(fileData));
            }
        }
    }
}

async function getDisplayBlocks() {
    const currentBlock = await web3Provider.getBlockNumber();
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
    const volatilityAndPrices = await getRollingVolatilityAndPrices(platform, pair.base, pair.quote, web3Provider);

    let pricesAtBlock = volatilityAndPrices.prices;
    const rollingVolatility = volatilityAndPrices.volatility;
    if(!pricesAtBlock) {
        pricesAtBlock = [];
        console.warn(`no price at block for ${platform} ${pair.base} ${pair.quote}`);
    }

    let previousBlockDayObj = undefined;
    for(let blockNum = 0; blockNum < displayBlocks.length; blockNum++) {
        const block = displayBlocks[blockNum];

        // blockNum[0] is NB_DAYS ago
        const dayTag = getDayDirTag(NB_DAYS - blockNum);
        const dayDir = path.join(dailyDirPath, dayTag);
        if(!fs.existsSync(dayDir)) {
            fs.mkdirSync(dayDir, {recursive: true});
        }

        const dayFile = path.join(dayDir, `${dayTag}_${pair.base}_${pair.quote}_${platform}.json`);
        if(fs.existsSync(dayFile)) {
            // if file already exists, ignore
            console.log(`[${platform}] ${pair.base}/${pair.quote} already in dir ${dayTag}`);
            // load the file as previousBlockDayObj
            previousBlockDayObj = JSON.parse(fs.readFileSync(dayFile, 'utf-8'));
            continue;
        }

        const dayObj = {
            priceMedian: 0,
            priceMin: 0,
            priceMax: 0,
            volatility: 0,
            avgSlippageMap: getDefaultSlippageMapSimple(),
            block: block,
            timestamp: blockTimeStamps[block]
        };


        const avg30DLiquidityForDay = await getLiquidityAverageV2(platform, pair.base, pair.quote, block - 30 * BLOCK_PER_DAY, block, 100);

        if(avg30DLiquidityForDay) {
            dayObj.avgSlippageMap = avg30DLiquidityForDay.slippageMap;
        }

        const prices = pricesAtBlock.filter(_ => _.block >= block - BLOCK_PER_DAY && _.block <= block).map(_ => _.price);
        if (prices.length == 0) {
            if(previousBlockDayObj) {
                dayObj.priceMedian = previousBlockDayObj.priceMedian;
                dayObj.priceMin = previousBlockDayObj.priceMin;
                dayObj.priceMax =  previousBlockDayObj.priceMax;
            }
        } else {
            dayObj.priceMedian = median(prices);
            dayObj.priceMin = Math.min(...prices);
            dayObj.priceMax = Math.max(...prices);
        }

        // find the rolling volatility for the block
        if(rollingVolatility) {
            const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= block && _.blockEnd >= block)[0];
            if(!volatilityAtBlock) {
                if (block < rollingVolatility.latest.blockEnd) {
                    // block too early
                    dayObj.volatility = 0;
                }
                else if (block - 7200 > rollingVolatility.latest.blockEnd) {
                    console.warn(`last volatility data is more than 1 day older than block ${block}`);
                    dayObj.volatility = 0;
                } else {
                    console.log(`blockdiff: ${block - rollingVolatility.latest.blockEnd}`);
                    dayObj.volatility = rollingVolatility.latest.current;
                }
            } else {
                dayObj.volatility = volatilityAtBlock.current;
            }
        } else {
            dayObj.volatility = -1;
        }
        previousBlockDayObj = dayObj;

        fs.writeFileSync(dayFile, JSON.stringify(dayObj, null, 2));
    }

}

async function generateDashboardDataForPlatormFull(platform, displayBlocks, pair, dirPath, blockTimeStamps) {
    console.log(`generateDashboardDataFromLiquidityDataForPlatform: starting for ${platform} ${pair.base}/${pair.quote}`);
    const volatilityAndPrices = await getRollingVolatilityAndPrices(platform, pair.base, pair.quote, web3Provider);

    let pricesAtBlock = volatilityAndPrices.prices;
    const rollingVolatility = volatilityAndPrices.volatility;
    if(!pricesAtBlock) {
        pricesAtBlock = [];
        console.warn(`no price at block for ${platform} ${pair.base} ${pair.quote}`);
    }

    // find first block missing
    let startBlockIndex = -1;
    let previousBlockDayObj = undefined;
    for(let blockNum = 0; blockNum < displayBlocks.length; blockNum++) {
        
        const dayTag = getDayDirTag(NB_DAYS - blockNum);
        const dayDir = path.join(dailyDirPath, dayTag);
        const dayFile = path.join(dayDir, `${dayTag}_${pair.base}_${pair.quote}_${platform}.json`);
        if(fs.existsSync(dayFile)) {
            // if file already exists, ignore
            console.log(`[${platform}] ${pair.base}/${pair.quote} already in dir ${dayTag}`);
            // load the file as previousBlockDayObj
            previousBlockDayObj = JSON.parse(fs.readFileSync(dayFile, 'utf-8'));
            continue;
        } else {
            startBlockIndex = blockNum;
            break;
        }
    }

    if(startBlockIndex < 0) {
        console.log(`no computing needed for ${platform} ${pair.base} ${pair.quote}`);
        return;
    }
    console.log(`startindex: ${startBlockIndex} = ${displayBlocks[startBlockIndex]}`);
    

    const liquidities = await getLiquidityAverageV2ForDataPoints(platform, pair.base, pair.quote, displayBlocks.slice(startBlockIndex), NB_DAYS_AVG * BLOCK_PER_DAY, 50);

    for(let blockNum = startBlockIndex; blockNum < displayBlocks.length; blockNum++) {
        const block = displayBlocks[blockNum];

        // blockNum[0] is NB_DAYS ago
        const dayTag = getDayDirTag(NB_DAYS - blockNum);
        const dayDir = path.join(dailyDirPath, dayTag);
        if(!fs.existsSync(dayDir)) {
            fs.mkdirSync(dayDir, {recursive: true});
        }

        const dayFile = path.join(dayDir, `${dayTag}_${pair.base}_${pair.quote}_${platform}.json`);
        if(fs.existsSync(dayFile)) {
            // if file already exists, ignore
            console.log(`[${platform}] ${pair.base}/${pair.quote} already in dir ${dayTag}`);
            // load the file as previousBlockDayObj
            previousBlockDayObj = JSON.parse(fs.readFileSync(dayFile, 'utf-8'));
            continue;
        }

        const dayObj = {
            priceMedian: 0,
            priceMin: 0,
            priceMax: 0,
            volatility: 0,
            avgSlippageMap: getDefaultSlippageMapSimple(),
            block: block,
            timestamp: blockTimeStamps[block]
        };


        const avg30DLiquidityForDay = liquidities[block];

        if(avg30DLiquidityForDay) {
            dayObj.avgSlippageMap = avg30DLiquidityForDay.slippageMap;
        }

        const prices = pricesAtBlock.filter(_ => _.block >= block - BLOCK_PER_DAY && _.block <= block).map(_ => _.price);
        if (prices.length == 0) {
            if(previousBlockDayObj) {
                dayObj.priceMedian = previousBlockDayObj.priceMedian;
                dayObj.priceMin = previousBlockDayObj.priceMin;
                dayObj.priceMax =  previousBlockDayObj.priceMax;
            }
        } else {
            dayObj.priceMedian = median(prices);
            dayObj.priceMin = Math.min(...prices);
            dayObj.priceMax = Math.max(...prices);
        }

        // find the rolling volatility for the block
        if(rollingVolatility) {
            const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= block && _.blockEnd >= block)[0];
            if(!volatilityAtBlock) {
                if (block < rollingVolatility.latest.blockEnd) {
                    // block too early
                    dayObj.volatility = 0;
                }
                else if (block - 7200 > rollingVolatility.latest.blockEnd) {
                    console.warn(`last volatility data is more than 1 day older than block ${block}`);
                    dayObj.volatility = 0;
                } else {
                    console.log(`blockdiff: ${block - rollingVolatility.latest.blockEnd}`);
                    dayObj.volatility = rollingVolatility.latest.current;
                }
            } else {
                dayObj.volatility = volatilityAtBlock.current;
            }
        } else {
            dayObj.volatility = -1;
        }
        previousBlockDayObj = dayObj;

        fs.writeFileSync(dayFile, JSON.stringify(dayObj, null, 2));
    }

}

// for 2024 01 01, returns 2024-01-01
function getDayDirTag(daysAgo) {
    const dateNow = new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000));
    return tagFromDate(dateNow);
}

function tagFromDate(date) {
    return date.toISOString().split('T')[0];
}

function getDateFromTag(dayTag) {
    const splt = dayTag.split('-');
    const year = Number(splt[0]);
    const month = Number(splt[1]);
    const day = Number(splt[2]);

    return new Date(year, month - 1, day, 12, 0, 0);
}

PrecomputeDashboardData();


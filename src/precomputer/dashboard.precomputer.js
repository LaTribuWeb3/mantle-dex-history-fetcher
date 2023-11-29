const { RecordMonitoring } = require('../utils/monitoring');
const { ethers } = require('ethers');
const { fnName, roundTo, sleep, logFnDurationWithLabel, logFnDuration } = require('../utils/utils');
const { DATA_DIR, PLATFORMS } = require('../utils/constants');

const fs = require('fs');
const path = require('path');
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { getLiquidity, getRollingVolatility } = require('../data.interface/data.interface');
const { getDefaultSlippageMap } = require('../data.interface/internal/data.interface.utils');
const { median, average, quantile } = require('simple-statistics');
const { watchedPairs } = require('../global.config');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { getPrices } = require('../data.interface/internal/data.interface.price');

const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Dashboard Precomputer';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
const NB_DAYS = 180;
const TARGET_DATA_POINTS = NB_DAYS;
const NB_DAYS_AVG = 30;

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
                let allPlatformsOutput = undefined;
                for(const platform of PLATFORMS) {
                    console.log(`${fnName()}[${pair.base}/${pair.quote}]: precomputing for platform ${platform}`);
                    // get the liquidity since startBlock - avgStep because, for the first block (= startBlock), we will compute the avg liquidity and volatility also
                    const platformLiquidity = getLiquidity(platform, pair.base, pair.quote, realStartBlock, currentBlock, true);
                    if(platformLiquidity) {
                        const pricesAtBlock = getPrices(platform, pair.base, pair.quote)?.filter(_ => _.block >= realStartBlock);
                        if(!pricesAtBlock) {
                            throw new Error(`Could not get price at block for ${platform} ${pair.base} ${pair.quote} ${pair.volatilityPivot}`);
                        }

                        const rollingVolatility = await getRollingVolatility(platform, pair.base, pair.quote, web3Provider);

                        const startDate = Date.now();
                        const platformOutput = generateDashboardDataFromLiquidityData(platformLiquidity, pricesAtBlock, displayBlocks, avgStep, pair, dirPath, platform, rollingVolatility);                        
                        logFnDurationWithLabel(startDate, 'generateDashboardDataFromLiquidityData');
                        if(!allPlatformsOutput) {
                            allPlatformsOutput = platformOutput;
                        } else {
                            // sum price and volatility (will be avg after)
                            for(const block of Object.keys(allPlatformsOutput)) {
                                // do this only the first time for allPlatformsOutput
                                if(!allPlatformsOutput[block].totalVolatilityWeight) {
                                    const volatilityWeight = allPlatformsOutput[block].slippageMap[500].base;
                                    allPlatformsOutput[block].totalVolatilityWeight = allPlatformsOutput[block].volatility > 0 ? volatilityWeight : 0;
                                    allPlatformsOutput[block].volatility *= volatilityWeight;
                                }

                                if(!allPlatformsOutput[block].totalPriceWeight) {
                                    const priceWeight = allPlatformsOutput[block].slippageMap[500].base;
                                    allPlatformsOutput[block].totalPriceWeight = allPlatformsOutput[block].price > 0 ? priceWeight : 0;
                                    allPlatformsOutput[block].price *= priceWeight;
                                    allPlatformsOutput[block].priceAvg *= priceWeight;
                                    allPlatformsOutput[block].priceMedian *= priceWeight;
                                    allPlatformsOutput[block].priceQ10 *= priceWeight;
                                    allPlatformsOutput[block].priceQ90 *= priceWeight;
                                    allPlatformsOutput[block].priceMin *= priceWeight;
                                    allPlatformsOutput[block].priceMax *= priceWeight;
                                    allPlatformsOutput[block].biggestDailyChange *= priceWeight;
                                }

                                // for each new platformOutput, compute the new weight and add price and volatility
                                // according to the weight
                                const newWeight = platformOutput[block].slippageMap[500].base;

                                const newVolatility = platformOutput[block].volatility;
                                if(newVolatility > 0) {
                                    allPlatformsOutput[block].totalVolatilityWeight += newWeight;
                                    allPlatformsOutput[block].volatility += (newVolatility * newWeight);
                                }

                                const newPrice = platformOutput[block].price;
                                if(newPrice > 0) {
                                    allPlatformsOutput[block].totalPriceWeight += newWeight;
                                    allPlatformsOutput[block].price += (newPrice * newWeight);
                                    allPlatformsOutput[block].biggestDailyChange += (platformOutput[block].biggestDailyChange * newWeight);
                                    allPlatformsOutput[block].priceAvg += (platformOutput[block].priceAvg * newWeight);
                                    allPlatformsOutput[block].priceMedian += (platformOutput[block].priceMedian * newWeight);
                                    allPlatformsOutput[block].priceQ10 += (platformOutput[block].priceQ10 * newWeight);
                                    allPlatformsOutput[block].priceQ90 += (platformOutput[block].priceQ90 * newWeight);
                                    allPlatformsOutput[block].priceMin += (platformOutput[block].priceMin * newWeight);
                                    allPlatformsOutput[block].priceMax += (platformOutput[block].priceMax * newWeight);
                                }

                                // sum liquidities
                                for(const slippageBps of Object.keys(allPlatformsOutput[block].slippageMap)) {
                                    allPlatformsOutput[block].slippageMap[slippageBps].base += platformOutput[block].slippageMap[slippageBps].base;
                                    allPlatformsOutput[block].slippageMap[slippageBps].quote += platformOutput[block].slippageMap[slippageBps].quote;
                                    allPlatformsOutput[block].avgSlippageMap[slippageBps].base += platformOutput[block].avgSlippageMap[slippageBps].base;
                                    allPlatformsOutput[block].avgSlippageMap[slippageBps].quote += platformOutput[block].avgSlippageMap[slippageBps].quote;
                                }
                            }
                        }
                    } else {
                        console.log(`no liquidity data for ${platform} ${pair.base} ${pair.quote}`);
                    }
                }

                if(!allPlatformsOutput) {
                    continue;
                }
                // here, need to compute avg price and volatility for each block
                for(const block of Object.keys(allPlatformsOutput)) {
                    const totalVolatilityWeightForBlock = allPlatformsOutput[block].totalVolatilityWeight || 1;
                    const totalPriceWeightForBlock = allPlatformsOutput[block].totalPriceWeight || 1;

                    allPlatformsOutput[block].volatility = allPlatformsOutput[block].volatility / totalVolatilityWeightForBlock;
                    allPlatformsOutput[block].price = allPlatformsOutput[block].price / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceAvg = allPlatformsOutput[block].priceAvg / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceMedian = allPlatformsOutput[block].priceMedian / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceQ10 = allPlatformsOutput[block].priceQ10 / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceQ90 = allPlatformsOutput[block].priceQ90 / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceMin = allPlatformsOutput[block].priceMin / totalPriceWeightForBlock;
                    allPlatformsOutput[block].priceMax = allPlatformsOutput[block].priceMax / totalPriceWeightForBlock;
                    allPlatformsOutput[block].biggestDailyChange = allPlatformsOutput[block].biggestDailyChange / totalPriceWeightForBlock;

                    // remove from object to use less place in the json
                    delete allPlatformsOutput[block].totalVolatilityWeight;
                    delete allPlatformsOutput[block].totalPriceWeight;
                }

                // then write the data
                const fullFilename = path.join(dirPath, `${pair.base}-${pair.quote}-all.json`);
                fs.writeFileSync(fullFilename, JSON.stringify({ updated: Date.now(), liquidity: allPlatformsOutput }));
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

function generateDashboardDataFromLiquidityData(platformLiquidity, pricesAtBlock, displayBlocks, avgStep, pair, dirPath, platform, rollingVolatility) {
    console.log(`generateDashboardDataFromLiquidityData: starting for ${pair.base}/${pair.quote}`);
    const platformOutputResult = {};
    // compute average liquidity over ~= 30 days for all the display blocks
    const liquidityBlocks = Object.keys(platformLiquidity).map(_ => Number(_));
    // const pricesBlocks = Object.keys(pricesAtBlock).map(_ => Number(_));

    let previousBlock = undefined;
    for (const block of displayBlocks) {
        platformOutputResult[block] = {};
        const nearestBlockBefore = liquidityBlocks.filter(_ => _ <= block).at(-1);
        if (!nearestBlockBefore) {
            throw new Error(`Could not find blocks <= ${block} in liquidity data`);
        }

        platformOutputResult[block].slippageMap = platformLiquidity[nearestBlockBefore].slippageMap;
        const prices = pricesAtBlock.filter(_ => _.block >= block - BLOCK_PER_DAY && _.block <= block).map(_ => _.price);
        if (prices.length == 0) {
            if(previousBlock) {
                platformOutputResult[block].price = platformOutputResult[previousBlock].price;
                platformOutputResult[block].priceAvg = platformOutputResult[previousBlock].priceAvg;
                platformOutputResult[block].priceMedian = platformOutputResult[previousBlock].priceMedian;
                platformOutputResult[block].priceQ10 = platformOutputResult[previousBlock].priceQ10;
                platformOutputResult[block].priceQ90 = platformOutputResult[previousBlock].priceQ90 ;
                platformOutputResult[block].priceMin = platformOutputResult[previousBlock].priceMin;
                platformOutputResult[block].priceMax =  platformOutputResult[previousBlock].priceMax;
            } else {
                platformOutputResult[block].price = 0;
                platformOutputResult[block].priceAvg = 0;
                platformOutputResult[block].priceMedian = 0;
                platformOutputResult[block].priceQ10 = 0;
                platformOutputResult[block].priceQ90 = 0;
                platformOutputResult[block].priceMin = 0;
                platformOutputResult[block].priceMax = 0;
            }
        } else {
            platformOutputResult[block].price = prices.at(-1);
            platformOutputResult[block].priceAvg = average(prices);
            platformOutputResult[block].priceMedian = median(prices);
            platformOutputResult[block].priceQ10 = quantile(prices, 0.1);
            platformOutputResult[block].priceQ90 = quantile(prices, 0.9);
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
        const volatilityAtBlock = rollingVolatility.history.filter(_ => _.blockStart <= block && _.blockEnd >= block)[0];
        if(!volatilityAtBlock) {
            platformOutputResult[block].volatility = 0;
        } else {
            platformOutputResult[block].volatility = volatilityAtBlock.current;
        }

        platformOutputResult[block].avgSlippageMap = avgSlippage;
        previousBlock = block;
    }

    // compute biggest daily change over the last 3 months
    // for each blocks of the platformOutputResult
    computeBiggestDailyChange(pricesAtBlock, platformOutputResult);

    const fullFilename = path.join(dirPath, `${pair.base}-${pair.quote}-${platform}.json`);
    fs.writeFileSync(fullFilename, JSON.stringify({ updated: Date.now(), liquidity: platformOutputResult }));
    return platformOutputResult;
}

function computeBiggestDailyChange(medianPricesAtBlock, platformOutputResult) {
    // here, in 'medianPricesAtBlock', we have all the median prices for every 300 blocks
    // we will now find the biggest daily change over the interval for each blocks of the platform output
    for(const block of Object.keys(platformOutputResult).map(_ => Number(_))) {
        const fromBlock = block - (BLOCK_PER_DAY * BIGGEST_DAILY_CHANGE_OVER_DAYS);
        let currBlock = fromBlock;
        let biggestPriceChangePct = 0;
        let cptDay = 0;
        let label = '';
        while(currBlock <= block) {
            cptDay++;
            const stepTargetBlock = currBlock + BLOCK_PER_DAY;
            const medianPricesForDay = medianPricesAtBlock.filter(_ => _.block >= currBlock && _.block < stepTargetBlock).map(_ => _.price);
            if(medianPricesForDay.length > 0) {
                const minPriceForDay = Math.min(...medianPricesForDay);
                const maxPriceForDay = Math.max(...medianPricesForDay);
        
                let priceChangePctForDay = (maxPriceForDay - minPriceForDay) / minPriceForDay;
                if(priceChangePctForDay > biggestPriceChangePct) {
                    label = `Biggest price change on day ${cptDay} for interval [${currBlock}-${stepTargetBlock}]: ${roundTo(priceChangePctForDay*100)}%. [${minPriceForDay} <> ${maxPriceForDay}]`;
                    biggestPriceChangePct = priceChangePctForDay;
                }
            }

            currBlock = stepTargetBlock;
        }

        if(label) {
            // console.log(label);
        }

        platformOutputResult[block].biggestDailyChange = biggestPriceChangePct;
    }
}

PrecomputeDashboardData();


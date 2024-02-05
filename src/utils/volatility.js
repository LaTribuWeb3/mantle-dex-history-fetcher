const { median } = require('simple-statistics');
const { roundTo, logFnDuration, retry } = require('./utils');
const { BLOCK_PER_DAY, LAMBDA, MEDIAN_OVER_BLOCK } = require('./constants');

/**
 * Compute parkinson liquidity from price dictionary
 * formula: https://portfolioslab.com/tools/parkinson
 * @param {{[blockNumber: number]: number}} priceAtBlock dictionary of prices, for each dictionary key (blocknumber), give the price
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} startBlock 
 * @param {number} endBlock 
 * @param {number} daysToAvg 
 * @returns {number}
 */
function computeParkinsonVolatility(priceAtBlock, fromSymbol, toSymbol, startBlock, endBlock, daysToAvg) {
    const blockNumbers = Object.keys(priceAtBlock);
    let lastPriceHigh = priceAtBlock[blockNumbers[0]];
    let lastPriceLow = priceAtBlock[blockNumbers[0]];
    const rangeValues = [];
    const avgBlockPerDay = Math.round((endBlock - startBlock) / daysToAvg);
    // console.log(`avgBlockPerDay: ${avgBlockPerDay}`);
    for (let T = 0; T < daysToAvg; T++) {
        const blockStart = T * avgBlockPerDay + startBlock;
        const blockEnd = Math.min(blockStart + avgBlockPerDay, endBlock);
        const blocksInRange = blockNumbers.filter(_ => _ >= blockStart && _ < blockEnd);
        // console.log(`# prices in range [${blockStart} - ${blockEnd}]: ${blocksInRange.length}`);
        let highPrice = -1;
        let lowPrice = Number.MAX_SAFE_INTEGER;
        if (blocksInRange.length == 0) {
            highPrice = lastPriceHigh;
            lowPrice = lastPriceLow;
        }
        else {
            for (const block of blocksInRange) {
                const price = priceAtBlock[block];
                if (highPrice < price) {
                    highPrice = price;
                    lastPriceHigh = price;
                }
                if (lowPrice > price) {
                    lowPrice = price;
                    lastPriceLow = price;
                }
            }
        }

        if (highPrice < 0) {
            console.log(`Could not find prices for range [${blockStart} - ${blockEnd}]. Will use last value`);
            if (rangeValues.length == 0) {
                throw new Error(`Could not find even the first value for ${fromSymbol}/${toSymbol}`);
            } else {
                const lastValue = rangeValues.at(-1);
                highPrice = lastValue.high;
                lowPrice = lastValue.low;
            }
        }

        // console.log(`For range [${blockStart} - ${blockEnd}]: low: ${lowPrice} <> high: ${highPrice}. Data #: ${blocksInRange.length}`);
        rangeValues.push({ low: lowPrice, high: highPrice });

    }

    // console.log(rangeValues);
    let sumOfLn = 0;

    let daysCountWithValue = daysToAvg;
    for (let T = 0; T < daysToAvg; T++) {
        const valuesForRange = rangeValues[T];
        if(valuesForRange.low == 0) {
            // empty range, consider 1 less days to avg
            daysCountWithValue--;
            continue;
        }
        const htltRatio = valuesForRange.high / valuesForRange.low;
        const htltRatioSquare = htltRatio * htltRatio;
        const lnHtltRatioSquare = Math.log(htltRatioSquare);
        sumOfLn += lnHtltRatioSquare;
    }

    if(daysCountWithValue == 0) {
        return 0;
    }
    // console.log(daysCountWithValue);

    const prefix = 1 / ((4 * daysCountWithValue) * Math.log(2));

    const insideSqrt = prefix * sumOfLn;

    const volatilityParkinson = Math.sqrt(insideSqrt);
    // console.log(`parkinson volatility for ${fromSymbol}/${toSymbol} for the last ${daysToAvg} days (days with values: ${daysCountWithValue}): ${volatilityParkinson}`);
    return volatilityParkinson;
}

/**
 * Compute median every prices over 300 blocks
 * @param {{ block: number, price: number}[]} pricesAtBlock 
 */
function medianPricesOverBlocks(pricesAtBlock, baseBlock) {
    const start = Date.now();

    let currBlock = baseBlock || pricesAtBlock[0].block;
    console.log(`starting median prices since block ${currBlock} to ${pricesAtBlock.at(-1).block}`);
    const medianPricesAtBlock = [];
    while(currBlock <= pricesAtBlock.at(-1).block) {
        const stepTargetBlock = currBlock + MEDIAN_OVER_BLOCK;
        // only median full block ranges
        if(stepTargetBlock > pricesAtBlock.at(-1).block) {
            break;
        }
        const blocksToMedian =  pricesAtBlock.filter(_ => _.block >= currBlock && _.block < stepTargetBlock);
        if(blocksToMedian.length > 0) {
            const medianPrice = median(blocksToMedian.map(_ => _.price));
            if(medianPrice > 0) {
                medianPricesAtBlock.push({
                    block: currBlock,
                    price: medianPrice,
                });
            }
        }
        
        currBlock = stepTargetBlock;
    }

    logFnDuration(start, pricesAtBlock.length);
    return medianPricesAtBlock;
}

/**
 * Compute the biggest daily change over 3 months after
 * median every prices on 300 blocks
 * @param {{ block: number, price: number}[]} medianPricesAtBlock 
 * @param {number} currentBlock 
 */
function computeBiggestDailyChange(medianPricesAtBlock, currentBlock) {
    const BIGGEST_DAILY_CHANGE_OVER_DAYS = 90; // amount of days to compute the biggest daily change
    const fromBlock = currentBlock - (BLOCK_PER_DAY * BIGGEST_DAILY_CHANGE_OVER_DAYS);

    // here, in 'medianPricesAtBlock', we have all the median prices for every 300 blocks
    // we can now find the biggest change over 1 day
    let currBlock = fromBlock;
    let biggestPriceChangePct = 0;
    let cptDay = 0;
    let label = '';
    while(currBlock <= currentBlock) {
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
        console.log(label);
    }


    return biggestPriceChangePct;
}


/**
 * Compute the biggest daily change over 3 months after
 * median every prices on 300 blocks
 * @param {{ block: number, price: number}[]} medianPricesAtBlock 
 * @param {number} currentBlock 
 * @param {ethers.providers.StaticJsonRpcProvider} web3Provider 
 */
async function rollingBiggestDailyChange(medianPricesAtBlock, web3Provider, lambda = LAMBDA) {
    const start = Date.now();
    const fromBlock = medianPricesAtBlock[0].block;
    const endBlock = await web3Provider.getBlockNumber();
    const oldBlockDateSec =  await retry(async () => (await web3Provider.getBlock(fromBlock)).timestamp, []);
    const currentDateSec = await retry(async () => (await web3Provider.getBlock(endBlock)).timestamp, []);
    const dayDiff = (currentDateSec - oldBlockDateSec) / (24 * 60 * 60);
    const blockPerDay = (endBlock - fromBlock) / dayDiff;
    console.log({blockPerDay});
    // here, in 'medianPricesAtBlock', we have all the median prices for every 300 blocks
    // we can now find the biggest change over 1 day
    let currBlock = fromBlock;
    let currentRollingDailyChange = 0;
    const results = [];
    let lastMinPrice = 0;
    let lastMaxPrice = 0;
    while(currBlock <= endBlock) {
        const yesterdayRollingDailyChange = currentRollingDailyChange;

        let stepTargetBlock = currBlock + blockPerDay;

        // if the next loop will create a day with too few blocks, create a bigger "last day"
        if(stepTargetBlock > endBlock) {
            stepTargetBlock = endBlock + 1;
        }

        const medianPricesForDay = medianPricesAtBlock.filter(_ => _.block >= currBlock && _.block < stepTargetBlock).map(_ => _.price);
        if(medianPricesForDay.length > 0) {
            const minPriceForDay = Math.min(...medianPricesForDay);
            lastMinPrice = minPriceForDay;
            const maxPriceForDay = Math.max(...medianPricesForDay);
            lastMaxPrice = maxPriceForDay;
    
            const priceChangeToday = Math.abs(Math.log(maxPriceForDay/minPriceForDay));
            currentRollingDailyChange = Math.max(lambda * yesterdayRollingDailyChange, priceChangeToday);
        } else {
            // if no data for the block interval, just set current value = LAMBDA * yesterday's value
            currentRollingDailyChange = lambda * yesterdayRollingDailyChange;
        }
        
        results.push({
            yesterday: yesterdayRollingDailyChange,
            current: currentRollingDailyChange,
            blockStart: Math.floor(currBlock),
            blockEnd: Math.floor(stepTargetBlock - 1),
            minPrice: lastMinPrice,
            maxPrice: lastMaxPrice,
        });
        currBlock = stepTargetBlock;
    }

    logFnDuration(start);
    return { latest: results.at(-1), history: results};
}

module.exports = { computeParkinsonVolatility, computeBiggestDailyChange, medianPricesOverBlocks, rollingBiggestDailyChange };
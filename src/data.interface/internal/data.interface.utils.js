
const path = require('path');
const fs = require('fs');
const { DATA_DIR, DEFAULT_STEP_BLOCK, MEDIAN_OVER_BLOCK } = require('../../utils/constants');
const { fnName, logFnDurationWithLabel } = require('../../utils/utils');
const { GetPairToUse } = require('../../global.config');

/**
 * 
 * @param {string} platform 
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 */
function readMedianPricesFile(platform, fromSymbol, toSymbol, fromBlock = undefined, toBlock = undefined) {
    const medianFileName = path.join(DATA_DIR, 'precomputed', 'median', platform, `${fromSymbol}-${toSymbol}-median-prices.csv`);
    if (!fs.existsSync(medianFileName)) {
        console.warn(`readMedianPricesFile: file ${medianFileName} does not exists`);
        return undefined;
    }

    const allData = fs.readFileSync(medianFileName, 'utf-8').split('\n');

    const medianedPrices = [];
    for (let i = 1; i < allData.length - 1; i++) {
        const lineSplitted = allData[i].split(',');
        const block = Number(lineSplitted[0]);

        if(fromBlock && block < fromBlock) {
            continue;
        }

        if(toBlock && block > toBlock) {
            break;
        }

        const obj = {
            block,
            price: Number(lineSplitted[1]),
        };

        medianedPrices.push(obj);
    }

    return medianedPrices;
}

function getPricesAtBlockForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock) {
    const {actualFrom, actualTo} = GetPairToUse(fromSymbol, toSymbol);
    const start = Date.now();

    // specific case for univ3 and stETH/WETH pair
    // because it does not really exists
    if(platform == 'uniswapv3' 
        && ((actualFrom == 'stETH' && actualTo == 'WETH') 
            || (actualFrom == 'WETH' && actualTo == 'stETH'))) {
        const prices = generateFakePriceForStETHWETHUniswapV3(Math.max(fromBlock, 10_000_000), toBlock);
        logFnDurationWithLabel(start, `[${actualFrom}->${actualTo}] [${fromBlock}-${toBlock}] [${platform}]`);
        return prices;
    }
    else {
        const filename = `${actualFrom}-${actualTo}-unified-data.csv`;
        const fullFilename = path.join(DATA_DIR, 'precomputed', 'price', platform, filename);
        const prices = readAllPricesFromFilename(fullFilename, fromBlock, toBlock);
        logFnDurationWithLabel(start, `[${actualFrom}->${actualTo}] [${fromBlock}-${toBlock}] [${platform}]`);
        return prices;
    }
}

/**
 * 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @returns 
 */
function generateFakePriceForStETHWETHUniswapV3(fromBlock, toBlock) {
    const pricesAtBlock = [];
    let currBlock = fromBlock;
    while(currBlock <= toBlock) {
        pricesAtBlock.push({
            block: currBlock,
            price: 1
        });

        currBlock += MEDIAN_OVER_BLOCK;
    }

    return pricesAtBlock;
}

function findNearestBlockBefore(targetBlock, blocks, startIndex) {
    let block = blocks[startIndex];
    let selectedIndex = startIndex;
    for(let i = startIndex + 1; i < blocks.length; i++) {
        const nextBlock = blocks[i];
        if(nextBlock > targetBlock) {
            block = blocks[i-1];
            selectedIndex = i-1;
            break;
        }
        
        block = blocks[i];
        selectedIndex = i;
    }

    if(block > targetBlock) {
        return null;
    }

    return {block, selectedIndex};
}

/**
 * Recursive function to add many steps between fromSymbol and toSymbol
 * @param {string} platform 
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {string[] | undefined} pivotSymbols 
 * @returns 
 */
function getPricesAtBlockForIntervalViaPivots(platform, fromSymbol, toSymbol, fromBlock, toBlock, pivotSymbols) {
    const start = Date.now();
    if(!pivotSymbols || pivotSymbols.length == 0) {
        return getPricesAtBlockForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock);
    } else if (pivotSymbols.length == 1) {
        return getPricesAtBlockForIntervalViaPivot(platform, fromSymbol, toSymbol, fromBlock, toBlock, pivotSymbols[0]);
    }

    const label = `${fnName()}[${fromSymbol}->${pivotSymbols.join('->')}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`;
    console.log(label);
    const dataSegment1 = getPricesAtBlockForIntervalViaPivots(platform, fromSymbol, pivotSymbols.slice(1).at(-1), fromBlock, toBlock, pivotSymbols.slice(0, pivotSymbols.length -1));

    if(!dataSegment1 || dataSegment1.length == 0) {
        console.log(`${label}: Cannot find data for ${fromSymbol}/${pivotSymbols.join('->')}, returning 0`);
        return undefined;
    }

    const dataSegment2 = getPricesAtBlockForInterval(platform, pivotSymbols.at(-1), toSymbol, fromBlock, toBlock);

    if(!dataSegment2 || dataSegment2.length == 0) {
        console.log(`${label}: Cannot find data for ${pivotSymbols.at(-1)}/${toSymbol}, returning 0`);
        return undefined;
    }

    // check whether to compute the price with base data from segment1 or 2
    // based on the number of prices in each segments
    // example if the segment1 has 1000 prices and segment2 has 500 prices
    // we will use segment1 as the base for the blocknumbers in the returned object
    if(dataSegment1.length > dataSegment2.length) {
        // compute all the prices with blocks from segment1
        const pricesAtBlock = ComputePriceViaPivot(dataSegment1, dataSegment2);
        logFnDurationWithLabel(start, `[${fromSymbol}->${pivotSymbols.join('->')}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`);
        return pricesAtBlock;
    } else {
        const pricesAtBlock = ComputePriceViaPivot(dataSegment2, dataSegment1);
        logFnDurationWithLabel(start, `[${fromSymbol}->${pivotSymbols.join('->')}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`);
        return pricesAtBlock;
    }
}

function getPricesAtBlockForIntervalViaPivot(platform, fromSymbol, toSymbol, fromBlock, toBlock, pivotSymbol) {
    const start = Date.now();
    if(!pivotSymbol) {
        return getPricesAtBlockForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock);
    }

    const label = `${fnName()}[${fromSymbol}->${pivotSymbol}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`;
    
    const dataSegment1 = getPricesAtBlockForInterval(platform, fromSymbol, pivotSymbol, fromBlock, toBlock);

    if(!dataSegment1 || dataSegment1.length == 0) {
        console.log(`${label}: Cannot find data for ${fromSymbol}/${pivotSymbol}, returning 0`);
        return undefined;
    }

    const dataSegment2 = getPricesAtBlockForInterval(platform, pivotSymbol, toSymbol, fromBlock, toBlock);

    if(!dataSegment2 || dataSegment2.length == 0) {
        console.log(`${label}: Cannot find data for ${pivotSymbol}/${toSymbol}, returning 0`);
        return undefined;
    }

    // check whether to compute the price with base data from segment1 or 2
    // based on the number of prices in each segments
    // example if the segment1 has 1000 prices and segment2 has 500 prices
    // we will use segment1 as the base for the blocknumbers in the returned object
    if(dataSegment1.length > dataSegment2.length) {
        // compute all the prices with blocks from segment1
        const pricesAtBlock = ComputePriceViaPivot(dataSegment1, dataSegment2);
        logFnDurationWithLabel(start, `[${fromSymbol}->${pivotSymbol}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`);
        return pricesAtBlock;
    } else {
        const pricesAtBlock = ComputePriceViaPivot(dataSegment2, dataSegment1);
        logFnDurationWithLabel(start, `[${fromSymbol}->${pivotSymbol}->${toSymbol}] [${fromBlock}-${toBlock}] [${platform}]`);
        return pricesAtBlock;
    }
}

function ComputePriceViaPivot(dataSegment1, dataSegment2) {
    const priceAtBlock = [];
    const keysSegment2 = dataSegment2.map(_ => _.block);
    let currentBlockOtherSegmentIndex = 0;

    for (const priceAtBlockData of dataSegment1) {
        // for(const [blockNumber, priceSegment1] of Object.entries(dataSegment1)) {
        const blockNumber = priceAtBlockData.block;
        const priceSegment1 = priceAtBlockData.price;
        const nearestBlockDataBefore = findNearestBlockBefore(blockNumber, keysSegment2, currentBlockOtherSegmentIndex);
        if (!nearestBlockDataBefore) {
            // console.log(`ignoring block ${blockNumber}`);
            continue;
        }

        currentBlockOtherSegmentIndex = nearestBlockDataBefore.selectedIndex;

        const priceSegment2 = dataSegment2[currentBlockOtherSegmentIndex].price;
        const computedPrice = priceSegment1 * priceSegment2;
        priceAtBlock.push({
            block: blockNumber,
            price: computedPrice
        });
    }

    return priceAtBlock;
}

/**
 * 
 * @param {string} fullFilename 
 * @param {number} fromBlock 
 * @param {number} toBlock 
 */
function readAllPricesFromFilename(fullFilename, fromBlock, toBlock) {
    if(!fs.existsSync(fullFilename)) {
        return undefined;
    }

    const pricesAtBlock = [];
    const fileContent = readDataFromFile(fullFilename);
    for (let i = 1; i < fileContent.length - 1; i++) {
        const lineContent = fileContent[i];
        const blockNumber = Number(lineContent.split(',')[0]);

        if (blockNumber < fromBlock) {
            continue;
        }

        if (blockNumber > toBlock) {
            break;
        }

        const splt = lineContent.split(',');
        const price = Number(splt[1]);

        pricesAtBlock.push({
            block: blockNumber,
            price: price
        });
    }

    return pricesAtBlock;
}

/**
 * Gets the unified data from csv files
 * @param {string} platform
 * @param {string} fromSymbol
 * @param {string} toSymbol
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @param {string[]} alreadyUsedPools the pools already used
 * @returns {{unifiedData: {[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}}, usedPools: string[]}}
 */
function getUnifiedDataForInterval(platform, fromSymbol, toSymbol, fromBlock, toBlock, stepBlock= DEFAULT_STEP_BLOCK, alreadyUsedPools) {
    if(platform == 'curve') {
        return getUnifiedDataForIntervalForCurve(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
    }

    if(platform == 'balancer') {
        return getUnifiedDataForIntervalForBalancer(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock, alreadyUsedPools);
    }

    const filename = `${fromSymbol}-${toSymbol}-unified-data.csv`;
    // generate pool name using fromsymbol and tosymbol sorted by alphabetical order
    // so that for example the pair USDC/WETH and WETH/USDC are not used two times (because it would come from the same pool)
    const poolName = [fromSymbol, toSymbol].sort((a,b) => a.localeCompare(b)).join('-') + `-${platform}-pool`;
    const fullFilename = path.join(DATA_DIR, 'precomputed', platform, filename);

    if(alreadyUsedPools.includes(poolName)) {
        console.log(`pool ${poolName} already used, cannot reuse it`);
        return undefined;
    }


    const unifiedData = getUnifiedDataForIntervalByFilename(fullFilename, fromBlock, toBlock, stepBlock);

    const usedPools = unifiedData ? [poolName] : [];
    return { unifiedData, usedPools};
}

/**
 * Gets the unified data from csv files
 * @param {string} fullFilename
 * @param {number} fromBlock 
 * @param {number} toBlock 
 * @returns {{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: number}}}}
 */
function getUnifiedDataForIntervalByFilename(fullFilename, fromBlock, toBlock, stepBlock= DEFAULT_STEP_BLOCK) {
    // try to find the data
    if(!fs.existsSync(fullFilename)) {
        // console.log(`Could not find file ${fullFilename}`);
        return undefined;
    }

    // console.log(`${fnName()}: ${fullFilename} found! Extracting data since ${fromBlock} to ${toBlock}`);

    const fileContent = readDataFromFile(fullFilename);
    const unifiedData = getBlankUnifiedData(fromBlock, toBlock, stepBlock);
    const blocksToFill = Object.keys(unifiedData).map(_ => Number(_));
    let currentIndexToFill = 0;

    for(let i = 1; i < fileContent.length - 1; i++) {
        const blockNumber = Number(fileContent[i].split(',')[0]);

        if(blockNumber > toBlock) {
            break;
        }
        let nextBlockNumber = Number(fileContent[i+1].split(',')[0]);

        // on the last line, consider the nextBlockNumber to be the toBlock + 1
        // this will fill the unifiedData dictionary up until the toBlock with the last data we
        // have in the csv file
        if(i == fileContent.length -2) {
            nextBlockNumber = toBlock + 1;
        }
        let blockToFill = blocksToFill[currentIndexToFill];

        while(blockToFill < blockNumber) {
            unifiedData[blockToFill] = {
                price: 0,
                slippageMap: getDefaultSlippageMap()
            };

            currentIndexToFill++;
            blockToFill = blocksToFill[currentIndexToFill];
        }

        if(nextBlockNumber > blockToFill) {
            const data = extractDataFromUnifiedLine(fileContent[i]);

            while(nextBlockNumber > blockToFill) {
                unifiedData[blockToFill] = {
                    price: data.price,
                    slippageMap: structuredClone(data.slippageMap)
                };
                currentIndexToFill++;
                blockToFill = blocksToFill[currentIndexToFill];

                if(currentIndexToFill >= blocksToFill.length) {
                    break;
                }
            }
        }
    }

    if(currentIndexToFill == 0) {
        console.log(`Could not find data in file ${fullFilename} since block ${fromBlock}`);
        const latestData = extractDataFromUnifiedLine(fileContent[fileContent.length-2]);
        if(latestData.blockNumber < fromBlock) {
            console.log(`Will use latest data at block ${latestData.blockNumber} to fill unified data`);
            for(const blockNumber of blocksToFill) {
                unifiedData[blockNumber] = {
                    price: latestData.price,
                    slippageMap: structuredClone(latestData.slippageMap)
                };
            }

            return unifiedData;
        } else {
            console.log(`Could not find any blocks before ${fromBlock} in file ${fullFilename}`);
            return undefined;
        }
    }

    // if exited before filling every blocks, add last value to all remaining
    // I THINK THIS IS USELESS
    const lastFilledIndex = currentIndexToFill-1;
    while(currentIndexToFill < blocksToFill.length) {
        unifiedData[blocksToFill[currentIndexToFill]] = {
            price: structuredClone(unifiedData[blocksToFill[lastFilledIndex]].price),
            slippageMap: structuredClone(unifiedData[blocksToFill[lastFilledIndex]].slippageMap)
        };
        currentIndexToFill++;
    }

    return unifiedData;
}

function readDataFromFile(fullFilename) {
    return fs.readFileSync(fullFilename, 'utf-8').split('\n');
}

function getUnifiedDataForIntervalForCurve(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock= DEFAULT_STEP_BLOCK, alreadyUsedPools) {
    // for curve, find all files in the precomputed/curve directory that math the fromSymbol-toSymbol.*.csv
    const searchString = `${fromSymbol}-${toSymbol}`;
    const directory = path.join(DATA_DIR, 'precomputed', 'curve');
    const matchingFiles = fs.readdirSync(directory).filter(_ => _.startsWith(searchString) && _.endsWith('.csv'));
    // console.log(`found ${matchingFiles.length} matching files for ${searchString}`);

    const usedPools = [];
    const unifiedDataForPools = [];
    for(const matchingFile of matchingFiles) {
        const poolName = matchingFile.split('-')[2];
        if(alreadyUsedPools.includes(poolName)) {
            console.log(`pool ${poolName} already used, cannot reuse it`);
            continue;
        }
        const fullFilename = path.join(directory, matchingFile);

        const unifiedDataForFile = getUnifiedDataForIntervalByFilename(fullFilename, fromBlock, toBlock, stepBlock);
        if(unifiedDataForFile) {
            // console.log(`adding data from pool ${poolName}`);
            unifiedDataForPools.push(unifiedDataForFile);
            usedPools.push(poolName);
        }
    }

    if(unifiedDataForPools.length == 0) {
        return { unifiedData: undefined, usedPools: [] };
    }

    const unifiedData = unifiedDataForPools[0];
    
    if(unifiedDataForPools.length > 1) {
        for(const block of Object.keys(unifiedData)) {
            let nonZeroPriceCounter = unifiedData[block].price == 0 ? 0 : 1;
            for(let i = 1; i < unifiedDataForPools.length; i++) {
                const unifiedDataToAdd = unifiedDataForPools[i];
        
                for(const slippageBps of Object.keys(unifiedData[block].slippageMap)) {
                    unifiedData[block].slippageMap[slippageBps].base += unifiedDataToAdd[block].slippageMap[slippageBps].base;
                    unifiedData[block].slippageMap[slippageBps].quote += unifiedDataToAdd[block].slippageMap[slippageBps].quote;
                }

                if(unifiedDataToAdd[block].price > 0) {
                    nonZeroPriceCounter++;
                }

                unifiedData[block].price += unifiedDataToAdd[block].price;
            }
            
            // save avg price for each pools
            unifiedData[block].price = nonZeroPriceCounter == 0 ? 0 : unifiedData[block].price / nonZeroPriceCounter;
        }
    }

    return { unifiedData, usedPools };
}



function getUnifiedDataForIntervalForBalancer(fromSymbol, toSymbol, fromBlock, toBlock, stepBlock= DEFAULT_STEP_BLOCK, alreadyUsedPools) {
    // for curve, find all files in the precomputed/curve directory that math the fromSymbol-toSymbol.*.csv
    const searchString = `${fromSymbol}-${toSymbol}`;
    const directory = path.join(DATA_DIR, 'precomputed', 'balancer');
    const matchingFiles = fs.readdirSync(directory).filter(_ => _.startsWith(searchString) && _.endsWith('unified-data.csv'));
    // console.log(`found ${matchingFiles.length} matching files for ${searchString}`);

    const usedPools = [];
    const unifiedDataForPools = [];
    for(const matchingFile of matchingFiles) {
        // for balancer, the file name is: "ezETH-rswETH-Balancer-weETH-ezETH-rswETH-unified-data.csv"
        // where "ezETH-rswETH" is the searchString
        // "Balancer-weETH-ezETH-rswETH" is the pool name
        // and unified-data is always at the end
        const poolName = matchingFile.replace(searchString + '-', '').replace('-unified-data.csv', '');
        if(alreadyUsedPools.includes(poolName)) {
            console.log(`pool ${poolName} already used, cannot reuse it`);
            continue;
        }
        const fullFilename = path.join(directory, matchingFile);

        const unifiedDataForFile = getUnifiedDataForIntervalByFilename(fullFilename, fromBlock, toBlock, stepBlock);
        if(unifiedDataForFile) {
            // console.log(`adding data from pool ${poolName}`);
            unifiedDataForPools.push(unifiedDataForFile);
            usedPools.push(poolName);
        }
    }

    if(unifiedDataForPools.length == 0) {
        return { unifiedData: undefined, usedPools: [] };
    }

    const unifiedData = unifiedDataForPools[0];
    
    if(unifiedDataForPools.length > 1) {
        for(const block of Object.keys(unifiedData)) {
            let nonZeroPriceCounter = unifiedData[block].price == 0 ? 0 : 1;
            for(let i = 1; i < unifiedDataForPools.length; i++) {
                const unifiedDataToAdd = unifiedDataForPools[i];
        
                for(const slippageBps of Object.keys(unifiedData[block].slippageMap)) {
                    unifiedData[block].slippageMap[slippageBps].base += unifiedDataToAdd[block].slippageMap[slippageBps].base;
                    unifiedData[block].slippageMap[slippageBps].quote += unifiedDataToAdd[block].slippageMap[slippageBps].quote;
                }

                if(unifiedDataToAdd[block].price > 0) {
                    nonZeroPriceCounter++;
                }

                unifiedData[block].price += unifiedDataToAdd[block].price;
            }
            
            // save avg price for each pools
            unifiedData[block].price = nonZeroPriceCounter == 0 ? 0 : unifiedData[block].price / nonZeroPriceCounter;
        }
    }

    return { unifiedData, usedPools };
}

/**
 * Instanciate a default slippage map: from 50 bps to 2000, containing only 0 volume
 * @returns {{[slippageBps: number]: {base: number, quote: number}}}
 */
function getDefaultSlippageMap() {
    const slippageMap = {};
    for(let i = 50; i <= 2000; i+=50) {
        slippageMap[i] = {
            base: 0,
            quote: 0
        };
    }
    return slippageMap;
}

/**
 * This function returns an object preinstanciated with all the blocks that will need to be filled
 * @param {number} startBlock 
 * @param {number} endBlock 
 * @param {number} stepBlock amount of blocks between two steps, default to 50
 * @returns {{[blocknumber: number]: {}}}
 */
function getBlankUnifiedData(startBlock, endBlock, stepBlock= DEFAULT_STEP_BLOCK) {
    if(stepBlock < 50) {
        console.log(`getBlankUnifiedData: cannot use stepBlock= ${stepBlock}, min value is 50`);
        stepBlock = 50;
    }
    const unifiedData = {};
    let currentBlock = startBlock;
    while(currentBlock <= endBlock) {
        unifiedData[currentBlock] = {};
        currentBlock += stepBlock;
    }

    return unifiedData;
}

/**
 * Read a unified data line and transform it into an object
 * @param {string} line 
 * @returns {{blockNumber: number, price: number, slippageMap: {[slippageBps: string]: number}}}
 */
function extractDataFromUnifiedLine(line) {
    const splt = line.split(',');
    const blockNumber = splt[0];
    const price = splt[1];
    const slippageMapJson = line.replace(`${blockNumber},${price},`, '');
    const slippageMap = JSON.parse(slippageMapJson);

    return {
        blockNumber: Number(blockNumber),
        price: Number(price),
        slippageMap: slippageMap,
    };
}

module.exports = { getUnifiedDataForInterval, getBlankUnifiedData, getDefaultSlippageMap, readMedianPricesFile, getPricesAtBlockForIntervalViaPivots, getUnifiedDataForIntervalByFilename, extractDataFromUnifiedLine };
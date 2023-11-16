
const BigNumber = require('bignumber.js');
const { fnName } = require('../utils/utils');
const fs = require('fs');
const path = require('path');
const { getDefaultSlippageMap } = require('../data.interface/internal/data.interface.utils');

const CONSTANT_1e18 = new BigNumber(10).pow(18);
const CONSTANT_TARGET_SLIPPAGE = 20;

/**
 * Calculate the price of token0 vs token1.
 * @param {number} currentTick 
 * @param {number} token0Decimals 
 * @param {number} token1Decimals 
 * @returns {number} the price of token0. which mean how much token1 can 1 token0 buy. 1/this result gives the price of token1 vs token0
 */
function getPriceNormalized(currentTick, token0Decimals, token1Decimals) {
    const token0DecimalFactor = 10 ** token0Decimals;
    const token1DecimalFactor = 10 ** token1Decimals;
    const price = getTickPrice(currentTick);
    const priceToken0VsToken1 = price * token0DecimalFactor / token1DecimalFactor;
    return priceToken0VsToken1;
}

function getTickPrice(tick) {
    return 1.0001 ** tick;
}

function getTickForPrice(price) {
    // price = 1.0001 ^ tick
    // tick = ln(price) / ln(1.0001)
    return Math.log(price) / Math.log(1.0001);
}

/**
 * Get the next lower tick as the current tick returned can sometimes not be in the valid range
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @returns {number} Valid tick
 */
function getNextLowerTick(currentTick, tickSpacing) {
    return (Math.floor(currentTick / tickSpacing)) * tickSpacing;
}

function getSlippages(currentTick, tickSpacing, sqrtPriceX96, liquidity, token0Decimals, token1Decimals) {
    const token0Slippage = GetAmountXDumpable(currentTick, tickSpacing, liquidity, token0Decimals, token1Decimals, sqrtPriceX96);
    // const token0Slippage = get_dumpable_amount_x(currentTick, tickSpacing, sqrtPriceX96, liquidity, token0Decimals); // GetXAmountForSlippages(currentTick, tickSpacing, liquidity, token0Decimals, sqrtPriceX96);
    const token1Slippage = GetAmountYDumpable(currentTick, tickSpacing, liquidity, token0Decimals, token1Decimals, sqrtPriceX96);
    // const token1Slippage = get_dumpable_amount_y(currentTick, tickSpacing, sqrtPriceX96, liquidity, token1Decimals); // GetYAmountForSlippages(currentTick, tickSpacing, liquidity, token1Decimals, sqrtPriceX96);

    return {token0Slippage, token1Slippage};
}

function getPriceFromSqrt(sqrtPriceX96, token0Decimals, token1Decimals) {
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96.toString()).div(_96bits);
    let P = sqrtP.times(sqrtP).toNumber();
    if(token0Decimals != token1Decimals) {
        const token0DecimalFactor = 10 ** token0Decimals;
        const token1DecimalFactor = 10 ** token1Decimals;
        P = P * token0DecimalFactor / token1DecimalFactor;
    }

    return P;
}

// function test() {
//     const latestData = JSON.parse(fs.readFileSync('data/uniswapv3/wstETH-WETH-100-latestdata.json', 'utf-8'));
//     const slippages = getSlippages(latestData.currentTick, latestData.tickSpacing, latestData.currentSqrtPriceX96, latestData.ticks, 18, 18);
//     fs.writeFileSync('wstETH-ETHSlippages.json', JSON.stringify(slippages, null, 2));
// }

// test();

/**
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @param {{[tick: number]: number}} liquidities 
 * @param {number} tokenDecimals 
 * @param {string} sqrtPriceX96 
 * @returns {[slippageBps: number]: number}
 */
function GetAmountXDumpable(currentTick, tickSpacing, liquidities, token0Decimals, token1Decimals, sqrtPriceX96) {
    const result = {};
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits);
    const P = sqrtP.times(sqrtP).toNumber();
    const decimal0Factor = new BigNumber(10).pow(token0Decimals);
    const decimal1Factor = new BigNumber(10).pow(token1Decimals);

    let workingTick = getNextLowerTick(currentTick, tickSpacing);
    let totalY = 0;
    let totalX = 0;

    // store tick [tickNumber]: slippageBps
    const relevantTicks = {};
    for(let slippageBps = 50; slippageBps <= CONSTANT_TARGET_SLIPPAGE * 100; slippageBps += 50) {
        const targetPrice = P * (10000 - slippageBps)/10000;
        const targetPriceTick = getTickForPrice(targetPrice);
        const spacingTargetPriceTick = getNextLowerTick(targetPriceTick, tickSpacing);
        if(!relevantTicks[spacingTargetPriceTick] && spacingTargetPriceTick < workingTick ) {
            relevantTicks[spacingTargetPriceTick] = slippageBps;
        }
    }
    
    const minTarget = Math.min(...Object.keys(relevantTicks).map(_ => Number(_)));

    while(workingTick >= minTarget) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        if(!L.isNaN()) {
            // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let yLiquidityInTick = new BigNumber(0);

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
            // We want X so don't care for this case
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                const y = L.times(sqrtPb - sqrtPa);
                yLiquidityInTick = y;
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                const y = L.times(sqrtP - sqrtPa);
                yLiquidityInTick = y;
            }

            // here we have the amount of Y liquidity in the tick
            // we can compute how much X we have to sell to buy this liquidity
            const xAmountToSell = yLiquidityInTick.div(decimal0Factor).toNumber() / pa;
            totalX += xAmountToSell;
            totalY += yLiquidityInTick.div(decimal1Factor).toNumber();
            // console.log(`[${workingTick}]: liquidity at tick: ${yLiquidityInTick} y. Sold ${xAmountToSell} x to buy it all. New total sold: ${totalX}`);
            if(relevantTicks[workingTick]) {
                result[relevantTicks[workingTick]] = {base: totalX, quote: totalY};
                // result[relevantTicks[workingTick]] = {
                //     totalYAvailable: totalY,
                //     totalXToSell: totalX,
                // };
            }
        }

        workingTick -= tickSpacing;
    }

    return result;
}

/**
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @param {{[tick: number]: number}} liquidities 
 * @param {number} tokenDecimals 
 * @param {string} sqrtPriceX96 
 * @returns {[slippageBps: number]: number}
 */
function GetAmountYDumpable(currentTick, tickSpacing, liquidities,  token0Decimals, token1Decimals, sqrtPriceX96) {
    const result = {};
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimal0Factor = new BigNumber(10).pow(token0Decimals);
    const decimal1Factor = new BigNumber(10).pow(token1Decimals);

    let workingTick = getNextLowerTick(currentTick, tickSpacing);
    let totalX = 0;
    let totalY = 0;

    // store tick [tickNumber]: slippageBps
    const relevantTicks = {};
    for(let slippageBps = 50; slippageBps <= CONSTANT_TARGET_SLIPPAGE * 100; slippageBps += 50) {
        const targetPrice = P * (10000 + slippageBps)/10000;
        const targetPriceTick = getTickForPrice(targetPrice);
        const spacingTargetPriceTick = getNextLowerTick(targetPriceTick, tickSpacing);
        if(!relevantTicks[spacingTargetPriceTick] && spacingTargetPriceTick > workingTick ) {
            relevantTicks[spacingTargetPriceTick] = slippageBps;
        }
    }

    const maxTarget = Math.max(...Object.keys(relevantTicks).map(_ => Number(_)));

    while(workingTick <= maxTarget) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);

        if(!L.isNaN()) {
            // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let xLiquidityInTick = new BigNumber(0);

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                const x = L.times(sqrtPb - sqrtPa).div(sqrtPa * sqrtPb);
                xLiquidityInTick = x;
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                // We want X so don't care for this case
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                const x = L.times(sqrtPb - sqrtP).div(sqrtP * sqrtPb);
                xLiquidityInTick = x;
            }

            // here we have the amount of X liquidity in the tick
            // we can compute how much Y we have to sell to buy this liquidity
            const yAmountToSell = xLiquidityInTick.div(decimal1Factor).toNumber() * pa;
            totalX += xLiquidityInTick.div(decimal0Factor).toNumber();
            totalY += yAmountToSell;
            // console.log(`[${workingTick}]: liquidity at tick: ${xLiquidityInTick} x. Sold ${yAmountToSell} y to buy it all. New total sold: ${totalY}`);

            if(relevantTicks[workingTick]) {
                result[relevantTicks[workingTick]] = {base: totalY, quote: totalX};
                // result[relevantTicks[workingTick]] = {
                //     totalXAvailable: totalX,
                //     totalYToSell: totalY,
                // };
            }
        }
        
        workingTick += tickSpacing;
    }

    return result;
}

function getAvailableUniswapV3(dataDir) {
    const available = {};
    const files = fs.readdirSync(`${dataDir}/uniswapv3/`).filter(_ => _.endsWith('.csv'));
    for(const file of files) {
        const splitted = file.split('-');

        const tokenA = splitted[0];
        const tokenB = splitted[1];
        if(!available[tokenA]) {
            available[tokenA] = [];
        }
        if(!available[tokenB]) {
            available[tokenB] = [];
        }

        if(!available[tokenA].includes(tokenB)) {
            available[tokenA].push(tokenB);
        }

        if(!available[tokenB].includes(tokenA)) {
            available[tokenB].push(tokenA);
        }
    }

    return available;
}

function getUniV3DataFiles(dataDir, fromSymbol, toSymbol) {
    
    const allUniv3Files = fs.readdirSync(path.join(dataDir, 'uniswapv3')).filter(_ => _.endsWith('.csv'));
    
    let searchKey = `${fromSymbol}-${toSymbol}`;
    let reverse = false;
    let selectedFiles = allUniv3Files.filter(_ => _.startsWith(searchKey));
    if(selectedFiles.length == 0) {
        let searchKey = `${toSymbol}-${fromSymbol}`;
        reverse = true;
        selectedFiles = allUniv3Files.filter(_ => _.startsWith(searchKey));

    }

    return {selectedFiles, reverse};
}

/**
 * 
 * @param {string} dataDir 
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {number[]} blockRange 
 * @returns {{[targetBlock: number]: {blockNumber: number, price: number, slippageMap: {[slippagePct: number]: number}}}}
 */
function getUniV3DataforBlockInterval(dataDir, fromSymbol, toSymbol, sinceBlock, toBlock) {
    console.log(`${fnName()}: Searching for ${fromSymbol}/${toSymbol} since ${sinceBlock} to ${toBlock}`);
    
    const results = {};

    const {selectedFiles, reverse} = getUniV3DataFiles(dataDir, fromSymbol, toSymbol);

    if(selectedFiles.length == 0) {
        console.log(`Could not find univ3 files for ${fromSymbol}/${toSymbol}`);
        return results;
    }

    const dataContents = getUniV3DataContents(selectedFiles, dataDir, sinceBlock);

    // get all blocks with data from all selected files
    let allBlocks = new Set();
    const keys = {};
    for(const filename of selectedFiles) {
        keys[filename] = Object.keys(dataContents[filename]).map(_ => Number(_));
        for(const key of keys[filename]) {
            allBlocks.add(key);
        }
    }

    // sort them
    allBlocks = Array.from(allBlocks).sort((a,b) => a-b);

    // console.log(`selected base file: ${baseFile}`);
    for(const targetBlock of allBlocks) {
        if(targetBlock < sinceBlock) {
            continue;
        }
        if(targetBlock > toBlock) {
            break;
        }

        let minBlockDistance = Number.MAX_SAFE_INTEGER;
        let selectedNearestBlockNumber = 0;
        let selectedPrice = 0;
        const blockSlippageMap = getDefaultSlippageMap();
        for(const filename of selectedFiles) {
            const nearestBlockNumbers = keys[filename].filter(_ => Number(_) <= targetBlock);
            if(nearestBlockNumbers.length == 0) {
                continue; // no available data in source
            }

            const nearestBlockNumber = nearestBlockNumbers.at(-1);
            // console.log(`[${targetBlock}] ${filename} nearest block value is ${nearestBlockNumber}. Distance: ${targetBlock-nearestBlockNumber}`);
            const slippageMap = dataContents[filename][nearestBlockNumber][`${fromSymbol}-slippagemap`];
            
            // if the slippage map is empty, ignore completely
            if(Object.keys(slippageMap).length == 0) {
                continue;
            }

            const blockDistance = Math.abs(targetBlock - nearestBlockNumber);
            // this select the data from the file with the closest block
            // normally, it select the file from which the block comes from
            if(blockDistance < minBlockDistance) {
                // console.log(`min distance updated with ${blockDistance} from file ${filename}`);
                minBlockDistance = blockDistance;
                selectedPrice = reverse ? dataContents[filename][nearestBlockNumber].p1vs0 : dataContents[filename][nearestBlockNumber].p0vs1;
                selectedNearestBlockNumber = nearestBlockNumber;
            }

            let slippageBps = 50;
            while (slippageBps <= CONSTANT_TARGET_SLIPPAGE * 100) {
                let slippageObj = slippageMap[slippageBps];
                if(!slippageObj) {
                    // find the closest value that is < slippageBps
                    const sortedAvailableSlippageBps = Object.keys(slippageMap).filter(_ => _ < slippageBps).sort((a,b) => b - a);
                    if(sortedAvailableSlippageBps.length == 0) {
                        slippageObj = {
                            base: 0,
                            quote: 0
                        };
                    } else {
                        slippageObj = slippageMap[sortedAvailableSlippageBps[0]];
                    }
                } 

                if(slippageObj.base < 0) {
                    slippageObj.base = 0;
                }
                if(slippageObj.quote < 0) {
                    slippageObj.quote = 0;
                }

                blockSlippageMap[slippageBps].base += slippageObj.base;
                blockSlippageMap[slippageBps].quote += slippageObj.quote;
                slippageBps += 50;
            }
        }

        if(selectedPrice > 0 ) {
            results[targetBlock] = {
                blockNumber: selectedNearestBlockNumber,
                price: selectedPrice,
                slippageMap: blockSlippageMap
            };
        }
    }

    return results;
}

/**
 * 
 * @param {*} selectedFiles 
 * @param {*} dataDir 
 * @param {*} minBlock 
 */
function getUniV3DataContents(selectedFiles, dataDir, minBlock=0) {
    const dataContents = {};
    for (let i = 0; i < selectedFiles.length; i++) {
        const selectedFile = selectedFiles[i];
        dataContents[selectedFiles[i]] = {};
        const fileContent = fs.readFileSync(path.join(dataDir, 'uniswapv3', selectedFile), 'utf-8').split('\n')
            // remove first line, which is headers
            .splice(1);

        // remove last line, which is empty
        fileContent.pop();

        let lastLine = fileContent[0];
        for (let j = 1; j < fileContent.length; j++) {
            const blockNumber = Number(fileContent[j].split(',')[0]);
            if(blockNumber < minBlock) {
                lastLine = fileContent[j];
                continue;
            }

            // when breaching the minblock, save the last line
            if(blockNumber > minBlock && lastLine) {
                const lastLineBlockNumber = Number(lastLine.split(',')[0]);
                const lastLineJsonStr = lastLine.replace(`${lastLineBlockNumber},`, '');
                const lastLineParsed = JSON.parse(lastLineJsonStr);
                dataContents[selectedFile][lastLineBlockNumber] = lastLineParsed;
                lastLine = null;
            }

            const jsonStr = fileContent[j].replace(`${blockNumber},`, '');
            const parsed = JSON.parse(jsonStr);
            dataContents[selectedFile][blockNumber] = parsed;
        }

        // if lastline is still instancied, it means we never breached the minBlock and that the
        // datacontent for the file is empty
        // in that case, just save the last line as the only point
        if(lastLine && Object.keys(dataContents[selectedFile]) == 0) {
            const lastLineBlockNumber = Number(lastLine.split(',')[0]);
            const lastLineJsonStr = lastLine.replace(`${lastLineBlockNumber},`, '');
            const lastLineParsed = JSON.parse(lastLineJsonStr);
            dataContents[selectedFile][lastLineBlockNumber] = lastLineParsed;
        }
    }
    
    return dataContents;
}

module.exports = { getPriceNormalized, getSlippages, getAvailableUniswapV3, getUniV3DataforBlockInterval, getPriceFromSqrt };
const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { additionalLiquidityConfig } = require('./precomputer.config');
const { utils } = require('ethers');
const { getAverageLiquidity } = require('../data.interface/data.interface');
const { DATA_DIR } = require('../utils/constants');
const { getUnifiedDataForIntervalByFilename, extractDataFromUnifiedLine } = require('../data.interface/internal/data.interface.utils');
const { getPrices } = require('../data.interface/internal/data.interface.price');
dotenv.config();

const runEverySec = 60 * 60;

const WORKER_NAME = 'Additional Liquidity Computer';

async function AdditionalLiquidityComputer(onlyOnce = false) {
    // eslint-disable-next-line no-constant-condition
    console.log('Starting additional liquidity computer')
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'running',
                'lastStart': Math.round(start/1000),
                'runEvery': runEverySec
            });

            // get config to know what tokens to transform
            for(const platform of Object.keys(additionalLiquidityConfig)) {
                const platformConfig = additionalLiquidityConfig[platform];
                console.log(`working on ${platform}`, {platformConfig});

                for(const onePlatformConfig of platformConfig) {
                    const itemsToTransform = getFilesForPlatform(onePlatformConfig.from, onePlatformConfig.pivot, platform);
                    console.log(`Working on ${itemsToTransform.length} files: ${itemsToTransform.map(_ => _.filename).join(',')}`);

                    for(const itemToTransform of itemsToTransform) {
                        await transformLiquidityDataForFilename(platform, onePlatformConfig, itemToTransform);
                    }
                }
            }

            const runEndDate = Math.round(Date.now()/1000);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start/1000),
            });
        } catch(error) {
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'error',
                'error': errorMsg
            });
        }

        if(onlyOnce) {
            return;
        }
        const sleepTime = runEverySec * 1000 - (Date.now() - start);
        if(sleepTime > 0) {
            console.log(`${fnName()}: sleeping ${roundTo(sleepTime/1000/60)} minutes`);
            await sleep(sleepTime);
        }
    }
}

function getFilesForPlatform(from, to, platform) {
    const filenamesToTransform = [];
    const filenames = fs.readdirSync(path.join(DATA_DIR, 'precomputed', platform)).filter(_ => _.endsWith('unified-data.csv'));
    for(const filename of filenames) {
        const base = filename.split('-')[0];
        const quote = filename.split('-')[1];

        if(base == from && quote == to) {
            filenamesToTransform.push({filename, reversed: false, base, quote});
        }

        if(base == to && quote == from) {
            filenamesToTransform.push({filename, reversed: true, base, quote});
        }
    }

    return filenamesToTransform;
}

async function transformLiquidityDataForFilename(platform, config, itemToTransform) {
    console.log(`Working on ${platform} for file ${itemToTransform.filename}`);

    const csvLines = getDataFromFile(path.join(DATA_DIR, 'precomputed', platform, itemToTransform.filename));
    const prices = getPrices(config.priceSource, config.priceFrom, config.priceTo);

    const reverse = config.from == itemToTransform.quote;
    // stETH-WETH-stETHngPool-unified-data.csv
    const targetFileName = itemToTransform.filename.replace(config.from, config.to);
    const linesToWrite = [];
    linesToWrite.push('blocknumber,price,slippagemap\n');

    for(let i = 0; i < csvLines.length -1; i++) {
        const lineToTransform = csvLines[i];
        const unifiedData = extractDataFromUnifiedLine(lineToTransform);
        const closestPrice = getClosestPrice(prices, unifiedData.blockNumber);
        if(!closestPrice) {
            continue;
        }

        const targetUnifiedData = structuredClone(unifiedData);
        targetUnifiedData.price = reverse ? unifiedData.price/closestPrice : unifiedData.price * closestPrice;
        for(const slippageBps of Object.keys(targetUnifiedData.slippageMap)) {
            if(reverse) {
                targetUnifiedData.slippageMap[slippageBps].quote /= closestPrice;
            } else {
                targetUnifiedData.slippageMap[slippageBps].base /= closestPrice;
            }
        }

        const lineToWrite = `${targetUnifiedData.blockNumber},${targetUnifiedData.price},${JSON.stringify(targetUnifiedData.slippageMap)}\n`;
        linesToWrite.push(lineToWrite);
    }

    if(linesToWrite.length >= 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'precomputed', platform, targetFileName), linesToWrite.join(''));
    }
}

function getDataFromFile(fullfilename) {
    return fs.readFileSync(fullfilename, 'utf-8').split('\n').slice(1);
}

function getClosestPrice(prices, blocknumber) {
    // Filter out blocks with blocknumber greater than the input
    const eligiblePrices = prices.filter(item => item.block <= blocknumber);

    // If no eligible prices, return null or a default value
    if (!eligiblePrices.length) {
        return undefined;
    } 

    // Sort the eligible prices by the closest blocknumber
    eligiblePrices.sort((a, b) => b.block - a.block);

    // Return the price of the closest blocknumber
    return eligiblePrices[0].price;
}

AdditionalLiquidityComputer(true);
module.exports = { AdditionalLiquidityComputer };
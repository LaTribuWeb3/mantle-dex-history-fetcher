const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');
const { ethers } = require('ethers');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { DATA_DIR, PLATFORMS } = require('../utils/constants');
const { getPricesAtBlockForIntervalViaPivot } = require('../data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks } = require('../utils/volatility');
const { watchedPairs } = require('../global.config');
dotenv.config();

const RUN_EVERY_MINUTES = 360;
const RPC_URL = process.env.RPC_URL;

const WORKER_NAME = 'Median Prices Precomputer';

async function PrecomputeMedianPrices() {
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'running',
                'lastStart': Math.round(start/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            if(!RPC_URL) {
                throw new Error('Could not find RPC_URL env variable');
            }

            const medianDirectory = path.join(DATA_DIR, 'precomputed', 'median');
            if(!fs.existsSync(medianDirectory)) {
                fs.mkdirSync(medianDirectory, {recursive: true});
            }

            console.log(`${fnName()}: starting`);
            const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
            const currentBlock = await web3Provider.getBlockNumber() - 10;

            for(const platform of PLATFORMS) {
                const platformDirectory = path.join(medianDirectory, platform);
                if(!fs.existsSync(platformDirectory)) {
                    fs.mkdirSync(platformDirectory, {recursive: true});
                }

                for(const [pairString, pairConfig] of Object.entries(watchedPairs)) {
                    const base = pairString.split('-')[0];
                    const quote = pairString.split('-')[1];
                    precomputeAndSaveMedianPrices(platformDirectory, platform, base, quote, currentBlock, pairConfig.pivot);
                }
            }

            const runEndDate = Math.round(Date.now()/1000);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start/1000),
                'lastBlockFetched': currentBlock
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

        const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - start);
        if(sleepTime > 0) {
            console.log(`${fnName()}: sleeping ${roundTo(sleepTime/1000/60)} minutes`);
            await sleep(sleepTime);
        }
    }
}

function precomputeAndSaveMedianPrices(platformDirectory, platform, base, quote, currentBlock, pivot) {
    console.log(`${fnName()}: starting for ${base}/${quote} via pivot: ${pivot}`);
    const filename = path.join(platformDirectory, `${base}-${quote}-median-prices.csv`);
    const filenameReversed = path.join(platformDirectory, `${quote}-${base}-median-prices.csv`);
    const prices = getPricesAtBlockForIntervalViaPivot(platform, base, quote, 0, currentBlock, pivot);
    if(!prices) {
        console.log(`Cannot find prices for ${base}->${quote}(pivot: ${pivot}) for platform: ${platform}`);
        return;
    }

    const medianed = medianPricesOverBlocks(prices);
    const toWrite = [];
    const toWriteReversed = [];
    toWrite.push('blocknumber,price\n');
    toWriteReversed.push('blocknumber,price\n');
    for(const medianedData of medianed) {
        toWrite.push(`${medianedData.block},${medianedData.price}\n`);
        toWriteReversed.push(`${medianedData.block},${1/medianedData.price}\n`);
}

    fs.writeFileSync(filename, toWrite.join(''));
    fs.writeFileSync(filenameReversed, toWriteReversed.join(''));
}

PrecomputeMedianPrices();
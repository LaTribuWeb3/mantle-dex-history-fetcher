const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep, readLastLine } = require('../utils/utils');
const { ethers } = require('ethers');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { DATA_DIR, PLATFORMS, MEDIAN_OVER_BLOCK } = require('../utils/constants');
const { getPricesAtBlockForIntervalViaPivots } = require('../data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks } = require('../utils/volatility');
const { watchedPairs } = require('../global.config');
dotenv.config();

const runEverySec = 60 * 60;
const RPC_URL = process.env.RPC_URL;

const WORKER_NAME = 'Median Prices Precomputer';

async function PrecomputeMedianPrices(onlyOnce = false) {
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

            if(!RPC_URL) {
                throw new Error('Could not find RPC_URL env variable');
            }

            const medianDirectory = path.join(DATA_DIR, 'precomputed', 'median');
            if(!fs.existsSync(medianDirectory)) {
                fs.mkdirSync(medianDirectory, {recursive: true});
            }

            // this allows to run the computer for only specified platform, like this:
            //      "node .\src\precomputer\median.precomputer.js sushiswapv2"
            //      "node .\src\precomputer\median.precomputer.js sushiswapv2,uniswapv2"
            let platformsToCompute = structuredClone(PLATFORMS);
            if(process.argv[2]) {
                platformsToCompute = process.argv[2].split(',');
            } 
            else {
                platformsToCompute.push('all');
            }

            console.log(`${fnName()}: starting`);
            const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
            const currentBlock = await web3Provider.getBlockNumber() - 10;

            for(const platform of platformsToCompute) {
                const platformDirectory = path.join(medianDirectory, platform);
                if(!fs.existsSync(platformDirectory)) {
                    fs.mkdirSync(platformDirectory, {recursive: true});
                }

                for(const [base, quotes] of Object.entries(watchedPairs)) {
                    for(const quoteConfig of quotes) {
                        const quote = quoteConfig.quote;

                        let pivots = quoteConfig.pivots;
                        if(quoteConfig.pivotsSpecific && quoteConfig.pivotsSpecific[platform]) {
                            // overwrite with platform specific pivot
                            pivots = quoteConfig.pivotsSpecific[platform];
                        }

                        await precomputeAndSaveMedianPrices(platformDirectory, platform, base, quote, currentBlock, pivots);
                    }
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

async function precomputeAndSaveMedianPrices(platformDirectory, platform, base, quote, currentBlock, pivots) {
    console.log(`${fnName()}[${platform}]: starting for ${base}/${quote} via pivot: ${pivots}`);
    const filename = path.join(platformDirectory, `${base}-${quote}-median-prices.csv`);
    const filenameReversed = path.join(platformDirectory, `${quote}-${base}-median-prices.csv`);


    // get the last block already medianed
    let lastBlock = 0;
    let fileAlreadyExists = fs.existsSync(filename);
    if(fileAlreadyExists) {
        const lastline = await readLastLine(filename);
        lastBlock = Number(lastline.split(',')[0]);
        if(isNaN(lastBlock)) {
            lastBlock = 0;
        }
    }

    const medianed = platform == 'all' ? 
        getMedianPricesAllPlatforms(base, quote, lastBlock, currentBlock, pivots, fileAlreadyExists) : 
        getMedianPricesForPlatform(platform, base, quote, lastBlock, currentBlock, pivots, fileAlreadyExists);

    if(medianed.length == 0) {
        console.log(`${fnName()}[${platform}]: no new data to save for ${base}/${quote} via pivot: ${pivots}`);
        return;
    }

    const toWrite = [];
    const toWriteReversed = [];

    if(!fs.existsSync(filename)) {
        fs.writeFileSync(filename, 'blocknumber,price\n');
        fs.writeFileSync(filenameReversed, 'blocknumber,price\n');
    }

    for(const medianedData of medianed) {
        toWrite.push(`${medianedData.block},${medianedData.price}\n`);
        toWriteReversed.push(`${medianedData.block},${1/medianedData.price}\n`);
    }

    fs.appendFileSync(filename, toWrite.join(''));
    fs.appendFileSync(filenameReversed, toWriteReversed.join(''));
}

function getMedianPricesAllPlatforms(base, quote, lastBlock, currentBlock, pivots, fileAlreadyExists) {
    let allPrices = [];
    for (const subPlatform of PLATFORMS) {
        if(subPlatform == 'uniswapv3' && ((base == 'stETH' && quote == 'WETH') || (base == 'WETH' && quote == 'stETH'))) {
            // stETH/WETH pair for univ3 is fake data
            // so ignore it
            continue;
        }
        const prices = getPricesAtBlockForIntervalViaPivots(subPlatform, base, quote, lastBlock + 1, currentBlock, pivots);
        if (!prices || prices.length == 0) {
            console.log(`Cannot find prices for ${base}->${quote}(pivot: ${pivots}) for platform: ${subPlatform}`);
            continue;
        }

        console.log(`Adding ${prices.length} from ${subPlatform}`);
        allPrices = allPrices.concat(prices);
    }

    // here we have all the prices data from all platforms, sorting them before calling the median
    console.log(`sorting ${allPrices.length} prices`);
    allPrices.sort((a, b) => a.block - b.block);
    console.log(`${allPrices.length} prices sorted by blocks, starting median process`);
    const medianed = medianPricesOverBlocks(allPrices, fileAlreadyExists ? lastBlock + MEDIAN_OVER_BLOCK : undefined);
    return medianed;
}

function getMedianPricesForPlatform(platform, base, quote, lastBlock, currentBlock, pivots, fileAlreadyExists) {
    // specific case for curve with USDC as the quote or base
    // add USDT as a step
    if(pivots && platform == 'curve' && pivots[0] == 'WETH' && quote == 'USDC') {
        pivots = ['WETH', 'USDT'];
    }
    if(pivots && platform == 'curve' && pivots[0] == 'WETH' && base == 'USDC') {
        pivots = ['USDT', 'WETH'];
    }
        
    const prices = getPricesAtBlockForIntervalViaPivots(platform, base, quote, lastBlock + 1, currentBlock, pivots);
    if(!prices) {
        console.log(`Cannot find prices for ${base}->${quote}(pivot: ${pivots}) for platform: ${platform}`);
        return [];
    }

    if(prices.length == 0) {
        console.log(`${fnName()}[${platform}]: no new data to save for ${base}/${quote} via pivot: ${pivots}`);
        return [];
    }

    const medianed = medianPricesOverBlocks(prices, fileAlreadyExists ? lastBlock + MEDIAN_OVER_BLOCK : undefined);
    return medianed;
}

// PrecomputeMedianPrices(true);
module.exports = { PrecomputeMedianPrices };
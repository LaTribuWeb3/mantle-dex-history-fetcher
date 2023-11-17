const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');
const { dashboardPairsToCompute } = require('./precomputer.config');
const { ethers, Contract } = require('ethers');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { DATA_DIR, PLATFORMS } = require('../utils/constants');
const { getPricesAtBlockForIntervalViaPivot } = require('../data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, rollingBiggestDailyChange } = require('../utils/volatility');
dotenv.config();

const RUN_EVERY_MINUTES = 360;
const RPC_URL = process.env.RPC_URL;

const WORKER_NAME = 'Volatility Precomputer';

async function PrecomputeVolatility() {

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

            if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'volatility'))) {
                fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'volatility'), {recursive: true});
            }

            console.log(`${fnName()}: starting`);
            const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
            const currentBlock = await web3Provider.getBlockNumber() - 10;

            for(const platform of PLATFORMS) {
                if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'volatility', platform))) {
                    fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'volatility', platform), {recursive: true});
                }

                for(const pairToCompute of dashboardPairsToCompute) {
                    const filename = path.join(DATA_DIR, 'precomputed', 'volatility', platform, `${pairToCompute.base}-${pairToCompute.quote}-volatility.json`);
                    // let computedVolatility = undefined;
                    // if(fs.existsSync(filename)) {
                    //     computedVolatility = JSON.parse(fs.readFileSync(filename));
                    // }
                    const prices = getPricesAtBlockForIntervalViaPivot(platform, pairToCompute.base, pairToCompute.quote, 0, currentBlock, pairToCompute.volatilityPivot);
                    if(!prices) {
                        console.log(`Cannot find prices for ${pairToCompute.base}->${pairToCompute.quote}(pivot: ${pairToCompute.volatilityPivot}) for platform: ${platform}`);
                        continue;
                    }
                    const medianed = medianPricesOverBlocks(prices);
                    const rollingVolatilityResult = await rollingBiggestDailyChange(medianed, currentBlock, web3Provider);

                    fs.writeFileSync(filename, JSON.stringify(rollingVolatilityResult, null, 2));
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

PrecomputeVolatility();
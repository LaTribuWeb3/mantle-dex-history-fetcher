const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep, getDataFileNameFromToForPlatform } = require('../utils/utils');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { additionalLiquidityConfig } = require('./precomputer.config');
const { utils } = require('ethers');
const { getAverageLiquidity } = require('../data.interface/data.interface');
dotenv.config();

const runEverySec = 60 * 60;

const WORKER_NAME = 'Additional Liquidity Computer';

async function AdditionalLiquidityComputer(onlyOnce = false) {
    // eslint-disable-next-line no-constant-condition
    console.log("Starting additional liquidity computer")
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
                    datafileToLoad = getDataFileNameFromToForPlatform(onePlatformConfig.from, onePlatformConfig.to, onePlatformConfig.priceSource) 
                    console.log("youpi")
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

AdditionalLiquidityComputer(true);
module.exports = { AdditionalLiquidityComputer };
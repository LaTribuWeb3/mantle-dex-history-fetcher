const { RecordMonitoring } = require('../utils/monitoring');
const { ethers } = require('ethers');
const { fnName, roundTo, sleep, logFnDurationWithLabel, logFnDuration, retry } = require('../utils/utils');
const { DATA_DIR, PLATFORMS } = require('../utils/constants');

const fs = require('fs');
const path = require('path');
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { getLiquidity, getRollingVolatility } = require('../data.interface/data.interface');
const { getDefaultSlippageMap } = require('../data.interface/internal/data.interface.utils');
const { median } = require('simple-statistics');
const { watchedPairs } = require('../global.config');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { getPrices } = require('../data.interface/internal/data.interface.price');
const { default: axios } = require('axios');

const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Risk Data Exporter';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
const NB_DAYS = 180;
const TARGET_DATA_POINTS = NB_DAYS;
const NB_DAYS_AVG = 30;
const BLOCKINFO_URL = process.env.BLOCKINFO_URL;

const BIGGEST_DAILY_CHANGE_OVER_DAYS = 90; // amount of days to compute the biggest daily change
let BLOCK_PER_DAY = 0; // 7127

async function ExportRiskData() {
// eslint-disable-next-line no-constant-condition
    while(true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(runStartDate/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            const currentBlock = await web3Provider.getBlockNumber() - 100;

            // TODO
            // GET CONFIG
            // FOR EACH PAIR 
                // COMPUTE LIQUIDITY AND VOLATILITY
                // STORE FILE TO GITHUB

            const runEndDate = Math.round(Date.now() / 1000);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(runStartDate / 1000)
            });
    
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

ExportRiskData();


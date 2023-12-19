const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');
require('dotenv').config();

const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { signTypedData } = require('../../scripts/signTypedData');
const { uploadJsonFile } = require('../utils/githubPusher');
const { riskDataConfig, getStagingConfTokenBySymbol, riskDataTestNetConfig } = require('../utils/dataSigner.config');


const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Risk Data Exporter';
const IS_STAGING = process.env.STAGING_ENV && process.env.STAGING_ENV.toLowerCase() == 'true';


async function ExportRiskData() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(runStartDate / 1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            for (const pair of riskDataConfig) {
                const results = await signTypedData(pair.base, pair.quote, IS_STAGING);
                const toUpload = JSON.stringify(results);
                IS_STAGING ? uploadJsonFile(toUpload, `${riskDataTestNetConfig[pair.base].substitute}_${riskDataTestNetConfig[pair.quote].substitute}`) : uploadJsonFile(toUpload, `${pair.base}_${pair.quote}`);
            }


            const runEndDate = Math.round(Date.now() / 1000);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(runStartDate / 1000)
            });

            const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - runStartDate);
            if (sleepTime > 0) {
                console.log(`${fnName()}: sleeping ${roundTo(sleepTime / 1000 / 60)} minutes`);
                await sleep(sleepTime);
            }
        } catch (error) {
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


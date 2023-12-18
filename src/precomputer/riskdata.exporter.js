const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');

const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { signTypedData } = require('../../scripts/signTypedData');
const { uploadJsonFile } = require('../utils/githubPusher');


const RUN_EVERY_MINUTES = 6 * 60; // in minutes
const MONITORING_NAME = 'Risk Data Exporter';


async function ExportRiskData() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(runStartDate / 1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });


            // TODO
            // GET CONFIG
            // FOR EACH PAIR 
            // COMPUTE LIQUIDITY AND VOLATILITY
            // STORE FILE TO GITHUB
            const results = signTypedData();

            uploadJsonFile(results, 'tryNumber1');

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


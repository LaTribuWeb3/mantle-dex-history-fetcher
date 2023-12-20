const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');
require('dotenv').config();

const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { signTypedData } = require('../../scripts/signTypedData');
const { uploadJsonFile } = require('../utils/githubPusher');
const { riskDataConfig, riskDataTestNetConfig } = require('../utils/dataSigner.config');

const RUN_EVERY_MINUTES = 6 * 60; // 6 hours in minutes
const MONITORING_NAME = 'Risk Data Exporter';
const IS_STAGING = process.env.STAGING_ENV && process.env.STAGING_ENV.toLowerCase() == 'true';

async function exportRiskData() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Wait for fetchers to complete
        // await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();

        try {
            // Record the monitoring start
            await recordMonitoring(runStartDate, true);

            // Process and upload data for each configuration pair
            for (const pair of riskDataConfig) {
                await processAndUploadPair(pair);
            }

            // Record the monitoring end
            await recordMonitoring(runStartDate, false);

            // Sleep for the remaining time of the cycle
            await sleepForRemainingCycleTime(runStartDate);
        } catch (error) {
            // Handle any errors that occur during the process
            await handleError(error);
        }
    }
}

// Function to record monitoring
async function recordMonitoring(runStartDate, isStart) {
    const timestamp = Math.round(Date.now() / 1000);

    const monitoringData = {
        name: MONITORING_NAME,
        lastStart: isStart ? timestamp : undefined,
        runEvery: isStart ? RUN_EVERY_MINUTES * 60 : undefined
    };

    if (isStart) {
        monitoringData.status = 'running';
    } else {
        monitoringData.status = 'success';
        monitoringData.lastEnd = timestamp;
        monitoringData.lastDuration = timestamp - Math.round(runStartDate / 1000);
    }

    await RecordMonitoring(monitoringData);
}

// Function to process and upload data for each configuration pair
async function processAndUploadPair(pair) {
    const results = await signTypedData(pair.base, pair.quote, IS_STAGING);
    const toUpload = JSON.stringify(results);
    const fileName = IS_STAGING 
        ? `${riskDataTestNetConfig[pair.base].substitute}_${riskDataTestNetConfig[pair.quote].substitute}`
        : `${pair.base}_${pair.quote}`;
    await uploadJsonFile(toUpload, fileName);
}

// Function to sleep for the remaining time of the cycle
async function sleepForRemainingCycleTime(runStartDate) {
    const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - runStartDate);
    if (sleepTime > 0) {
        console.log(`${fnName()}: sleeping for ${roundTo(sleepTime / 1000 / 60)} minutes`);
        await sleep(sleepTime);
    }
}

// Function to handle errors
async function handleError(error) {
    console.error(error);
    const errorMsg = `An exception occurred: ${error}`;
    await RecordMonitoring({
        name: MONITORING_NAME,
        status: 'error',
        error: errorMsg
    });
    console.log('sleeping for 10 minutes');
    await sleep(10 * 60 * 1000);
}

// Start the export process
exportRiskData();

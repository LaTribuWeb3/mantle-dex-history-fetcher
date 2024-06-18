const { fnName, roundTo, sleep } = require('../utils/utils');

const dotenv = require('dotenv');
dotenv.config();
const { UpdateSyncFile, SYNC_FILENAMES, WaitUntilDone } = require('../utils/sync');
const { CheckLiquidityPathComputer } = require('../precomputer/liquidity.pivots.optimizer.js');

const RUN_EVERY_MINUTES = 60;

const fetchersToStart = [
    CheckLiquidityPathComputer
];

async function LaunchFetchers() {
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            // no wait for the lock at the start, we don't need it
            for(const fct of fetchersToStart) {
                console.log(`Starting ${fct.name}`);
                await fct(true); 
                console.log(`${fct.name} ended`);
                console.log('------------------------------------------------------------');
            }
            UpdateSyncFile(SYNC_FILENAMES.FETCHERS_LAUNCHER, false);
        } catch(error) {
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
        }

        console.log(`LauncherFetchers took ${(Date.now() - start)/1000} seconds to run`);
        const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - start);
        if(sleepTime > 0) {
            console.log(`${fnName()}: sleeping ${roundTo(sleepTime/1000/60)} minutes`);
            await sleep(sleepTime);
        }
    }
}

LaunchFetchers();

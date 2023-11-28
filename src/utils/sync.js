const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./constants');
const { sleep } = require('./utils');


const SYNC_FILENAMES = {
    'FETCHERS_LAUNCHER': 'fetchers-launcher'
};

// Methods used to sync processes using filenames
function UpdateSyncFile(syncFilename, isWorking) {
    const fullFilename = path.join(DATA_DIR, syncFilename);
    console.log(`SYNC: setting ${syncFilename} working to ${isWorking}`);
    fs.writeFileSync(fullFilename, JSON.stringify({status: isWorking ? 'working' : 'done'}));
}

function CheckSyncFileStatus(syncFilename) {
    const fullFilename = path.join(DATA_DIR, syncFilename);
    const syncData = JSON.parse(fs.readFileSync(fullFilename));
    console.log(`SYNC: CheckSyncFile ${syncFilename} = ${syncData.status}`);
    return syncData.status;
}

async function WaitUntilDone(syncFilename) {
    let status = CheckSyncFileStatus(syncFilename);

    while(status != 'done') {
        console.log(`Waiting for ${syncFilename} to be done`);
        await sleep(5000);
        status = CheckSyncFileStatus(syncFilename);
    }
}

module.exports = { SYNC_FILENAMES, UpdateSyncFile, WaitUntilDone };
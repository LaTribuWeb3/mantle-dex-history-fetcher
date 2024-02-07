const { fnName, roundTo, sleep } = require('../utils/utils');

const dotenv = require('dotenv');
dotenv.config();
const { UniswapV3HistoryFetcher } = require('../uniswap.v3/uniswap.v3.history.fetcher');
const { CurvePriceHistoryFetcher } = require('../curve/curve.price.history.fetcher');
const { UniswapV3PriceHistoryFetcher } = require('../uniswap.v3/uniswap.v3.price.history.fetcher');
const { PrecomputeMedianPrices } = require('../precomputer/median.precomputer');
const { UpdateSyncFile, SYNC_FILENAMES, WaitUntilDone } = require('../utils/sync');
const { AdditionalLiquidityComputer } = require('../precomputer/additional.liquidity.postcomputer');

const RUN_EVERY_MINUTES = 60;

const fetchersToStart = [
    // UniswapV2HistoryFetcher,
    // SushiswapV2HistoryFetcher,
    // CurveHistoryFetcher,
    CurvePriceHistoryFetcher,
    UniswapV3HistoryFetcher,
    UniswapV3PriceHistoryFetcher,
    PrecomputeMedianPrices,
    AdditionalLiquidityComputer,
];

async function LaunchFetchers() {
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
            UpdateSyncFile(SYNC_FILENAMES.FETCHERS_LAUNCHER, true);
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

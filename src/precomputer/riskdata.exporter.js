// Node.js modules
require('dotenv').config();

// Ethereum and Web3 utilities
const { ethers } = require('ethers');

// Local utility imports
const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');
const { uploadJsonFile } = require('../utils/githubPusher');
const { MORPHO_RISK_PARAMETERS_ARRAY } = require('../utils/constants');
const { signData, generateTypedData } = require('../../scripts/signTypedData');
const { getRollingVolatility, getLiquidityAverageV2 } = require('../data.interface/data.interface');
const { getConfTokenBySymbol } = require('../utils/token.utils');
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { getStagingConfTokenBySymbol, riskDataTestNetConfig, riskDataConfig } = require('./precomputer.config');
const { default: axios } = require('axios');

// Constants
const RUN_EVERY_MINUTES = 6 * 60; // 6 hours in minutes
const MONITORING_NAME = 'Risk Data Exporter';
const IS_STAGING = process.env.STAGING_ENV && process.env.STAGING_ENV.toLowerCase() === 'true';
const RPC_URL = process.env.RPC_URL;
const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);

async function exportRiskData() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Wait for fetchers to complete
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
        const runStartDate = Date.now();

        try {
            // Record the monitoring start
            await recordMonitoring(runStartDate, true);

            // Process and upload data for each configuration pair
            for (const pair of riskDataConfig) {
                await processAndUploadPair(pair);
            }

            await uploadRiskIndexLevelToGithub();

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
    // Retrieve token configuration based on environment (staging/production)
    const base = IS_STAGING ? getStagingConfTokenBySymbol(pair.base) : getConfTokenBySymbol(pair.base);
    const quote = IS_STAGING ? getStagingConfTokenBySymbol(pair.quote) : getConfTokenBySymbol(pair.quote);

    // fetch liquidity across all dexes
    const averagedLiquidity = await fetchLiquidity(base, quote);
    // fetch volatility accros all dexes
    const volatilityData = await getRollingVolatility('all', base.symbol, quote.symbol, web3Provider);

    const results = await generateAndSignRiskData(averagedLiquidity, volatilityData.latest.current, base, quote, IS_STAGING);
    const toUpload = JSON.stringify(results);
    const fileName = IS_STAGING
        ? `${riskDataTestNetConfig[pair.base].substitute}_${riskDataTestNetConfig[pair.quote].substitute}`
        : `${pair.base}_${pair.quote}`;
    await uploadJsonFile(toUpload, fileName, 'LaTribuWeb3', 'risk-data-repo');
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



/**
 * Calculates the average base slippage for each slippage point across multiple platforms.
 * 
 * @param {{{[blocknumber: number]: {price: number, slippageMap: {[slippageBps: number]: {base: number, quote: number}}}}}} allPlatformsLiquidity - Object with liquidity data from various platforms.
 *                                         Each key represents a block, and its value is an object
 *                                         containing a 'slippageMap' with slippage points and their
 *                                         respective base slippage data.
 * @returns {{[slippageKey: number]: number}} Averages of base slippage for each slippage point. Keys are slippage points
 *                   (parsed as integers), and values are the average base slippage for those points.
 */
function calculateSlippageBaseAverages(allPlatformsLiquidity) {
    const totals = {};

    for (const blockData of Object.values(allPlatformsLiquidity)) {
        for (const [slippageKey, slippageData] of Object.entries(blockData.slippageMap)) {
            const key = parseInt(slippageKey, 10);

            // Initialize key if not present
            if (!totals[key]) {
                totals[key] = { sum: 0, count: 0 };
            }

            // Sum and count for each slippage data point
            totals[key].sum += slippageData.base;
            totals[key].count++;
        }
    }

    // Compute and return averages
    return Object.keys(totals).reduce((averages, key) => {
        averages[key] = totals[key].count > 0 ? totals[key].sum / totals[key].count : 0;
        return averages;
    }, {});
}

/**
 * 
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} base 
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} quote 
 * @returns 
 */
async function fetchLiquidity(base, quote) {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const startBlock = await getBlocknumberForTimestamp(Math.round(thirtyDaysAgo / 1000));
    const currentBlock = (await web3Provider.getBlockNumber()) - 100;

    console.log(`Precomputing for pair ${base.symbol}/${quote.symbol}`);

    const avgLiquidity = await getLiquidityAverageV2('all', base.symbol, quote.symbol, startBlock, currentBlock);
    
    return avgLiquidity.slippageMap;
}

/**
 * Generates and signs risk data based on liquidity and volatility.
 * @param {{[slippageKey: number]: number}} averagedLiquidity Averaged liquidity data.
 * @param {number} volatilityValue Volatility value 3% = 0.03
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} baseTokenConf Configuration for the base token.
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} quoteTokenConf Configuration for the quote token.
 * @param {boolean} isStaging Flag for staging environment.
 * @returns An array of objects containing signed risk data.
 */
async function generateAndSignRiskData(averagedLiquidity, volatilityValue, baseTokenConf, quoteTokenConf, isStaging) {
    const signedRiskDatas = [];

    for (const parameter of MORPHO_RISK_PARAMETERS_ARRAY) {
        const liquidity = averagedLiquidity[parameter.bonus];
        const volatility = volatilityValue;

        // Generate typed data structure for signing
        const typedData = generateTypedData(baseTokenConf, quoteTokenConf, liquidity, volatility, isStaging);
        const signature = await signData(typedData);

        const splitSign = ethers.utils.splitSignature(signature);
        // Append signature and related data to the final array
        signedRiskDatas.push({
            r: splitSign.r,
            s: splitSign.s,
            v: splitSign.v,
            liquidationBonus: parameter.bonus,
            riskData: typedData.value,
        });
    }

    return signedRiskDatas;
}

async function uploadRiskIndexLevelToGithub() {
    const IS_STAGING = process.env.RISK_STAGING_ENV && process.env.RISK_STAGING_ENV.toLowerCase() === 'true';
    const repoPath = IS_STAGING ? 'goerli' : 'mainnet';

    const protocolsCall = await axios.get(`${process.env.RISK_API}/getaveragerisklevels`);
    await uploadJsonFile(JSON.stringify(protocolsCall.data), 'protocols_day_averages', 'Risk-DAO', 'simulation-results', 'risk-level-data');

    for (const k of Object.keys(protocolsCall.data)) {
        const dataCall = await axios.get(`${process.env.RISK_API}/getcurrentaverageclfs?latest=true&platform=${k}`);

        if (k === 'morpho') {
            const objectToWrite = {};
            objectToWrite['protocolAverageHistory'] = dataCall.data['protocolAverageHistory'];
            for (const [vault, market] of Object.entries(dataCall.data)) {
                if (vault === 'protocolAverageHistory') {
                    continue;
                }
                const extractedMarket = Object.keys(market)[0];
                const marketToWrite = extractedMarket.split('_')[1];
                objectToWrite[marketToWrite] = market[extractedMarket];
            }
            await uploadJsonFile(JSON.stringify(objectToWrite), k, 'Risk-DAO', 'simulation-results', 'risk-level-data', repoPath);
        }
        else {
            await uploadJsonFile(JSON.stringify(dataCall.data), k, 'Risk-DAO', 'simulation-results', 'risk-level-data', repoPath);
        }
    }
}

// Start the export process
exportRiskData();

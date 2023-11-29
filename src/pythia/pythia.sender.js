const { ethers, Contract } = require('ethers');
const BigNumber = require('bignumber.js');
const pythiaConfig = require('./pythia.config');
const dotenv = require('dotenv');
const { fnName, roundTo, sleep, retry } = require('../utils/utils');
const { getConfTokenBySymbol } = require('../utils/token.utils');
dotenv.config();
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { RecordMonitoring } = require('../utils/monitoring');
const { getAverageLiquidity, getVolatility, getRollingVolatility } = require('../data.interface/data.interface');
const { BN_1e18, TARGET_SLIPPAGES, smartLTVSourceMap } = require('../utils/constants');
const { WaitUntilDone, SYNC_FILENAMES } = require('../utils/sync');

const SPANS = [7, 30, 180, 365]; // we dont use constants.js span because we don't generate 1d data
const MONITORING_NAME = 'Pythia Sender';
const RUN_EVERY_MINUTES = process.env.RUN_EVERY || 24 * 60; // in minutes
const PLATFORMS_TO_USE = ['uniswapv2', 'uniswapv3', 'curve'];

async function SendToPythia() {
    if(!process.env.ETH_PRIVATE_KEY) {
        console.log('Could not find ETH_PRIVATE_KEY env variable');
    }

    if(!process.env.RPC_URL) {
        throw new Error('Could not find RPC_URL env variable');
    }
    
    // also using PYTHIA_RPC_URL because for now the contract is on sepolia
    if(!process.env.PYTHIA_RPC_URL) {
        throw new Error('Could not find PYTHIA_RPC_URL env variable');
    }
    
    // eslint-disable-next-line no-constant-condition
    while(true) {
        await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);

        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(start/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
            const endBlock = await retry((() => web3Provider.getBlockNumber()), []) - 10;
            const pythiaProvider = new ethers.providers.StaticJsonRpcProvider(process.env.PYTHIA_RPC_URL);
            const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY, pythiaProvider);
            const pythiaContract = new Contract(pythiaConfig.pythiaAddress, pythiaConfig.pythiaAbi, signer);
            for(const span of SPANS) {
                
                const dataToSend = [];
                // find block for 'daysToAvg' days ago
                const startBlock = await getBlocknumberForTimestamp(Math.round(Date.now() / 1000) - (span * 24 * 60 * 60));
                console.log(`${fnName()}: Will send to pythia since block ${startBlock}`);

                
                for(const base of pythiaConfig.tokensToPush) {
                    await WaitUntilDone(SYNC_FILENAMES.FETCHERS_LAUNCHER);
                    const volatilityData = await generateVolatilityData(base, span, startBlock, endBlock, web3Provider);
                    console.log(volatilityData);
                    dataToSend.push(volatilityData);
                    
                    const liquidityDataForPlatform = generateLiquidityData(span, base, startBlock, endBlock);
                    dataToSend.push(...liquidityDataForPlatform);
                }

                console.log(`will send ${dataToSend.length} data to pythia for span ${span}d`);
                const gas = dataToSend.length * 30000;
                const allAssets = [];
                const allKeys = [];
                const allValues = [];
                const allUpdateTimes = [];
                for(const toSend of dataToSend) {
                    allAssets.push(toSend.asset);
                    allKeys.push(toSend.key);
                    allValues.push(toSend.value);
                    allUpdateTimes.push(toSend.updateTimeSeconds);
                }

                const txResponse = await retry(pythiaContract.multiSet, [allAssets, allKeys, allValues, allUpdateTimes, { gasLimit: gas }]);

                let txFinished = false;
                while (!txFinished) {
                    const txReceipt = await pythiaProvider.getTransactionReceipt(txResponse.hash);
                    if (txReceipt && txReceipt.blockNumber) {
                        console.log(`transaction has been mined in block ${txReceipt.blockNumber}`);
                        txFinished = true;
                    } else {
                        console.log(`waiting for transaction ${txResponse.hash} to be mined`);
                        await sleep(5000);
                    }
                }
            }

            const runEndDate = Math.round(Date.now() / 1000);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start / 1000)
            });
        } catch(error) {
            console.error(error);
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': MONITORING_NAME,
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

/**
 * Generate volatility data with 18 decimals for an asset
 * Averaging volatility across all platforms
 * @param {string} baseSymbol 
 * @param {number} span 
 * @param {number} startBlock 
 * @param {number} endBlock 
 * @returns {Promise<{asset: string, key: string, value: string, updateTimeSeconds: number}>}
 */
async function generateVolatilityData(baseSymbol, span, startBlock, endBlock, web3Provider) {
    const tokenConf = getConfTokenBySymbol(baseSymbol);
    const usdcConf = getConfTokenBySymbol('USDC');

    let volatility = 0;
    let volatilityCpt = 0;
    for(const platform of PLATFORMS_TO_USE) {
        const rollingVolatility = await getRollingVolatility(platform, baseSymbol, 'USDC', web3Provider);

        let vol = 0;
        if(rollingVolatility) {
            vol = rollingVolatility.latest.current;
        }
        
        if(vol != 0) {
            volatilityCpt++;
            volatility += vol;
        }
    }

    volatility = volatilityCpt == 0 ? 0 : volatility  / volatilityCpt;
    
    const volatility18Decimals = new BigNumber(volatility).times(BN_1e18).toFixed(0);
    const key = encodeVolatilityKey(tokenConf.address, usdcConf.address, 0, span);

    return {
        asset: tokenConf.address,
        key: key,
        value: volatility18Decimals,
        updateTimeSeconds: Math.round(Date.now()/1000)
    };
}

/**
 * This function will generate, for baseSymbol/USDC, the average liquidity available for each platforms (dexes) 
 * and then the sum across all dexes. So for a single token (baseSymbol), we will generate: ([platform count] + 1) * [slippage count]
 * Example for [univ2, univ3, curve] and slippages [1, 5, 10, 15, 20] we will generate 4 * 5 values = 20 values to be sent to pythia
 * @param {number} span 
 * @param {string} baseSymbol 
 * @param {number} startBlock 
 * @param {number} endBlock 
 * @returns 
 */
function generateLiquidityData(span, baseSymbol, startBlock, endBlock) {

    const tokenConf = getConfTokenBySymbol(baseSymbol);
    const usdcConf = getConfTokenBySymbol('USDC');
    const avgValuesForPlatform = {};
    const results = [];
    for(const platform of PLATFORMS_TO_USE) {
        const liquidityAverage = getAverageLiquidity(platform, baseSymbol, 'USDC', startBlock, endBlock);

        // if some data found, generate per-platform data in the valid format
        if(liquidityAverage.avgPrice != 0) {
            avgValuesForPlatform[platform] = liquidityAverage.avgSlippageMap;
            for(const slippagePct of TARGET_SLIPPAGES) {
                const slippageBps = slippagePct * 100;
                const sourceId = smartLTVSourceMap[platform];
                const key = encodeLiquidityKey(tokenConf.address, usdcConf.address, sourceId, slippagePct, span);
                const avgVolumeForSlippage = liquidityAverage.avgSlippageMap[slippageBps].base;
                const avgVolumeForSlippageValidDecimals = new BigNumber(avgVolumeForSlippage).times(BigNumber(10).pow(tokenConf.decimals)).toFixed(0);
                results.push({
                    asset: tokenConf.address,
                    key: key,
                    value: avgVolumeForSlippageValidDecimals,
                    updateTimeSeconds: Math.round(Date.now()/1000)
                });
            }
        }
    }

    // generate "all" data by summing all slippages data we have from all the platforms
    const sumSlippageMap = {};
    for(let i = 50; i <= 2000; i+=50) {
        sumSlippageMap[i] = 0;
    }
    for(const slippageMapForPlatform of Object.values(avgValuesForPlatform)) {

        for(const slippageBps of Object.keys(sumSlippageMap)) {
            sumSlippageMap[slippageBps] += slippageMapForPlatform[slippageBps].base;
        }
    }
    

    for(const slippagePct of TARGET_SLIPPAGES) {
        const slippageBps = slippagePct * 100;
        const sourceId = smartLTVSourceMap.all;
        const key = encodeLiquidityKey(tokenConf.address, usdcConf.address, sourceId, slippagePct, span);
        const avgVolumeForSlippage = sumSlippageMap[slippageBps];
        const avgVolumeForSlippageValidDecimals = new BigNumber(avgVolumeForSlippage).times(BigNumber(10).pow(tokenConf.decimals)).toFixed(0);
        results.push({
            asset: tokenConf.address,
            key: key,
            value: avgVolumeForSlippageValidDecimals,
            updateTimeSeconds: Math.round(Date.now()/1000)
        });
    }
    
    return results;
}

function encodeVolatilityKey(collateralAsset, debtAsset, mode, period) {
    return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint8', 'uint256'], ['volatility', debtAsset, mode, period]));
}

function encodeLiquidityKey(collateralAsset, debtAsset, source, slippage, period) {
    return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint8', 'uint256', 'uint256'], ['liquidity', debtAsset, source, slippage, period]));
}

SendToPythia();

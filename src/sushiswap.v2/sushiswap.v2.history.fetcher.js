const { ethers } = require('ethers');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const sushiv2Config = require('./sushiswap.v2.config');
const { GetContractCreationBlockNumber, getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { sleep, fnName, roundTo, readLastLine } = require('../utils/utils');
const { RecordMonitoring } = require('../utils/monitoring');
const { DATA_DIR } = require('../utils/constants');
const path = require('path');
const { getConfTokenBySymbol } = require('../utils/token.utils');
const { generateUnifiedFileSushiswapV2 } = require('./sushiswap.v2.unified.generator');

const RPC_URL = process.env.RPC_URL;
const MINIMUM_TO_APPEND = process.env.MINIMUM_TO_APPEND || 5000;

const MONITORING_NAME = 'SushiswapV2 Fetcher';

const RUN_EVERY_MINUTES = 30;

/**
 * Fetch all liquidity history from UniswapV2 pairs
 * The pairs to fetch are read from the config file './uniswap.v2.config'
 */
async function SushiswapV2HistoryFetcher() {
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'running',
                'lastStart': Math.round(start/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });
            if(!RPC_URL) {
                throw new Error('Could not find RPC_URL env variable');
            }

            if(!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR);
            }
        
            if(!fs.existsSync(path.join(DATA_DIR, 'sushiswapv2'))) {
                fs.mkdirSync(path.join(DATA_DIR, 'sushiswapv2'));
            }

            console.log(`${fnName()}: starting`);
            const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
            const currentBlock = await web3Provider.getBlockNumber() - 10;
            const stalePools = [];
            const poolsData = [];
            for(const pairToFetch of sushiv2Config.pairsToFetch) {
                console.log(`${fnName()}: Start fetching pair `, pairToFetch);
                const poolIsStale = await FetchHistoryForPair(web3Provider, pairToFetch, currentBlock, 0);
                console.log(`${fnName()}: End fetching pair `, pairToFetch);
                if(poolIsStale) {
                    stalePools.push(`${pairToFetch.base}-${pairToFetch.quote}`);
                }

                poolsData.push({
                    tokens: [pairToFetch.base, pairToFetch.quote],
                    address: pairToFetch.pool,
                    label: ''
                });
            }

            if(stalePools.length > 0) {
                console.warn(`Stale pools: ${stalePools.join(',')}`);
            }
            
            const fetcherResult = {
                dataSourceName: 'sushiswapv2',
                lastBlockFetched: currentBlock,
                lastRunTimestampMs: Date.now(),
                poolsFetched: poolsData
            };
            fs.writeFileSync(path.join(DATA_DIR, 'sushiswapv2', 'sushiswapv2-fetcher-result.json'), JSON.stringify(fetcherResult, null, 2));

            await generateUnifiedFileSushiswapV2(currentBlock);
            console.log(`${fnName()}: ending`);
        
            const runEndDate = Math.round(Date.now()/1000);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start/1000),
                'lastBlockFetched': currentBlock
            });
        } catch(error) {
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': MONITORING_NAME,
                'status': 'error',
                'error': errorMsg
            });
        }
        // sleep 10 min - time it took to run the loop
        // if the loop took more than 10 minutes, restart directly
        const sleepTime = RUN_EVERY_MINUTES * 60 * 1000 - (Date.now() - start);
        if(sleepTime > 0) {
            console.log(`${fnName()}: sleeping ${roundTo(sleepTime/1000/60)} minutes`);
            await sleep(sleepTime);
        }
        
    }
}

/**
 * Fetches all history for a uniswap v2 pair (a pool)
 * Store the results into a csv file, and use the file as start for a run
 * if the file does not exists, create it and start at the contract deploy block
 * if the file exists, start at the last block fetched + 1
 * @param {ethers.providers.BaseProvider} web3Provider 
 * @param {{base: string, quote: string, pool: string}} pairConfig
 */
async function FetchHistoryForPair(web3Provider, pairConfig, currentBlock, minStartBlock) {
    const historyFileName = path.join(DATA_DIR, 'sushiswapv2', `${pairConfig.base}-${pairConfig.quote}_sushiswapv2.csv`);

    const pairContract = new ethers.Contract(pairConfig.pool, sushiv2Config.lpTokenABI, web3Provider);
    const initBlockStep = 500000;

    const baseConf = getConfTokenBySymbol(pairConfig.base);
    const quoteConf = getConfTokenBySymbol(pairConfig.quote);

    let startBlock = undefined;
    if (!fs.existsSync(DATA_DIR)){
        fs.mkdirSync(DATA_DIR);
    }
    if(!fs.existsSync(historyFileName)) {
        fs.writeFileSync(historyFileName, `blocknumber,reserve_${baseConf.symbol}_${baseConf.address},reserve_${quoteConf.symbol}_${quoteConf.address}\n`);
    } else {
        const lastLine = await readLastLine(historyFileName);
        startBlock = Number(lastLine.split(',')[0]) + 1;
    }
    
    if(!startBlock) {
        const deployBlockNumber = await GetContractCreationBlockNumber(web3Provider, pairConfig.pool);
        startBlock = deployBlockNumber + 100_000; // leave 100k blocks ~2 weeks after pool creation because many pools starts with weird data
    }

    if(startBlock < minStartBlock) {
        startBlock = minStartBlock;
    }

    console.log(`${fnName()}[${pairConfig.base}/${pairConfig.quote}]: start fetching data for ${currentBlock - startBlock} blocks to reach current block: ${currentBlock}`);

    let liquidityValues = [];

    let blockStep = initBlockStep;
    let fromBlock =  startBlock;
    let toBlock = 0;
    let cptError = 0;
    let lastEventBlock = startBlock;
    while(toBlock < currentBlock) {

        toBlock = fromBlock + blockStep - 1;
        if(toBlock > currentBlock) {
            toBlock = currentBlock;
        }

        let events = undefined;
        try {
            events = await pairContract.queryFilter('Sync', fromBlock, toBlock); 
        } 
        catch(e) {
            // console.log(`query filter error: ${e.toString()}`);
            blockStep = Math.max(10, Math.round(blockStep / 2));
            toBlock = 0;
            cptError++;
            if(cptError >= 100) {
                throw new Error('Too many errors');
            }
            continue;
        }

        console.log(`${fnName()}[${pairConfig.base}/${pairConfig.quote}]: [${fromBlock} - ${toBlock}] found ${events.length} Sync events after ${cptError} errors (fetched ${toBlock-fromBlock+1} blocks)`);
        cptError = 0;
        
        if(events.length > 0) {
            if(events.length == 1) {
                lastEventBlock = events[0].blockNumber;
                liquidityValues.push({
                    blockNumber: events[0].blockNumber,
                    reserve0: events[0].args.reserve0.toString(),
                    reserve1: events[0].args.reserve1.toString()
                });
            }
            else {
                let previousEvent = events[0];
                // for each events, we will only save the last event of a block
                for(let i = 1; i < events.length; i++) {
                    const workingEvent = events[i];
                    lastEventBlock = events[i].blockNumber;
                    
                    // we save the 'previousEvent' when the workingEvent block number is different than the previousEvent
                    if(workingEvent.blockNumber != previousEvent.blockNumber) {
                        liquidityValues.push({
                            blockNumber: previousEvent.blockNumber,
                            reserve0: previousEvent.args.reserve0.toString(),
                            reserve1: previousEvent.args.reserve1.toString()
                        });
                    }
                    
                    if(i == events.length -1) {
                        // always save the last event
                        liquidityValues.push({
                            blockNumber: workingEvent.blockNumber,
                            reserve0: workingEvent.args.reserve0.toString(),
                            reserve1: workingEvent.args.reserve1.toString()
                        });
                    }
        
                    previousEvent = workingEvent;
                }
            }
    
            if(liquidityValues.length >= MINIMUM_TO_APPEND) {
                const textToAppend = liquidityValues.map(_ => `${_.blockNumber},${_.reserve0},${_.reserve1}`);
                fs.appendFileSync(historyFileName, textToAppend.join('\n') + '\n');
                liquidityValues = [];
            }
            // try to find the blockstep to reach 8000 events per call as the RPC limit is 10 000, 
            // this try to change the blockstep by increasing it when the pool is not very used
            // or decreasing it when the pool is very used
            blockStep = Math.min(1000000, Math.round(blockStep * 8000 / events.length));
        }

        fromBlock = toBlock +1;
    }
    
    if(liquidityValues.length > 0) {
        const textToAppend = liquidityValues.map(_ => `${_.blockNumber},${_.reserve0},${_.reserve1}`);
        fs.appendFileSync(historyFileName, textToAppend.join('\n') + '\n');
    }

    // return true if the last event fetched is more than 500k blocks old
    return lastEventBlock < currentBlock - 500_000;
}

SushiswapV2HistoryFetcher();
const { ethers, Contract } = require('ethers');

const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const univ3Config = require('./uniswap.v3.config');
const { GetContractCreationBlockNumber } = require('../utils/web3.utils');
const { fnName, sleep, roundTo, readLastLine } = require('../utils/utils');
const { getConfTokenBySymbol } = require('../utils/token.utils');
const { getPriceFromSqrt } = require('./uniswap.v3.utils');
const { RecordMonitoring } = require('../utils/monitoring');
const { DATA_DIR } = require('../utils/constants');
const path = require('path');
const { providers } = require('@0xsequence/multicall');

// save liquidity data every 'CONSTANT_BLOCK_INTERVAL' blocks

const RPC_URL = process.env.RPC_URL;

const UNISWAPV3_FEES = [100, 500, 3000, 10000];

const RUN_EVERY_MINUTES = 30;

const WORKER_NAME = 'UniswapV3 Price Fetcher';

UniswapV3PriceHistoryFetcher();

/**
 * Fetch all liquidity history from UniswapV3 pairs
 * The pairs to fetch are read from the config file './uniswap.v3.config'
 */
async function UniswapV3PriceHistoryFetcher() {
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'running',
                'lastStart': Math.round(start/1000),
                'runEvery': RUN_EVERY_MINUTES * 60
            });

            if(!RPC_URL) {
                throw new Error('Could not find RPC_URL env variable');
            }

            if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'price', 'uniswapv3'))) {
                fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'price', 'uniswapv3'), {recursive: true});
            }

            console.log(`${fnName()}: starting`);
            const web3Provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL);
            const multicallProvider = new providers.MulticallProvider(web3Provider);
            const univ3Factory = new Contract(univ3Config.uniswapFactoryV3Address, univ3Config.uniswapFactoryV3Abi, multicallProvider);
            const currentBlock = await web3Provider.getBlockNumber() - 10;

            console.log(`${fnName()}: getting pools to fetch`);
            const poolsToFetch = await getAllPoolsToFetch(univ3Factory);
            console.log(`${fnName()}: found ${poolsToFetch.length} pools to fetch from ${univ3Config.pairsToFetch.length} pairs in config`);

            const poolsToFetchGroupedByPair = {};
            for(const fetchConfig of poolsToFetch) {
                const pairKey = `${fetchConfig.pairToFetch.token0}-${fetchConfig.pairToFetch.token1}`;
                if(!poolsToFetchGroupedByPair[pairKey]) {
                    poolsToFetchGroupedByPair[pairKey] = {
                        pairToFetch: fetchConfig.pairToFetch,
                        pools: []
                    };
                }
                poolsToFetchGroupedByPair[pairKey].pools.push(fetchConfig.poolAddress);
            }

            const stalePairs = [];
            for(const groupedFetchConfig of Object.values(poolsToFetchGroupedByPair)) {
                const lastBlockWithData = await FetchUniswapV3PriceHistoryForPair(groupedFetchConfig.pairToFetch, groupedFetchConfig.pools, web3Provider, currentBlock);
                if(currentBlock - lastBlockWithData > 500_000) {
                    stalePairs.push(`no data since ${currentBlock - lastBlockWithData} blocks for ${groupedFetchConfig.pairToFetch.token0}/${groupedFetchConfig.pairToFetch.token1}`);
                }
            }

            for(const stalePair of stalePairs) {
                console.warn(stalePair);
            }

            const runEndDate = Math.round(Date.now()/1000);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start/1000),
                'lastBlockFetched': currentBlock
            });
        } catch(error) {
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': WORKER_NAME,
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

async function getAllPoolsToFetch(univ3Factory) {
    const poolsToFetch = [];
    // find existing pools via multicall
    const promises = [];
    for (const pairToFetch of univ3Config.pairsToFetch) {
        for (const fee of UNISWAPV3_FEES) {
            const token0 = getConfTokenBySymbol(pairToFetch.token0);
            if (!token0) {
                throw new Error('Cannot find token in global config with symbol: ' + pairToFetch.token0);
            }
            const token1 = getConfTokenBySymbol(pairToFetch.token1);
            if (!token1) {
                throw new Error('Cannot find token in global config with symbol: ' + pairToFetch.token1);
            }

            promises.push(univ3Factory.getPool(token0.address, token1.address, fee));
        }
    }

    await Promise.all(promises);
    let promiseIndex = 0;
    for (const pairToFetch of univ3Config.pairsToFetch) {
        for (const fee of UNISWAPV3_FEES) {
            const poolAddress = await promises[promiseIndex];
            if (poolAddress == ethers.constants.AddressZero) {
                console.log(`${fnName()}[${pairToFetch.token0}-${pairToFetch.token1}-${fee}]: pool does not exist`);
            } else {
                poolsToFetch.push({
                    pairToFetch,
                    fee,
                    poolAddress
                });
            }

            promiseIndex++;
        }
    }
    return poolsToFetch;
}

async function FetchUniswapV3PriceHistoryForPair(pairToFetch, pools, web3Provider, currentBlock) {
    // the idea is to fetch events for every 100k blocks for every pools, 
    // then sort the results by amount of swap in this 100k blocks interval
    // meaning we will store the prices of each pools but every time a trade occured in the same block
    // for a different pool, the pool with the most swaps will prevail

    const token0Conf = getConfTokenBySymbol(pairToFetch.token0);
    const token1Conf = getConfTokenBySymbol(pairToFetch.token1);

    // get the first block to fetch
    const priceHistoryFilename = path.join(DATA_DIR, 'precomputed', 'price', 'uniswapv3', `${pairToFetch.token0}-${pairToFetch.token1}-unified-data.csv`);
    const priceHistoryReversedFilename = path.join(DATA_DIR, 'precomputed', 'price', 'uniswapv3', `${pairToFetch.token1}-${pairToFetch.token0}-unified-data.csv`);

    let sinceBlock = 0;
    if (fs.existsSync(priceHistoryFilename) && fs.existsSync(priceHistoryReversedFilename)) {
        const lastLine = await readLastLine(priceHistoryFilename);
        sinceBlock = Number(lastLine.split(',')[0]) + 1;
        if(isNaN(sinceBlock)) {
            sinceBlock = 0;
        }

        // check same block for both files
        const lastLineReversed = await readLastLine(priceHistoryReversedFilename);
        let sinceBlockReversed = Number(lastLineReversed.split(',')[0]) + 1;
        if(isNaN(sinceBlockReversed)) {
            sinceBlockReversed = 0;
        }

        if(sinceBlockReversed != sinceBlock) {
            // inconsistency, throw
            throw new Error('Both price files not the same block ?');
        }

    } else {
        fs.writeFileSync(priceHistoryFilename, 'blocknumber,price\n');
        fs.writeFileSync(priceHistoryReversedFilename, 'blocknumber,price\n');
    }
    
    if(sinceBlock == 0) {
        // find the oldest pool
        for(const poolAddress of pools) {
            const startBlock = await GetContractCreationBlockNumber(web3Provider, poolAddress);
            sinceBlock = sinceBlock == 0 ? startBlock : Math.min(sinceBlock, startBlock);
        }
    }

    let lastBlockWithData = sinceBlock;

    // initializes the pools contracts
    const contracts = {};
    for(const poolAddress of pools) {
        contracts[poolAddress] = new Contract(poolAddress, univ3Config.uniswapV3PairAbi, web3Provider);
    }

    const step = 100_000;
    let fromBlock =  sinceBlock;
    let toBlock = 0;
    
    while(toBlock < currentBlock) {
        toBlock = fromBlock + step - 1;
        if(toBlock > currentBlock) {
            toBlock = currentBlock;
        }

        const allSwaps = [];
        for(const poolAddress of pools) {
            const contract = contracts[poolAddress];
            const swaps = await fetchEvents(fromBlock, toBlock, contract, token0Conf.decimals, token1Conf.decimals);
            const swapCount = Object.keys(swaps).length;
            console.log(`found ${swapCount} swap event for pool ${poolAddress}`);
            allSwaps.push(swaps);
        }

        // sort by number of swaps
        allSwaps.sort((a,b) => Object.keys(a).length - Object.keys(b).length);

        const results = {};
        for(const swaps of allSwaps) {
            const blockNumbers = Object.keys(swaps);
            console.log(`working on ${blockNumbers.length} swaps`);
            for(const blocknumber of blockNumbers) {
                results[blocknumber] = swaps[blocknumber];
            }
        }

        const toWrite = [];
        const toWriteReversed = [];
        for(const blocknumber of Object.keys(results)) {
            toWrite.push(`${blocknumber},${results[blocknumber]}\n`);
            toWriteReversed.push(`${blocknumber},${1/results[blocknumber]}\n`);
            lastBlockWithData = Number(blocknumber);
        }

        fs.appendFileSync(priceHistoryFilename, toWrite.join(''));
        fs.appendFileSync(priceHistoryReversedFilename, toWriteReversed.join(''));

        
        fromBlock = toBlock +1;
    }

    return lastBlockWithData;
}

async function fetchEvents(startBlock, endBlock, contract, decimals0, decimals1) {
    const initBlockStep = 50000;
    let blockStep = initBlockStep;
    let fromBlock =  startBlock;
    let toBlock = 0;
    let cptError = 0;
    const swapResults = {};
    while(toBlock < endBlock) {
        toBlock = fromBlock + blockStep - 1;
        if(toBlock > endBlock) {
            toBlock = endBlock;
        }

        let events = undefined;
        try {
            events = await contract.queryFilter('Swap', fromBlock, toBlock);
        }
        catch(e) {
            // console.log(`query filter error: ${e.toString()}`);
            blockStep = Math.round(blockStep / 2);
            if(blockStep < 1000) {
                blockStep = 1000;
            }
            toBlock = 0;
            cptError++;
            continue;
        }

        console.log(`${fnName()}[${fromBlock} - ${toBlock}]: found ${events.length} Swap events after ${cptError} errors (fetched ${toBlock-fromBlock+1} blocks)`);
        
        if(events.length != 0) {
            for(const e of events) {
                swapResults[e.blockNumber] = getPriceFromSqrt(e.args.sqrtPriceX96, decimals0, decimals1);
            }

            // try to find the blockstep to reach 9000 events per call as the RPC limit is 10 000, 
            // this try to change the blockstep by increasing it when the pool is not very used
            // or decreasing it when the pool is very used
            blockStep = Math.min(1_000_000, Math.round(blockStep * 8000 / events.length));
            cptError = 0;
        } else {
            // if 0 events, multiply blockstep by 4
            blockStep = blockStep * 4;
        }
        fromBlock = toBlock +1;
    }

    return swapResults;
}
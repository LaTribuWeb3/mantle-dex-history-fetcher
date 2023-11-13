const path = require('path');
const fs = require('fs');
const { fnName, readLastLine } = require('../utils/utils');
const { getAvailableSushiswapV2, getSushiV2DataforBlockInterval, computeLiquiditySushiV2Pool, computeSushiswapV2Price } = require('./sushiswap.v2.utils');
const { getConfTokenBySymbol, normalize } = require('../utils/token.utils');
const { DATA_DIR } = require('../utils/constants');
const { getBlocknumberForTimestamp } = require('../utils/web3.utils');
const { truncateUnifiedFiles } = require('../data.interface/unified.truncator');


async function generateUnifiedFileSushiswapV2(endBlock) {
    const available = getAvailableSushiswapV2(DATA_DIR);

    if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'sushiswapv2'))) {
        fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'sushiswapv2'), {recursive: true});
    }

    if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'price', 'sushiswapv2'))) {
        fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'price', 'sushiswapv2'), {recursive: true});
    }
    
    for(const base of Object.keys(available)) {
        for(const quote of available[base]) {
            await createUnifiedFileForPair(endBlock, base, quote);
        }
    }

    const blockLastYear = await getBlocknumberForTimestamp(Math.round(Date.now()/1000) - 365 * 24 * 60 * 60);
    truncateUnifiedFiles('sushiswapv2', blockLastYear);
}

async function createUnifiedFileForPair(endBlock, fromSymbol, toSymbol) {
    console.log(`${fnName()}: create/append for ${fromSymbol} ${toSymbol}`);
    const unifiedFilename = `${fromSymbol}-${toSymbol}-unified-data.csv`;
    
    const unifiedFullFilename = path.join(DATA_DIR, 'precomputed', 'sushiswapv2', unifiedFilename);
    const unifiedFullFilenamePrice = path.join(DATA_DIR, 'precomputed', 'price', 'sushiswapv2', unifiedFilename);
    let sinceBlock = 0;
    let toWrite = [];
    let toWritePrice = [];
    if(!fs.existsSync(unifiedFullFilename)) {
        fs.writeFileSync(unifiedFullFilename, 'blocknumber,price,slippagemap\n');
    } else {
        const lastLine = await readLastLine(unifiedFullFilename);
        sinceBlock = Number(lastLine.split(',')[0]) + 1;
        if(isNaN(sinceBlock)) {
            sinceBlock = 0;
        }
    }

    if(!fs.existsSync(unifiedFullFilenamePrice)) {
        fs.writeFileSync(unifiedFullFilenamePrice, 'blocknumber,price\n');
    }

    console.log(`${fnName()}: getting data since ${sinceBlock} to ${endBlock}`);
    const sushiv2Data = getSushiV2DataforBlockInterval(DATA_DIR, fromSymbol, toSymbol, sinceBlock, endBlock);
    const fromConf = getConfTokenBySymbol(fromSymbol);
    const toConf = getConfTokenBySymbol(toSymbol);

    let lastSavedBlock = sinceBlock-1;
    for(const [blockNumber, data] of Object.entries(sushiv2Data)) {
        // only save every 50 blocks
        if(lastSavedBlock + 50 > blockNumber) {
            continue;
        }
        const slippageMap = {};
        const normalizedFrom = normalize(data.fromReserve, fromConf.decimals);
        const normalizedTo = normalize(data.toReserve, toConf.decimals);
        const price = computeSushiswapV2Price(normalizedFrom, normalizedTo);
        for(let slippageBps = 50; slippageBps <= 2000; slippageBps += 50) {
            slippageMap[slippageBps] = computeLiquiditySushiV2Pool(normalizedFrom, normalizedTo, slippageBps/10000);
        }

        lastSavedBlock = Number(blockNumber);
        toWrite.push(`${blockNumber},${price},${JSON.stringify(slippageMap)}\n`);
        toWritePrice.push(`${blockNumber},${price}\n`);
    }

    if(toWrite.length == 0) {
        console.log(`${fnName()}: nothing to add to file`);
    } else {
        fs.appendFileSync(unifiedFullFilename, toWrite.join(''));
    }
    
    if(toWritePrice.length == 0) {
        console.log(`${fnName()}: nothing to add to price file`);
    } else {
        fs.appendFileSync(unifiedFullFilenamePrice, toWritePrice.join(''));
    }
}

// generateUnifiedFileSushiswapV2(18000000);

module.exports = { generateUnifiedFileSushiswapV2 };
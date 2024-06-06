const { getLiquidityV2, getLiquidityAverageV2, getRollingVolatility } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { BLOCK_PER_DAY } = require('../src/utils/constants');
const { roundTo } = require('../src/utils/utils');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');
const { ethers } = require('ethers');
const fs = require('fs');

async function checkVolatility() {
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://rpc.mantle.xyz');
    const base = 'WMNT';
    const quote = 'WETH';
    const platform = 'all';

    const volatility = await getRollingVolatility(platform, base, quote, web3Provider);
    console.log(`${platform} ${base} ${quote} latest volatility: `, volatility.latest);
    fs.writeFileSync('volatility.json', JSON.stringify(volatility, null, 2));
    
}

checkVolatility();
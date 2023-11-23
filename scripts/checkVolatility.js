const { getPricesAtBlockForIntervalViaPivot } = require('../src/data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, computeBiggestDailyChange, rollingBiggestDailyChange } = require('../src/utils/volatility');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../src/utils/constants');
const { getRollingVolatility } = require('../src/data.interface/data.interface');

async function checkVolatility() {

    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    const currentBlock = await  web3Provider.getBlockNumber();

    const volatility = await getRollingVolatility('uniswapv3', 'wstETH', 'WETH', web3Provider);
    fs.writeFileSync('volatility.json', JSON.stringify(volatility, null, 2));
}

checkVolatility();
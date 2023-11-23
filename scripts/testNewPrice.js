const { getPricesAtBlockForIntervalViaPivot } = require('../src/data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, computeBiggestDailyChange, rollingBiggestDailyChange } = require('../src/utils/volatility');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../src/utils/constants');

async function testNewPrice() {
    
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    const currentBlock = await  web3Provider.getBlockNumber();
    const platform = 'uniswapv3';
    const base = 'wstETH';
    const quote = 'WETH';
    const pivot = undefined;
    const prices = getPricesAtBlockForIntervalViaPivot(platform, base, quote, 0, currentBlock, pivot);
    const blocknumbers = Object.keys(prices);
    console.log(blocknumbers.length);
    console.log(blocknumbers[0]);

    const medianed = medianPricesOverBlocks(prices);
    const rollingVolatilityResult = await rollingBiggestDailyChange(medianed, web3Provider);
    console.log(rollingVolatilityResult.latest);

    if(!fs.existsSync(path.join(DATA_DIR, 'precomputed', 'volatility', platform))) {
        fs.mkdirSync(path.join(DATA_DIR, 'precomputed', 'volatility', platform), {recursive: true});
    }

    fs.writeFileSync(path.join(DATA_DIR, 'precomputed', 'volatility', platform, `${base}-${quote}-volatility.json`), JSON.stringify(rollingVolatilityResult, null, 2));
}

testNewPrice();
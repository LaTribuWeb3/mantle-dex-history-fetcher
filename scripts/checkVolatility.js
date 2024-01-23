const { getPricesAtBlockForIntervalViaPivot, getPricesAtBlockForIntervalViaPivots } = require('../src/data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, computeBiggestDailyChange, rollingBiggestDailyChange } = require('../src/utils/volatility');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, HALF_LIFE_1Y, HALF_LIFE_2Y } = require('../src/utils/constants');
const { getRollingVolatility } = require('../src/data.interface/data.interface');

async function checkVolatility() {

    const base = 'WETH';
    const quote = 'wstETH';
    const prices = getPricesAtBlockForIntervalViaPivots('uniswapv3', base, quote, 0, 19_000_000);
    const medianed = medianPricesOverBlocks(prices, undefined);

    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    let volatility_all = await rollingBiggestDailyChange(medianed, web3Provider);
    console.log(volatility_all.latest.current);
    volatility_all = await getRollingVolatility('all', base, quote, web3Provider);
    console.log(volatility_all.latest.current);

    // fs.writeFileSync('volatility.json', JSON.stringify(volatility_all, null, 2));

    // const volatility_all = await getRollingVolatility('all', base, quote, web3Provider);
    // fs.writeFileSync('volatility.json', JSON.stringify(volatility_all, null, 2));

    // const volatility_1y = await getRollingVolatility('uniswapv3', 'wstETH', 'WETH', web3Provider);
    // fs.writeFileSync('volatility.json', JSON.stringify(volatility_1y, null, 2));
    // fs.writeFileSync('volatility.csv', 'blockstart,blockend,yesterday,current,minprice,maxprice\n');
    
    // for(const vol of volatility_1y.history) {
    //     fs.appendFileSync('volatility.csv', `${vol.blockStart},${vol.blockEnd},${vol.yesterday},${vol.current},${vol.minPrice},${vol.maxPrice}\n`);
    // }

    // const volatility_2y = await getRollingVolatility('uniswapv3', 'wstETH', 'WETH', web3Provider, HALF_LIFE_2Y);
    // fs.writeFileSync('volatility_2y.json', JSON.stringify(volatility_2y, null, 2));


    // fs.writeFileSync('volatility_2y.csv', 'blockstart,blockend,yesterday,current,minprice,maxprice\n');

    // for(const vol of volatility_2y.history) {
    //     fs.appendFileSync('volatility_2y.csv', `${vol.blockStart},${vol.blockEnd},${vol.yesterday},${vol.current},${vol.minPrice},${vol.maxPrice}\n`);
    // }

}

checkVolatility();
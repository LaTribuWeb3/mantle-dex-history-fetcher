const { getPricesAtBlockForIntervalViaPivot } = require('../src/data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, computeBiggestDailyChange, rollingBiggestDailyChange } = require('../src/utils/volatility');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, HALF_LIFE_1Y, HALF_LIFE_2Y } = require('../src/utils/constants');
const { getRollingVolatility } = require('../src/data.interface/data.interface');

async function checkVolatility() {

    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');

    const base = 'DAI';
    const quote = 'USDC';
    const volatility_univ3 = await getRollingVolatility('uniswapv3', base, quote, web3Provider);
    const volatility_all = await getRollingVolatility('all', base, quote, web3Provider);
    const volatility_curve = await getRollingVolatility('curve', base, quote, web3Provider);
    const volatility_univ2 = await getRollingVolatility('uniswapv2', base, quote, web3Provider);
    const volatility_sushiv2 = await getRollingVolatility('sushiswapv2', base, quote, web3Provider);

    console.log(volatility_all.latest.current);
    console.log(volatility_univ3.latest.current);
    console.log(volatility_curve.latest.current);
    console.log(volatility_univ2.latest.current);
    console.log(volatility_sushiv2.latest.current);


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
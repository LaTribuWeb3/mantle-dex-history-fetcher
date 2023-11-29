const { getPricesAtBlockForIntervalViaPivots } = require('../src/data.interface/internal/data.interface.utils');
const { medianPricesOverBlocks, rollingBiggestDailyChange } = require('../src/utils/volatility');
const fs = require('fs');
const { ethers } = require('ethers');

async function medianCheck() {
    
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    const base = 'wstETH';
    const quote = 'WETH';
    const prices = getPricesAtBlockForIntervalViaPivots('uniswapv3', 'wstETH', 'WETH', 1, 19_000_000, undefined);
    const medianed = medianPricesOverBlocks(prices, undefined);

    const filename = `${base}-${quote}-median-prices.csv`;
    const filenameReversed =`${quote}-${base}-median-prices.csv`;
    const toWrite = [];
    const toWriteReversed = [];

    
    fs.writeFileSync(filename, 'blocknumber,price\n');
    fs.writeFileSync(filenameReversed, 'blocknumber,price\n');

    for(const medianedData of medianed) {
        toWrite.push(`${medianedData.block},${medianedData.price}\n`);
        toWriteReversed.push(`${medianedData.block},${1/medianedData.price}\n`);
    }

    fs.appendFileSync(filename, toWrite.join(''));
    fs.appendFileSync(filenameReversed, toWriteReversed.join(''));

    const volatility = await rollingBiggestDailyChange(medianed, web3Provider);
    console.log(volatility.latest);
    fs.writeFileSync('volatility.json', JSON.stringify(volatility, null, 2));


}

medianCheck();
const { getLiquidityV2, getLiquidityAverageV2, getRollingVolatility } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { BLOCK_PER_DAY } = require('../src/utils/constants');
const { roundTo } = require('../src/utils/utils');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');
const { ethers } = require('ethers');

async function checkLiquidity() {
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');

    const block = await web3Provider.getBlockNumber();
    const base = 'rETH';
    const quote = 'pufETH';
    const platform = 'all';

    const liquidity = await getLiquidityV2(platform, base, quote, block);
    let valueFor5Pct = 0;
    if(liquidity) {
        valueFor5Pct = liquidity.slippageMap[500];
    }


    const liquidityBack = await getLiquidityV2(platform, quote, base, block);
    let valueFor5PctBack = 0;
    if(liquidityBack) {
        valueFor5PctBack = liquidityBack.slippageMap[500];
    }

    console.log(`platform ${platform} ${base} ${quote} : ${valueFor5Pct}`);
    console.log(`platform ${platform} ${quote} ${base} : ${valueFor5PctBack}`);

    // const liquidityAvg30d = await getLiquidityAverageV2(platform, base, quote, block - 30 * BLOCK_PER_DAY, block);
    // let valueFor5PctAvg = 0;
    // if(liquidityAvg30d) {
    //     valueFor5PctAvg = liquidityAvg30d.slippageMap[500];
    // }

    // console.log(`platform ${platform} ${base} ${quote} avg 30d : ${valueFor5PctAvg}`);

    // const volatility = await getRollingVolatility(platform, base, quote, web3Provider);
    // console.log(volatility.latest);
    
}

checkLiquidity();
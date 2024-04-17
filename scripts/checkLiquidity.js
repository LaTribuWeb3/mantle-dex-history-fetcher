const { getLiquidity, getLiquidityAll, getLiquidityV2, getLiquidityAverageV2 } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { PLATFORMS, BLOCK_PER_DAY } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');

async function checkLiquidity() {

    const block = 19673524;
    const base = 'pufETH';
    const quote = 'WETH';
    const platform = 'all';

    const liquidity = await getLiquidityV2(platform, base, quote, block);
    let valueFor5Pct = 0;
    if(liquidity) {
        valueFor5Pct = liquidity.slippageMap[500];
    }

    console.log(`platform ${platform} ${base} ${quote} : ${valueFor5Pct}`);

    const liquidityAvg30d = await getLiquidityAverageV2(platform, base, quote, block - 30 * BLOCK_PER_DAY, block);
    let valueFor5PctAvg = 0;
    if(liquidityAvg30d) {
        valueFor5PctAvg = liquidityAvg30d.slippageMap[500];
    }

    console.log(`platform ${platform} ${base} ${quote} avg 30d : ${valueFor5PctAvg}`);
}

checkLiquidity();

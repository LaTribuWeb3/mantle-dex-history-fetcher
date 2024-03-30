const { getLiquidity, getLiquidityAll } = require('./data.interface');
const { watchedPairs } = require('../global.config');
const { PLATFORMS } = require('../utils/constants');
const fs = require('fs');
const { roundTo } = require('../utils/utils');
const { getPrices } = require('./internal/data.interface.price');
const { getLastMedianPriceForBlock } = require('./internal/data.interface.utils');

function setLiquidityAndPrice(liquidities, base, quote, block) {
    if (!Object.hasOwn(liquidities, base)) liquidities[base] = {};
    if (!Object.hasOwn(liquidities[base], quote)) liquidities[base][quote] = {};
    liquidities[base][quote] = getLiquidity('uniswapv3', base, quote, block, block, false);
}

async function checkLiquidity() {

    const block = 19467267; //19539915;
    let liquidities = {};
    setLiquidityAndPrice(liquidities, 'wstETH', 'WETH', block);
    setLiquidityAndPrice(liquidities, 'WETH', 'USDC', block);
    setLiquidityAndPrice(liquidities, 'WETH', 'USDT', block);
    setLiquidityAndPrice(liquidities, 'USDC', 'USDT', block);

    let liquiditiesWithSlippagesAsArray = {};

    for (const base of Object.keys(liquidities)) {
        for (const quote of Object.keys(liquidities[base])) {
            const liquidity = liquidities[base][quote][block];
            if (!Object.hasOwn(liquiditiesWithSlippagesAsArray, base)) liquiditiesWithSlippagesAsArray[base] = {};
            if (!Object.hasOwn(liquiditiesWithSlippagesAsArray[base], quote)) liquiditiesWithSlippagesAsArray[base][quote] = {};
            liquiditiesWithSlippagesAsArray[base][quote] = Object.keys(liquidity.slippageMap).map(slippage => liquidity.slippageMap[slippage].base * liquidity.price);
        }
    }

    fs.writeFileSync('liquidityresult.csv', 'base,quote,liquidity\n');

    computePairLiquidity('wstETH', 'USDT');

    computePairLiquidity('wstETH', 'USDC');

}

checkLiquidity();

function computePairLiquidity(base, quote) {
    const block = 19467267;
    // const univ3Liquidity = getLiquidity(base, quote, block, block);

    const newLiquidity = getLiquidityAll(base, quote, block, block);
    const newLqty = newLiquidity[block].slippageMap[500].base;
    console.log(`${base}/${quote} new liquidity: ${newLqty}`);
    const line = `${base},${quote},${newLqty}`;
    console.log(line);
    fs.appendFileSync('liquidityresult.csv', line + '\n');
}
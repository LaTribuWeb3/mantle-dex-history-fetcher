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
    // console.log(JSON.stringify(liquidities));

    // const l2 = getLiquidity('uniswapv3', 'WETH', 'USDC', block, block, false);
    // l2.base = 'WETH';
    // l2.quote = 'USDC';
    // console.log(l2);
    // const l3 = getLiquidity('uniswapv3', 'WETH', 'USDT', block, block, false);
    // l3.base = 'WETH';
    // l3.quote = 'USDT';
    // console.log(l3);
    // const l4 = getLiquidity('uniswapv3', 'USDC', 'USDT', block, block, false);
    // l4.base = 'USDC';
    // l4.quote = 'USDT';
    // console.log(l4);

    let liquiditiesWithSlippagesAsArray = {};

    for (const targetSlippage of [500]) {

        const reworkedSlippages = [];
        for (const base of Object.keys(liquidities)) {
            for (const quote of Object.keys(liquidities[base])) {
                const liquidity = liquidities[base][quote][block];
                if (!Object.hasOwn(liquiditiesWithSlippagesAsArray, base)) liquiditiesWithSlippagesAsArray[base] = {};
                if (!Object.hasOwn(liquiditiesWithSlippagesAsArray[base], quote)) liquiditiesWithSlippagesAsArray[base][quote] = {};
                liquiditiesWithSlippagesAsArray[base][quote] = Object.keys(liquidity.slippageMap).map(slippage => liquidity.slippageMap[slippage].base * liquidity.price);
                // for (const slippageBps of Object.keys(liquidity.slippageMap)) {
                //     if (Number(slippageBps) <= targetSlippage) {
                //         reworkedSlippages.push({
                //             name: `${base}_${slippageBps}_${quote}`,
                //             valueUsd: liquidity.slippageMap[slippageBps].base * liquidity.price // TODO PRICE OF THE GOOD TOKEN LOL
                //         });
                //     }
                // }
            }
        }

        // console.log(reworkedSlippages);
        // const amount = getSolverResult(targetSlippage, [liquiditywstETHETH, l2, l3, l4, l5]);
    }

    fs.writeFileSync('liquidityresult.csv', 'base,quote,liquidity\n');

    // for(const base of Object.keys(watchedPairs)) {
    //     for(const quoteCfg of watchedPairs[base]) {
    //         const quote = quoteCfg.quote;
    //         computePairLiquidity(base, quote);
    //         computePairLiquidity(quote, base);
    //     }
    // }

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
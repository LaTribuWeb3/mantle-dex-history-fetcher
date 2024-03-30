const { getLiquidity, getLiquidityAll } = require('./data.interface');
const { watchedPairs } = require('../global.config');
const { PLATFORMS } = require('../utils/constants');
const fs = require('fs');
const { roundTo } = require('../utils/utils');
const { getPrices } = require('./internal/data.interface.price');

async function checkLiquidity() {

    const block = 19467267; //19539915;
    const liquiditywstETHETH = getLiquidity('uniswapv3', 'wstETH', 'WETH', block, block, false);
    const price = getPrices('uniswapv3', 'wstETH', 'USDC', block, block);
    liquiditywstETHETH.base = 'wstETH';
    liquiditywstETHETH.quote = 'WETH';
    console.log(liquiditywstETHETH);

    const l2 = getLiquidity('uniswapv3', 'WETH', 'USDC', block, block, false);
    l2.base = 'WETH';
    l2.quote = 'USDC';
    console.log(l2);
    const l3 = getLiquidity('uniswapv3', 'WETH', 'USDT', block, block, false);
    l3.base = 'WETH';
    l3.quote = 'USDT';
    console.log(l3);
    const l4 = getLiquidity('uniswapv3', 'USDC', 'USDT', block, block, false);
    l4.base = 'USDC';
    l4.quote = 'USDT';
    console.log(l4);

    for (const targetSlippage of [500]) {

        const reworkedSlippages = [];
        for (const liquidity of [liquiditywstETHETH, l2, l3, l4]) {
            for (const slippageBps of Object.keys(liquidity[block].slippageMap)) {
                if (Number(slippageBps) <= targetSlippage) {
                    reworkedSlippages.push({
                        name: `${liquidity.base}_${slippageBps}_${liquidity.quote}`,
                        valueUsd: liquidity[block].slippageMap[slippageBps].base * price[0].price // TODO PRICE OF THE GOOD TOKEN LOL
                    });
                }
            }
        }

        console.log(reworkedSlippages);
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
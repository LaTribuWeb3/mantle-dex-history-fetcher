const { getLiquidity, getLiquidityAll } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { PLATFORMS } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');

async function checkLiquidity() {

    fs.writeFileSync('liquidityresult.csv', 'base,quote,liquidity\n');

    // for(const base of Object.keys(watchedPairs)) {
    //     for(const quoteCfg of watchedPairs[base]) {
    //         const quote = quoteCfg.quote;
    //         computePairLiquidity(base, quote);
    //         computePairLiquidity(quote, base);
    //     }
    // }

    computePairLiquidity('WETH', 'USDT');
    
}

checkLiquidity();

function computePairLiquidity(base, quote) {
    const block = 19609694;
    // const newLiquidity = getLiquidityAll(base, quote, block, block, false);
    // const newLqty = newLiquidity[block].slippageMap[500].base;
    // console.log(`${base}/${quote} new liquidity: ${newLqty}`);
    const newLiquidityJump = getLiquidityAll(base, quote, block, block, true);
    const priceWETH = getPriceAtBlock('uniswapv3', 'WETH', 'USDC', block);
    const priceWBTC = getPriceAtBlock('uniswapv3', 'WBTC', 'USDC', block);
    console.log({priceWETH}, {priceWBTC});
    const newLqtyJump = newLiquidityJump[block].slippageMap[500].base;
    console.log(`${base}/${quote} new liquidity jump: ${newLqtyJump}`);

    // // const line = `${base},${quote},${newLqty}`;
    // console.log(line);
    // fs.appendFileSync('liquidityresult.csv', line + '\n');
}

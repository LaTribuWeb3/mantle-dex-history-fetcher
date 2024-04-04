const { getLiquidity, getLiquidityAll } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { PLATFORMS } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');

async function checkLiquidity() {

    fs.writeFileSync('liquidityresult.csv', 'base,quote,liquidity\n');

    // for(const base of Object.keys(watchedPairs)) {
    //     for(const quoteCfg of watchedPairs[base]) {
    //         const quote = quoteCfg.quote;
    //         computePairLiquidity(base, quote);
    //         computePairLiquidity(quote, base);
    //     }
    // }

    computePairLiquidity('wstETH', 'USDC');
    
}

checkLiquidity();

function computePairLiquidity(base, quote) {
    const newLiquidity = getLiquidityAll(base, quote, 19405598, 19405598, false);
    const newLiquidityJump = getLiquidityAll(base, quote, 19405598, 19405598, true);


    const newLqty = newLiquidity[19405598].slippageMap[500].base;
    const newLqtyJump = newLiquidityJump[19405598].slippageMap[500].base;
    console.log(`${base}/${quote} new liquidity: ${newLqty}`);
    console.log(`${base}/${quote} new liquidity jump: ${newLqtyJump}`);
    const line = `${base},${quote},${newLqty}`;
    console.log(line);
    fs.appendFileSync('liquidityresult.csv', line + '\n');
}

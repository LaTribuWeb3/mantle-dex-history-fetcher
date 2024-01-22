const { getLiquidity, getLiquidityAll } = require('../src/data.interface/data.interface');
const { watchedPairs } = require('../src/global.config');
const { PLATFORMS } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');

async function checkLiquidity() {

    fs.writeFileSync('liquidityresult.csv', 'base,quote,old,new,change\n');

    for(const base of Object.keys(watchedPairs)) {
        for(const quoteCfg of watchedPairs[base]) {
            const quote = quoteCfg.quote;
            computePairLiquidity(base, quote);
            computePairLiquidity(quote, base);
        }
    }

    // computePairLiquidity('WBTC', 'sUSD');
    
}


/*
    wstETH->USDC => RIEN
    via pivot WETH => wstETH->WETH->USDC (avant => wstETH->WETH n'existe pas sur curve)
    via pivot USDC NON CAR QUOTE = USDC, sinon ça fera wstETH->USDC->USDC
    via pivot WBTC => wstETH->WBTC->USDC mais wstETH->WBTC n'existe pas sur curve

*/
checkLiquidity();

function computePairLiquidity(base, quote) {
    let sumLqdty = 0;
    for (const platform of PLATFORMS) {
        const liquidity = getLiquidity(platform, base, quote, 19000000, 19010000, true);
        if (liquidity) {
            console.log(platform, liquidity[19010000].slippageMap[500].base);
            sumLqdty += liquidity[19010000].slippageMap[500].base;
        }
    }

    const newLiquidity = getLiquidityAll(base, quote, 19000000, 19010000);
    const newLqty = newLiquidity[19010000].slippageMap[500].base;
    console.log(`${base}/${quote} old liquidity: ${sumLqdty}`);
    console.log(`${base}/${quote} new liquidity: ${newLqty}`);
    const line = `${base},${quote},${sumLqdty},${newLqty},${roundTo(((newLqty / sumLqdty) - 1) * 100, 2)}%`;
    console.log(line);
    fs.appendFileSync('liquidityresult.csv', line + '\n');
}

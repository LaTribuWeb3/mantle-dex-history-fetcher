const { getLiquidity, getLiquidityV2 } = require('../src/data.interface/data.interface');

async function checkLiquidity() {
    const base = 'wstETH';
    const quote = 'WETH';
    let sumLqdty = 0;

    let liquidity = getLiquidity('uniswapv3', base, quote, 19_000_000, 19_010_000, true);
    if(liquidity) {
        console.log('uniswapv3', liquidity[19_010_000].slippageMap[500].base);
        sumLqdty += liquidity[19_010_000].slippageMap[500].base;
    }

    liquidity = getLiquidity('curve', base, quote, 19_000_000, 19_010_000, true);
    if(liquidity) {
        console.log('curve', liquidity[19_010_000].slippageMap[500].base);
        sumLqdty += liquidity[19_010_000].slippageMap[500].base;
    }

    liquidity = getLiquidity('uniswapv2', base, quote, 19_000_000, 19_010_000, true);
    if(liquidity) {
        console.log('uniswapv2', liquidity[19_010_000].slippageMap[500].base);
        sumLqdty += liquidity[19_010_000].slippageMap[500].base;
    }

    liquidity = getLiquidity('sushiswapv2', base, quote, 19_000_000, 19_010_000, true);
    if(liquidity){
        console.log('sushiswapv2', liquidity[19_010_000].slippageMap[500].base);
        sumLqdty += liquidity[19_010_000].slippageMap[500].base;
    }

    getLiquidityV2(base, quote,  19_000_000, 19_010_000);
    console.log(`${base}/${quote} old liquidity: ${sumLqdty}`);
}


/*
    wstETH->USDC => RIEN
    via pivot WETH => wstETH->WETH->USDC (avant => wstETH->WETH n'existe pas sur curve)
    via pivot USDC NON CAR QUOTE = USDC, sinon ça fera wstETH->USDC->USDC
    via pivot WBTC => wstETH->WBTC->USDC mais wstETH->WBTC n'existe pas sur curve

*/
checkLiquidity();
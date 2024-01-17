const { getLiquidity } = require('../src/data.interface/data.interface');

async function checkLiquidity() {
    let liquidity = getLiquidity('uniswapv3', 'wstETH', 'USDC', 19_000_000, 19_018_931, true);
    console.log('uniswapv3', liquidity[19018900].slippageMap[500].base);
    liquidity = getLiquidity('curve', 'wstETH', 'USDC', 19_000_000, 19_018_931, true);
    console.log('curve', liquidity[19018900].slippageMap[500].base);
}


/*
    wstETH->USDC => RIEN
    via pivot WETH => wstETH->WETH->USDC (avant => wstETH->WETH n'existe pas sur curve)
    via pivot USDC NON CAR QUOTE = USDC, sinon ça fera wstETH->USDC->USDC
    via pivot WBTC => wstETH->WBTC->USDC mais wstETH->WBTC n'existe pas sur curve

*/
checkLiquidity();
const { getLiquidity } = require('../src/data.interface/data.interface');

async function curveAggreg() {

    const base = 'wstETH';
    const quote = 'WETH';
    const liquidity_nojumps = getLiquidity('curve',base, quote, 18_000_000, 18_200_000, false);
    if(liquidity_nojumps) {
        console.log(Object.values(liquidity_nojumps)[0].slippageMap[500]);
    } else {
        console.log('no liquidity without jump');
    }
    
    const liquidity_withjumps = getLiquidity('curve',base, quote, 18_000_000, 18_200_000, true);
    if(liquidity_withjumps) {
        console.log(Object.values(liquidity_withjumps)[0].slippageMap[500]);
    } else {
        console.log('no liquidity with jump');
    }

    
    const liquidityuniv3 = getLiquidity('uniswapv3',base, quote, 18_000_000, 18_200_000, true);
    if(liquidityuniv3) {
        console.log(Object.values(liquidityuniv3)[0].slippageMap[500]);
    } else {
        console.log('no liquidity univ3 with jump');
    }
}

curveAggreg();
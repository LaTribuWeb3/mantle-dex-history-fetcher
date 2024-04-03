const { getLiquidity } = require('./data.interface');
const lp_solve = require('lp_solve');
const glpm = require('../utils/glpm.js');
const { getPriceAtBlock } = require('./internal/data.interface.price.js');

function setLiquidityAndPrice(liquidities, base, quote, block) {
    if (!Object.hasOwn(liquidities, base)) liquidities[base] = {};
    if (!Object.hasOwn(liquidities[base], quote)) liquidities[base][quote] = {};
    liquidities[base][quote] = getLiquidity('uniswapv3', base, quote, block, block, false);
}

function generateSpecForBlock(block, assetsSpecification) {
    let origin = assetsSpecification.origin;
    let intermediaryAssets = assetsSpecification.intermediaryAssets;
    let target = assetsSpecification.target;

    let liquidity = {};

    let liquidities = {};

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, origin, intermediaryAsset, block);
    }

    for (let assetIn of intermediaryAssets) {
        for (let assetOut of intermediaryAssets) {
            if (assetIn == assetOut) continue;
            setLiquidityAndPrice(liquidities, assetIn, assetOut, block);
        }
    }

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, intermediaryAsset, target, block);
    }

    for (const base of Object.keys(liquidities)) {
        for (const quote of Object.keys(liquidities[base])) {
            if (base === quote) continue;
            const liquidityForBaseQuote = liquidities[base][quote];
            if (liquidityForBaseQuote !== undefined) {
                const oneLiquidity = liquidityForBaseQuote[block];
                if (!Object.hasOwn(liquidity, base)) liquidity[base] = {};
                if (!Object.hasOwn(liquidity[base], quote)) liquidity[base][quote] = {};
                liquidity[base][quote] =
                    Object.keys(oneLiquidity.slippageMap)
                        .map(slippage =>
                            oneLiquidity.slippageMap[slippage].base
                            * getPriceAtBlock('uniswapv3', base, quote, block)
                        );
            }
        }
    }

    return glpm.writeGLPMSpec(
        {
            assets: intermediaryAssets.concat([origin, target]),
            origin: origin,
            target: target,
            slippageStepBps: 50,
            targetSlippageBps: 500
        }, liquidity
    );
}


async function solve_GLPM(gLPMSpec) {
    let res = await lp_solve.executeGLPSol(gLPMSpec);
    let columns = res.columns.filter(column => column.activity !== 0);
    let ret = {};
    for (let column of columns) {
        ret[column.name] = column.activity;
    }
    console.log(ret);
    return ret;
}

var gLPMSpec = generateSpecForBlock(
    19467267,
    {
        origin: 'wstEth',
        intermediaryAssets: ['WETH', 'USDT'],
        target: 'USDC'
    }
);

solve_GLPM(gLPMSpec);
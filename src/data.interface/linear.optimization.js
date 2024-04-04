const { getLiquidity } = require('./data.interface');
const lp_solve = require('lp_solve');
const glpm = require('../utils/glpm.js');
const { getPriceAtBlock } = require('./internal/data.interface.price.js');
const fs = require('fs');
const humanFormat = require('human-format');

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
                            * (base === 'USDC' ?
                                1 : getPriceAtBlock('uniswapv3', base, 'USDC', block))
                        )
                        .map((e, i, a) => i === 0 ? e : e - a[i - 1]);
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
        let [base, slippage, quote] = column.name.split('_');
        if (ret[base] == undefined) ret[base] = {};
        if (ret[base][quote] == undefined) ret[base][quote] = {};
        ret[base][quote][slippage] = column.activity;
    }

    var graph = 'flowchart LR;\n';
    var totals = {};
    let quoteTotals = {};

    for (let base of Object.keys(ret)) {
        let edges = [];
        for (let quote of Object.keys(ret[base])) {
            let total = 0;
            for (let slippage of Object.keys(ret[base][quote])) {
                total += ret[base][quote][slippage];
            }
            edges[edges.length] = { 'base': base, 'total': total, 'quote': quote };
            if (Object.keys(totals).includes(base)) totals[base] = totals[base] + total;
            else totals[base] = total;
            if (Object.keys(quoteTotals).includes(quote)) quoteTotals[quote] = quoteTotals[quote] + total;
            else quoteTotals[quote] = total;
        }
        edges.map(edge => {
            graph += '  ' + edge.base + '-->|$' + humanFormat(edge.total) + '|' + edge.quote + '\n';
        });
    }

    for (let totalKey of Object.keys(totals)) {
        graph += '  ' + totalKey + '[ ' + totalKey + ' $' + humanFormat(totals[totalKey]) + ' ]\n';
    }

    for (let totalKey of Object.keys(quoteTotals)) {
        if (! Object.keys(totals).includes(totalKey) ) {
            graph += '  ' + totalKey + '[ ' + totalKey + ' $' + humanFormat(quoteTotals[totalKey] * 0.95) + ' ]\n';
        }
    }

    fs.writeFileSync('graph.md', graph);

    console.log(ret);

    return { detailedMatrix: ret, graph: graph };
}

var gLPMSpec = generateSpecForBlock(
    19467267,
    {
        origin: 'wstEth',
        intermediaryAssets: ['WETH', 'USDC', 'DAI', 'USDT'],
        target: 'SNX'
    }
);

solve_GLPM(gLPMSpec);
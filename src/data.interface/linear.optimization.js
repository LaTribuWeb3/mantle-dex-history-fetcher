const { getLiquidityAll, getLiquidity } = require('./data.interface');
const lp_solve = require('lp_solve');
const glpm = require('../utils/glpm.js');
const { getPriceAtBlock } = require('./internal/data.interface.price.js');
const fs = require('fs');
const humanFormat = require('human-format');

function setLiquidityAndPrice(liquidities, base, quote, block, platform = undefined) {
    if (!Object.hasOwn(liquidities, base)) liquidities[base] = {};
    if (!Object.hasOwn(liquidities[base], quote)) liquidities[base][quote] = {};
    if (platform === undefined) liquidities[base][quote] = getLiquidityAll(base, quote, block, block, false);
    else liquidities[base][quote] = getLiquidity(platform, base, quote, block, block, false);
}

function generateSpecForBlock(block, assetsSpecification) {
    let origin = assetsSpecification.origin;
    let intermediaryAssets = assetsSpecification.intermediaryAssets;
    let target = assetsSpecification.target;
    let platform = assetsSpecification.platform;

    let liquidity = {};
    let liquidities = {};

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, origin, intermediaryAsset, block, platform);
    }

    for (let assetIn of intermediaryAssets) {
        for (let assetOut of intermediaryAssets) {
            if (assetIn == assetOut) continue;
            setLiquidityAndPrice(liquidities, assetIn, assetOut, block, platform);
        }
    }

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, intermediaryAsset, target, block, platform);
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
                                1 : getPriceAtBlock('all', base, 'USDC', block))
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


async function solve_GLPM(gLPMSpec, origin, target, block) {
    let res = await lp_solve.executeGLPSol(gLPMSpec);

    let resultMatrix = getResAsMatrix(res, origin, target, block);

    var graph = computeGraphFromMatrix(resultMatrix);

    fs.writeFileSync('graph.md', graph);

    console.log(resultMatrix);

    return { detailedMatrix: resultMatrix, graph: graph };
}

function computeGraphFromMatrix(resultMatrix) {
    var graph = 'flowchart LR;\n';
    var totals = {};
    let quoteTotals = {};

    for (let base of Object.keys(resultMatrix)) {
        let edges = [];
        for (let quote of Object.keys(resultMatrix[base])) {
            let total = 0;
            for (let slippage of Object.keys(resultMatrix[base][quote])) {
                total += resultMatrix[base][quote][slippage];
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
        if (!Object.keys(totals).includes(totalKey)) {
            graph += '  ' + totalKey + '[ ' + totalKey + ' $' + humanFormat(quoteTotals[totalKey] * 0.95) + ' ]\n';
        }
    }
    return graph;
}

function getResAsMatrix(res, origin, target, block) {
    let columns = res.columns.filter(column => column.activity !== 0);
    let ret = {};

    for (let column of columns) {
        let [base, slippage, quote] = column.name.split('_');
        if (ret[base] == undefined) ret[base] = {};
        if (ret[base][quote] == undefined) ret[base][quote] = {};
        ret[base][quote][slippage] = column.activity;
    }

    let slippageMapOriginTarget = getLiquidityAll(origin, target, block, block, false)[block].slippageMap;

    ret[origin][target] = {};
    Object.keys(slippageMapOriginTarget).filter(key => key <= 500)
        .map(slippage => ret[origin][target][slippage] = slippageMapOriginTarget[slippage].base * (origin === 'USDC' ? 1 : getPriceAtBlock('all', origin, 'USDC', block))
        );

    return ret;
}

var gLPMSpec = generateSpecForBlock(
    19467267,
    {
        origin: 'WETH',
        intermediaryAssets: ['DAI', 'WBTC', 'USDC'],
        // intermediaryAssets: ['WETH'],
        target: 'USDT',
        platform: 'uniswapv3'
    }
);

solve_GLPM(gLPMSpec, 'WETH', 'USDT', 19467267);
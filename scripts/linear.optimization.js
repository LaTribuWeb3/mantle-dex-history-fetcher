const { getLiquidityAll, getLiquidity } = require('../src/data.interface/data.interface.js');
const lp_solve = require('@3lden/lp_solve');
const glpm = require('../src/utils/glpm.js');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price.js');
const fs = require('fs');
const humanFormat = require('human-format');
const Graph = require('graphology');
const { getDefaultSlippageMap, getUnifiedDataForInterval } = require('../src/data.interface/internal/data.interface.utils.js');
const { getSumSlippageMapAcrossDexes } = require('../src/data.interface/internal/data.interface.liquidity.js');
const { DEFAULT_STEP_BLOCK } = require('../src/utils/constants.js');

function setLiquidityAndPrice(liquidities, base, quote, block, platform = undefined, usedPools = []) {
    if (!Object.hasOwn(liquidities, base)) liquidities[base] = {};
    // if (!Object.hasOwn(liquidities[base], quote)) liquidities[base][quote] = {};
    let liquidity = undefined;
    if (platform === undefined) {
        liquidity = getSumSlippageMapAcrossDexes(base, quote, block, block, DEFAULT_STEP_BLOCK, usedPools);
    } 
    else {
        liquidity = getUnifiedDataForInterval(platform, base, quote, block, block, DEFAULT_STEP_BLOCK, usedPools);
    } 

    if (liquidity && liquidity.unifiedData) {
        liquidities[base][quote] = liquidity.unifiedData;
        usedPools.push(...liquidity.usedPools);
    }
}

function generateSpecForBlock(block, assetsSpecification) {
    let origin = assetsSpecification.origin;
    let intermediaryAssets = assetsSpecification.intermediaryAssets;
    let target = assetsSpecification.target;
    let platform = assetsSpecification.platform;
    let nullEdges = assetsSpecification.nullEdges === undefined ? [] : assetsSpecification.nullEdges;

    let liquidity = {};
    let liquidities = {};
    const usedPools = [];

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, origin, intermediaryAsset, block, platform, usedPools);
    }

    for (let assetIn of intermediaryAssets) {
        for (let assetOut of intermediaryAssets) {
            if (assetIn == assetOut) continue;
            setLiquidityAndPrice(liquidities, assetIn, assetOut, block, platform, usedPools);
        }
    }

    for (let intermediaryAsset of intermediaryAssets) {
        setLiquidityAndPrice(liquidities, intermediaryAsset, target, block, platform, usedPools);
    }


    for (const base of Object.keys(liquidities)) {
        for (const quote of Object.keys(liquidities[base])) {
            if (base === quote) continue;
            const liquidityForBaseQuote = liquidities[base][quote];
            if (liquidityForBaseQuote !== undefined) {
                const oneLiquidity = liquidityForBaseQuote[block];
                if (!Object.hasOwn(liquidity, base)) liquidity[base] = {};
                if (!Object.hasOwn(liquidity[base], quote)) liquidity[base][quote] = {};
                liquidity[base][quote] = nullEdges.includes(base + '/' + quote) ?
                    0
                    :
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

function computeGraphFromResultMatrix(resultMatrix) {
    var graph = new Graph();
    var totals = {};
    let quoteTotals = {};
    let edges = [];

    for (let base of Object.keys(resultMatrix)) {
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
    }

    for (let totalKey of Object.keys(totals)) {
        graph.addNode(totalKey, { 'amount': totals[totalKey] });
    }

    for (let totalKey of Object.keys(quoteTotals)) {
        if (!Object.keys(totals).includes(totalKey)) {
            graph.addNode(totalKey, { 'amount': quoteTotals[totalKey] * 0.95 });
        }
    }

    edges.map(edge => {
        graph.addEdgeWithKey(edge.base + '/' + edge.quote, edge.base, edge.quote, { 'base': edge.base, 'quote': edge.quote, 'amount': edge.total });
    });

    return graph;
}

function generateMarkDownForMermaidGraph(graph) {
    var stringGraph = 'flowchart LR;\n';

    for (let node of graph.nodes()) {
        stringGraph += '  ' + node + '[ ' + node + ' $' + humanFormat(graph.getNodeAttributes(node).amount) + ' ]\n';
    }

    for (let node of graph.edges()) {
        let attrs = graph.getEdgeAttributes(node);
        stringGraph += '  ' + attrs.base + '-->|$' + humanFormat(attrs.amount) + '|' + attrs.quote + '\n';
    }

    return stringGraph;
}

function computeMatrixFromGLPMResult(res, origin, target, block, platform) {
    let columns = res.columns.filter(column => column.activity !== 0);
    let ret = {};

    for (let column of columns) {
        let [base, slippage, quote] = column.name.split('_');
        if (ret[base] == undefined) ret[base] = {};
        if (ret[base][quote] == undefined) ret[base][quote] = {};
        ret[base][quote][slippage] = column.activity;
    }

    let liquidityAtBlock = {};
    if (platform == undefined) {
        liquidityAtBlock = getLiquidityAll(origin, target, block, block, false);
    } else {
        liquidityAtBlock = getLiquidity(platform, origin, target, block, block, false);
    }

    if (!liquidityAtBlock) {
        liquidityAtBlock = {
            [`${block}`]: {
                slippageMap: getDefaultSlippageMap()
            }
        };
    }

    let slippageMapOriginTarget = getDefaultSlippageMap();
    for (const slippageBps of Object.keys(liquidityAtBlock[block].slippageMap)) {
        if (slippageBps == 50) {
            slippageMapOriginTarget[50].base = liquidityAtBlock[block].slippageMap[50].base;
        } else {
            slippageMapOriginTarget[slippageBps].base = liquidityAtBlock[block].slippageMap[slippageBps].base - liquidityAtBlock[block].slippageMap[slippageBps - 50].base;
        }
    }

    Object.keys(slippageMapOriginTarget).filter(key => key <= 500)
        .map(slippageBps => [slippageBps, slippageMapOriginTarget[slippageBps].base * (origin === 'USDC' ? 1 : getPriceAtBlock('all', origin, 'USDC', block))])
        .filter(([, slippageInUSDC]) => slippageInUSDC != 0)
        .map(([slippageBps, slippageInUSDC]) => {
            if (!ret[origin]) {
                ret[origin] = {};
            }

            if (!ret[origin][target]) {
                ret[origin][target] = {};
            }

            ret[origin][target][slippageBps] = slippageInUSDC;
        });

    return ret;
}

async function generateNormalizedGraphForBlock(blockNumber, origin, pivots, target, platform, threshold) {
    let edgesWithNegligibleLiquidities = false;
    var graph = undefined;
    let resultMatrix = {};
    const realPivotToUse = [];
    for(const pivot of pivots) {
        if(pivot == origin || pivot == target) continue;

        realPivotToUse.push(pivot);
    }

    do {
        var gLPMSpec = generateSpecForBlock(
            blockNumber,
            {
                origin: origin,
                intermediaryAssets: realPivotToUse,
                target: target,
                platform: platform,
                nullEdges: graph === undefined ? [] : graph.edges().filter(edge => graph.getEdgeAttributes(edge).nullLiquidity)
            }
        );

        let glpmResult = await lp_solve.executeGLPSol(gLPMSpec, true);

        resultMatrix = computeMatrixFromGLPMResult(glpmResult, origin, target, blockNumber, platform);

        graph = computeGraphFromResultMatrix(resultMatrix);

        edgesWithNegligibleLiquidities = false;

        for (let base of graph.nodes()) {
            let baseAmount = graph.getNodeAttributes(base).amount;
            for (let edge of graph.edges()) {
                if (edge.startsWith(base)) {
                    console.log(edge);
                    if (graph.getEdgeAttributes(edge).amount < baseAmount * threshold) {
                        graph.getEdgeAttributes(edge).nullLiquidity = true;
                        edgesWithNegligibleLiquidities = true;
                    }
                }
            }
        }
    } while (edgesWithNegligibleLiquidities);
    return graph;
}

module.exports = { generateNormalizedGraphForBlock };


async function test() {
    const platform = undefined; // undefined for all
    var graph = await generateNormalizedGraphForBlock(
        64766791,
        'WBTC',
        ['mETH', 'USDT', 'USDC', 'WETH', 'WBTC'],
        // [ 'WETH', 'USDT', 'mETH', 'USDC', 'WBTC'],
        'USDY',
        platform,
        0 // routes under this percentage of the total liquidity will be ignored
    );

    fs.writeFileSync('graph.md', generateMarkDownForMermaidGraph(graph));
}

test();

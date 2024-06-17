const { getLiquidityV2, getLiquidityAverageV2, getRollingVolatility } = require('../src/data.interface/data.interface');
const { watchedPairs, specificPivotsOverride } = require('../src/global.config');
const { BLOCK_PER_DAY } = require('../src/utils/constants');
const { roundTo } = require('../src/utils/utils');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');
const { ethers } = require('ethers');
const fs = require('fs');

function getPermutations(array) {
    if (array.length === 0) return [[]];
    const firstElement = array[0];
    const rest = array.slice(1);
    const permutationsWithoutFirst = getPermutations(rest);
    const allPermutations = [];

    permutationsWithoutFirst.forEach(permutation => {
        for (let i = 0; i <= permutation.length; i++) {
            const permutationWithFirst = [...permutation.slice(0, i), firstElement, ...permutation.slice(i)];
            allPermutations.push(permutationWithFirst);
        }
    });

    return allPermutations;
}

async function checkLiquidity() {
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://rpc.mantle.xyz');
    const baseTokens =  [ 'USDT', 'mETH', 'WETH', 'USDC'];

    const allPermutations = getPermutations(baseTokens);

    const block = await web3Provider.getBlockNumber();
    const platform = 'all';

    let newSpecificPivotsOverride = {};
    if(fs.existsSync('bestPerms.json')) {
        newSpecificPivotsOverride = JSON.parse(fs.readFileSync('bestPerms.json'));
    }

    
    const pairsToFetch = [];
    for(const base of Object.keys(watchedPairs)) {
        for(const quoteCfg of watchedPairs[base]) {
            if(!quoteCfg.exportToInternalDashboard) continue;
            const quote = quoteCfg.quote;
            pairsToFetch.push({
                base,
                quote
            });

            pairsToFetch.push({
                base: quote,
                quote: base
            });
        }
    }

    for(const pairToFetch of pairsToFetch) {
        const base = pairToFetch.base;
        const quote = pairToFetch.quote;
        if(newSpecificPivotsOverride[`${base}/${quote}`] &&
                newSpecificPivotsOverride[`${base}/${quote}`].length > 0) {
            console.log(`${base}/${quote} already done`);
            continue;
        }

        let bestPermutation = [];
        let bestValue = 0;
        for(const pivotPermutation of allPermutations) {
            specificPivotsOverride[`${base}/${quote}`] = pivotPermutation;
            const liquidity = await getLiquidityV2(platform, base, quote, block);
            let valueFor5Pct = 0;
            if(liquidity) {
                valueFor5Pct = liquidity.slippageMap[500];
            }

            if(valueFor5Pct > bestValue) {
                bestValue = valueFor5Pct;
                console.log(`new best permutation ${base} ${quote} for permutations ${pivotPermutation} : ${valueFor5Pct}`);
                bestPermutation = structuredClone(pivotPermutation);
            }
            console.log(`platform ${platform} ${base} ${quote} for permutations ${pivotPermutation} : ${valueFor5Pct}`);
        }

        console.log(`best permutation for ${base}/${quote}: ${bestPermutation} for value ${bestValue}`);
        newSpecificPivotsOverride[`${base}/${quote}`] = structuredClone(bestPermutation);
        fs.writeFileSync('bestPerms.json', JSON.stringify(newSpecificPivotsOverride, null, 2));
    }

    for(const [pair, pivots] of Object.entries(newSpecificPivotsOverride)) {
        let shouldDelete = true;
        for(let i = 0; i < pivots.length; i++) {
            if(pivots[i] != baseTokens[i]) {
                shouldDelete = false;
                break;
            }
        }

        if(shouldDelete) {
            console.log(`for pair ${pair}, pivots: ${pivots} are the same as ${baseTokens}`);
            delete newSpecificPivotsOverride[pair];
        } else {
            console.log(`for pair ${pair}, pivots: ${pivots} are the different than ${baseTokens}`);
        }
    }

    fs.writeFileSync('bestPerms-updated.json', JSON.stringify(newSpecificPivotsOverride, null, 2));

}

checkLiquidity();
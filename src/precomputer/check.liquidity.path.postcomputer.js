const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, roundTo, sleep } = require('../utils/utils');

const fs = require('fs');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const { watchedPairs, specificPivotsOverride } = require('../global.config');
const { getLiquidityV2 } = require('../data.interface/data.interface');


dotenv.config();

const runEverySec = 24 * 60 * 60;

const WORKER_NAME = 'Check Liquidity Path Computer';

async function CheckLiquidityPathComputer(onlyOnce = false) {
    // eslint-disable-next-line no-constant-condition
    console.log('Starting check liquidity path computer');
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const start = Date.now();
        try {
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'running',
                'lastStart': Math.round(start / 1000),
                'runEvery': runEverySec
            });

            await checkLiquidity();

            const runEndDate = Math.round(Date.now() / 1000);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'success',
                'lastEnd': runEndDate,
                'lastDuration': runEndDate - Math.round(start / 1000),
            });
        } catch (error) {
            const errorMsg = `An exception occurred: ${error}`;
            console.log(errorMsg);
            await RecordMonitoring({
                'name': WORKER_NAME,
                'status': 'error',
                'error': errorMsg
            });
        }

        if (onlyOnce) {
            return;
        }
        const sleepTime = runEverySec * 1000 - (Date.now() - start);
        if (sleepTime > 0) {
            console.log(`${fnName()}: sleeping ${roundTo(sleepTime / 1000 / 60)} minutes`);
            await sleep(sleepTime);
        }
    }
}

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
    const baseTokens = ['USDT', 'mETH', 'WETH', 'USDC'];

    const allPermutations = getPermutations(baseTokens);

    const block = await web3Provider.getBlockNumber();
    const platform = 'all';

    let newSpecificPivotsOverride = {};
    if (fs.existsSync('bestPerms.json')) {
        newSpecificPivotsOverride = JSON.parse(fs.readFileSync('bestPerms.json'));
    }


    const pairsToFetch = [];
    for (const base of Object.keys(watchedPairs)) {
        for (const quoteCfg of watchedPairs[base]) {
            if (!quoteCfg.exportToInternalDashboard) continue;
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

    for (const pairToFetch of pairsToFetch) {
        const base = pairToFetch.base;
        const quote = pairToFetch.quote;
        if (newSpecificPivotsOverride[`${base}/${quote}`] &&
            newSpecificPivotsOverride[`${base}/${quote}`].length > 0) {
            console.log(`${base}/${quote} already done`);
            continue;
        }

        let bestPermutation = [];
        let bestValue = 0;
        for (const pivotPermutation of allPermutations) {
            specificPivotsOverride[`${base}/${quote}`] = pivotPermutation;
            const liquidity = await getLiquidityV2(platform, base, quote, block);
            let valueFor5Pct = 0;
            if (liquidity) {
                valueFor5Pct = liquidity.slippageMap[500];
            }

            if (valueFor5Pct > bestValue) {
                bestValue = valueFor5Pct;
                console.log(`new best permutation ${base} ${quote} for permutations ${pivotPermutation} : ${valueFor5Pct}`);
                bestPermutation = structuredClone(pivotPermutation);
            }
            console.log(`platform ${platform} ${base} ${quote} for permutations ${pivotPermutation} : ${valueFor5Pct}`);
        }

        console.log(`best permutation for ${base}/${quote}: ${bestPermutation} for value ${bestValue}`);
        newSpecificPivotsOverride[`${base}/${quote}`] = structuredClone(bestPermutation);
        fs.writeFileSync('../../data/permutations.json', JSON.stringify(newSpecificPivotsOverride, null, 2));
    }

    for (const [pair, pivots] of Object.entries(newSpecificPivotsOverride)) {
        let shouldDelete = true;
        for (let i = 0; i < pivots.length; i++) {
            if (pivots[i] != baseTokens[i]) {
                shouldDelete = false;
                break;
            }
        }

        if (shouldDelete) {
            console.log(`for pair ${pair}, pivots: ${pivots} are the same as ${baseTokens}`);
            delete newSpecificPivotsOverride[pair];
        } else {
            console.log(`for pair ${pair}, pivots: ${pivots} are the different than ${baseTokens}`);
        }
    }

    fs.writeFileSync('../../data/permutations-updated.json', JSON.stringify(newSpecificPivotsOverride, null, 2));

}

module.exports = { CheckLiquidityPathComputer };
const { getLiquidity, getInputLiquidityAll } = require('./data.interface');
const fs = require('fs');
const lp_solve = require('lp_solve')
const glpm = require('../utils/glpm.js')

function setLiquidityAndPrice(liquidities, base, quote, block) {
    if (!Object.hasOwn(liquidities, base)) liquidities[base] = {};
    if (!Object.hasOwn(liquidities[base], quote)) liquidities[base][quote] = {};
    liquidities[base][quote] = getLiquidity('uniswapv3', base, quote, block, block, false);
}

let liquidity = {};

async function checkLiquidity() {

    const block = 19467267; //19539915;
    let liquidities = {};
    setLiquidityAndPrice(liquidities, 'wstETH', 'WETH', block);
    setLiquidityAndPrice(liquidities, 'WETH', 'USDC', block);
    setLiquidityAndPrice(liquidities, 'WETH', 'USDT', block);
    setLiquidityAndPrice(liquidities, 'USDC', 'USDT', block);

    for (const base of Object.keys(liquidities)) {
        for (const quote of Object.keys(liquidities[base])) {
            const oneLiquidity = liquidities[base][quote][block];
            if (!Object.hasOwn(liquidity, base)) liquidity[base] = {};
            if (!Object.hasOwn(liquidity[base], quote)) liquidity[base][quote] = {};
            liquidity[base][quote] = Object.keys(oneLiquidity.slippageMap).map(slippage => oneLiquidity.slippageMap[slippage].base * oneLiquidity.price);
        }
    }

    fs.writeFileSync('liquidityresult.csv', 'base,quote,liquidity\n');

    // computePairLiquidity('wstETH', 'USDT');

    // computePairLiquidity('wstETH', 'USDC');

}

checkLiquidity();

function computePairLiquidity(base, quote) {
    const block = 19467267;
    // const univ3Liquidity = getInputLiquidity(base, quote, block, block);

    const newLiquidity = getLiquidityAll(base, quote, block, block);
    const newLqty = newLiquidity[block].slippageMap[500].base;
    console.log(`${base}/${quote} new liquidity: ${newLqty}`);
    const line = `${base},${quote},${newLqty}`;
    console.log(line);
    fs.appendFileSync('liquidityresult.csv', line + '\n');
}

async function solve_GLPM(gLPMSpec) {
    let res = await lp_solve.executeGLPSol(gLPMSpec);
    console.log(res);
    return res;
}

// type GLPMSpec = {
//     assets: string[]; // You can replace 'any' with the specific type of assets
//     origin: string,
//     target: string,
//     slippageStep: number;
//     numSlippageSteps: number;
//     maxSlippage: number;
//     liquidationBonus: number;
// };

var gLPMSpec = glpm.writeGLPMSpec({
    assets: ["wstETH", "WETH", "USDC", "USDT"],
    origin: "wstETH",
    target: "USDC",
    slippageStep: 50,
    numSlippageSteps: 40,
    maxSlippage: 2000,
    liquidationBonus: 0.05
}, liquidity);

solve_GLPM(gLPMSpec);
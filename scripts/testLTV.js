function ltvFormula() {

    const cursor = 0.3;
    const lltv = 0.9;
    const liquidationIncentives = 1/(1 - cursor*(1 - lltv)) - 1;
    console.log({liquidationIncentives});

    const c = 1/10; // confidence level
    const sigma = 9.68/100; // volatility of USDT/USDC
    const l = 101_980_000; // liquidity of USDT/USDC
    const d = 1_000_000_000; // cap
    const beta = liquidationIncentives; // liquidation bonus
    // LTV  = e ^ (-c * sigma / sqrt(l/d)) - beta
    const cTimesSigma = -1 * c * sigma;
    const sqrtValue = Math.sqrt(l/d);
    const expValue = Math.exp(cTimesSigma / sqrtValue);
    const LTV = expValue - beta;

    console.log(LTV);


    // this output 0.8985...

}

function riskLevels() {

    const riskLevelUSDT = findRiskLevelFromParameters(9.66/100, 92_000_000, 3/100, 90/100, 10_000_000);
    console.log({riskLevelUSDT});
    const riskLevelSDAI = findRiskLevelFromParameters(2.75/100, 143_000_000, 3/100, 90/100, 10_000_000_000_000_000_000);
    console.log({riskLevelSDAI});

    
    const riskLevelSDAI1B = findRiskLevelFromParameters(2.75/100, 143_000_000, 3/100, 90/100, 1_000_000_000);
    console.log({riskLevelSDAI1B});
    
    // const riskLevelsDai1BCap = findRiskLevelFromParameters(2.75/100, 100_000_000, 3/100, 90/100, 1_000_000_000);
    // console.log({riskLevelsDai1BCap});
    // const riskLevelsDAI100BCap = findRiskLevelFromParameters(2.75/100, 100_000_000, 3/100, 90/100, 100_000_000_000);
    // console.log({riskLevelsDAI100BCap});



    // const riskLevelUsdt1BCap = findRiskLevelFromParameters(9.68/100, 100_000_000, 3/100, 90/100, 1_000_000_000);
    // console.log({riskLevelUsdt1BCap});
    // const riskLevelUsdt10BCap = findRiskLevelFromParameters(9.68/100, 100_000_000, 3/100, 90/100, 10_000_000_000);
    // console.log({riskLevelUsdt10BCap});
    
    // const riskLevelsDai1BCap = findRiskLevelFromParameters(2.75/100, 100_000_000, 3/100, 90/100, 1_000_000_000);
    // console.log({riskLevelsDai1BCap});
    // const riskLevelsDAI100BCap = findRiskLevelFromParameters(2.75/100, 100_000_000, 3/100, 90/100, 100_000_000_000);
    // console.log({riskLevelsDAI100BCap});
}


function findRiskLevelFromParameters(volatility, liquidity, liquidationBonus, ltv, borrowCap) {
    const sigma = volatility;
    const d = borrowCap;
    const beta = liquidationBonus;
    const l = liquidity;

    const sigmaTimesSqrtOfD = sigma * Math.sqrt(d);
    const ltvPlusBeta = ltv + beta;
    const lnOneDividedByLtvPlusBeta = Math.log(1/ltvPlusBeta);
    const lnOneDividedByLtvPlusBetaTimesSqrtOfL = lnOneDividedByLtvPlusBeta * Math.sqrt(l);
    const r = sigmaTimesSqrtOfD / lnOneDividedByLtvPlusBetaTimesSqrtOfL;

    return r;
}

// ltvFormula();
riskLevels();
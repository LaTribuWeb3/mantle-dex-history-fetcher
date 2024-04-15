/**
 * 
 * @param {number} volatility for 15% volatility, must be 0.15
 * @param {number} liquidity in same unit as cap
 * @param {number} liquidationBonus for 8%, must be 0.08
 * @param {number} ltv for 75%, must be 0.75
 * @param {number} cap in same unit as cap
 * @returns 
 */
function findRiskLevelFromParameters(volatility, liquidity, liquidationBonus, ltv, cap) {
    const sigma = volatility;
    const d = cap;
    const beta = liquidationBonus;
    const l = liquidity;

    const sigmaTimesSqrtOfD = sigma * Math.sqrt(d);
    const ltvPlusBeta = ltv + beta;
    const lnOneDividedByLtvPlusBeta = Math.log(1 / ltvPlusBeta);
    const lnOneDividedByLtvPlusBetaTimesSqrtOfL = lnOneDividedByLtvPlusBeta * Math.sqrt(l);
    const r = sigmaTimesSqrtOfD / lnOneDividedByLtvPlusBetaTimesSqrtOfL;

    return r;
}

module.exports = {findRiskLevelFromParameters};
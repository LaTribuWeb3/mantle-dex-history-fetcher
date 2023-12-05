const { getLiquidity } = require("../src/data.interface/data.interface");

async function checkLiquidity() {
    const liquidity = getLiquidity('curve', 'LDO', 'WETH', 18_000_000, 19_000_000, true);
}

checkLiquidity();
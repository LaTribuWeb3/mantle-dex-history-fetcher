const { getLiquidity } = require('../src/data.interface/data.interface');
const fs = require('fs');

async function curveAggreg() {

    const bases = ['wstETH', 'stETH', 'USDC', 'LDO', 'CVX', 'CRV', 'WBTC', 'WETH'];
    const quotes = ['WETH', 'USDC', 'WBTC'];
    fs.writeFileSync('liquidity_with_jumps.csv', 'base,quote,liquidity 5%\n' );
    for(const base of bases) {
        for(const quote of quotes) {
            if(base == quote) continue;

            const liquidity_withjumps = getLiquidity('curve',base, quote, 18_000_000, 18_200_000, true);
            if(liquidity_withjumps) {
                const liquidity = Object.values(liquidity_withjumps)[0].slippageMap[500];
                console.log(liquidity);
                fs.appendFileSync('liquidity_with_jumps.csv', `${base},${quote},${liquidity.base}\n` );
            } else {
                console.log(`no liquidity for ${base}/${quote}`);
            }
        }
    }
}

curveAggreg();
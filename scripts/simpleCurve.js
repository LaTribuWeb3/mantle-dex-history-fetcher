const { createUnifiedFileForPair } = require('../src/curve/curve.unified.generator');

async function simpleCurve() {
    // await createUnifiedFileForPair(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
    await createUnifiedFileForPair(19_000_000, 'WBTC', 'USDC', 'tricryptoUSDCPool');
}

simpleCurve();
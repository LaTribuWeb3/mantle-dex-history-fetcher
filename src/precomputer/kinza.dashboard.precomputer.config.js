const kinzaConfig = {
    'WETH': [{
        quote: 'ezETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }, {
        quote: 'rsETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }, {
        quote: 'pufETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }, {
        quote: 'wstETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }],
    'ezETH': [{
        quote: 'WETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }],
    'rsETH': [{
        quote: 'WETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }],
    'pufETH': [{
        quote: 'WETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }],
    'wstETH': [{
        quote: 'WETH',
        ltv: 0.75,
        liquidationBonusBPS: 800,
        supplyCap: 10_000,
        borrowCap: 10_000
    }]
};

module.exports = { kinzaConfig };
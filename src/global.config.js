const tokens = {
    'WETH': {
        'symbol': 'WETH',
        'decimals': 18,
        'address': '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111',
        'dustAmount': 0.0001
    },
    'mETH': {
        'symbol': 'mETH',
        'decimals': 18,
        'address': '0xcDA86A272531e8640cD7F1a92c01839911B90bb0',
        'dustAmount': 0.0001
    },
    'WMNT': {
        'symbol': 'WMNT',
        'decimals': 18,
        'address': '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
        'dustAmount': 0.01
    },
    'USDT': {
        'symbol': 'USDT',
        'decimals': 6,
        'address': '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE',
        'dustAmount': 0.01
    },
    'USDC': {
        'symbol': 'USDC',
        'decimals': 6,
        'address': '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
        'dustAmount': 0.01
    },
    'USDY': {
        'symbol': 'USDY',
        'decimals': 18,
        'address': '0x5bE26527e817998A7206475496fDE1E68957c5A6',
        'dustAmount': 0.01
    },
    'axlETH': {
        'symbol': 'axlETH',
        'decimals': 18,
        'address': '0xb829b68f57CC546dA7E5806A929e53bE32a4625D',
        'dustAmount': 0.0001
    },
    'axlUSDC': {
        'symbol': 'axlUSDC',
        'decimals': 6,
        'address': '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
        'dustAmount': 0.01
    },
    'USDe': {
        'symbol': 'USDe',
        'decimals': 6,
        'address': '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
        'dustAmount': 0.01
    },
    'WBTC': {
        'symbol': 'WBTC',
        'decimals': 8,
        'address': '0xCAbAE6f6Ea1ecaB08Ad02fE02ce9A44F09aebfA2',
        'dustAmount': 0.01
    }
};

// goes both ways
const watchedPairs = {
    'USDT': [
        {
            quote: 'USDC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WMNT',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'mETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'USDC': [
        {
            quote: 'WMNT',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'mETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'WMNT': [
        {
            quote: 'mETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'mETH': [
        {
            quote: 'WETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'WETH': [
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'WBTC': [
        {
            quote: 'USDe',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: true
        }
    ],
    'USDe': [
        {
            quote: 'USDY',
            pivots: undefined,
            exportToInternalDashboard: false
        }
    ],
};

const tsWatchPairs = [];
for(const [base, quotes] of Object.entries(watchedPairs)) {
    tsWatchPairs.push({
        base: base,
        quotes: quotes
    });
}
// console.log(JSON.stringify(tsWatchPairs, null, 2));

function GetPairToUse(from, to) {
    let actualFrom = from;
    let actualTo = to;

    if(from == 'sDAI') {
        actualFrom = 'DAI';
    }
    if(to == 'sDAI') {
        actualTo = 'DAI';
    }

    return {actualFrom, actualTo};
}


const newAssetsForMinVolatility = [];

const specificPivotsOverride = {
    'WBTC/*': [ 'mETH', 'USDT', 'WETH', 'USDC', 'WBTC'],
    // 'pufETH/*': ['wstETH', 'WETH', 'WBTC', 'USDC', 'USDT', 'DAI'], // for pufETH, need to add wstETH as pivot
    // '*/pufETH': ['WETH', 'wstETH', 'WBTC', 'USDC', 'USDT', 'DAI'], // for pufETH, need to add wstETH as pivot
    // 'DAI/*': ['USDC', 'USDT', 'DAI', 'WETH' , 'WBTC'], // for DAI, starting with stable coin boost liquidity
};

module.exports = { tokens, watchedPairs, GetPairToUse, newAssetsForMinVolatility, specificPivotsOverride };

const pairsToCompute = {
    'WETH': [
        'USDC',
        'WBTC'
    ],
    'DAI': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'MANA': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'MKR': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'SNX': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'sUSD': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'UNI': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'USDC': [
        'WETH',
        'WBTC'
    ],
    'USDT': [
        'WETH',
        'USDC',
        'WBTC'
    ],
    'WBTC': [
        'USDC',
        'WETH'
    ]
};

const dashboardPairsToCompute = [
    {
        base: 'wstETH',
        quote: 'WETH',
    },
    {
        base: 'stETH',
        quote: 'WETH',
    },
    {
        base: 'USDC',
        quote: 'WETH',
    },
    {
        base: 'WETH',
        quote: 'USDC',
    },
    {
        base: 'HarryPotterObamaSonic10Inu',
        quote: 'WETH'
    },
    {
        base: 'PEPE',
        quote: 'WETH'
    },
    {
        base: 'BLUR',
        quote: 'WETH'
    },
    {
        base: 'SHIB',
        quote: 'WETH'
    },
    {
        base: 'MKR',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'UNI',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'LINK',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'LDO',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'RPL',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'CRV',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'APE',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'CVX',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'FXS',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'USDC',
        quote: 'COMP',
        volatilityPivot: 'WETH',
    },
    {
        base: 'COMP',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'USDC',
        quote: 'WBTC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'WBTC',
        quote: 'USDC',
        volatilityPivot: 'WETH',
    },
    {
        base: 'USDC',
        quote: 'UNI',
        volatilityPivot: 'WETH',
    },
    {
        base: 'USDC',
        quote: 'LINK',
        volatilityPivot: 'WETH',
    },
    {
        base: 'WETH',
        quote: 'cbETH',
    },
    {
        base: 'WETH',
        quote: 'wstETH',
    },
];

module.exports = { pairsToCompute, dashboardPairsToCompute };
const tokens = {
    ETH: {
        decimals: 18,
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        dustAmount: 0.0001
    },
    WETH: {
        decimals: 18,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        dustAmount: 0.0001
    },
    WEETH: {
        decimals: 18,
        address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
        dustAmount: 0.0001
    },
    USDC: {
        decimals: 6,
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        dustAmount: 0.1
    },
    WBTC: {
        decimals: 8,
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        dustAmount: 0.00001
    },
    DAI: {
        decimals: 18,
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        dustAmount: 0.1
    },
    sDAI: {
        decimals: 18,
        address: '0x83F20F44975D03b1b09e64809B757c47f942BEeA',
        dustAmount: 0.1
    },
    BUSD: {
        decimals: 18,
        address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
        dustAmount: 0.1
    },
    MANA: {
        decimals: 18,
        address: '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',
        dustAmount: 0.1
    },
    LINK: {
        decimals: 18,
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        dustAmount: 0.01
    },
    MKR: {
        decimals: 18,
        address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
        dustAmount: 0.0001
    },
    SNX: {
        decimals: 18,
        address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
        dustAmount: 0.1
    },
    sUSD: {
        decimals: 18,
        address: '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51',
        dustAmount: 0.1
    },
    UNI: {
        decimals: 18,
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        dustAmount: 0.01
    },
    USDT: {
        decimals: 6,
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        dustAmount: 0.1
    },
    YFI: {
        decimals: 18,
        address: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
        dustAmount: 0.0001
    },
    ZRX: {
        decimals: 18,
        address: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
        dustAmount: 0.1
    },
    FRAX: {
        decimals: 18,
        address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
        dustAmount: 0.1
    },
    BAL: {
        decimals: 18,
        address: '0xba100000625a3754423978a60c9317c58a424e3D',
        dustAmount: 0.1
    },
    CRV: {
        decimals: 18,
        address: '0xD533a949740bb3306d119CC777fa900bA034cd52',
        dustAmount: 0.1
    },
    CVX: {
        decimals: 18,
        address: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
        dustAmount: 0.1
    },
    BADGER: {
        decimals: 18,
        address: '0x3472A5A71965499acd81997a54BBA8D852C6E53d',
        dustAmount: 0.1
    },
    LDO: {
        decimals: 18,
        address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
        dustAmount: 0.1
    },
    ALCX: {
        decimals: 18,
        address: '0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF',
        dustAmount: 0.1
    },
    '1INCH': {
        decimals: 18,
        address: '0x111111111117dC0aa78b770fA6A738034120C302',
        dustAmount: 0.1
    },
    stETH: {
        decimals: 18,
        address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
        dustAmount: 0.0001
    },
    rETH: {
        decimals: 18,
        address: '0xae78736Cd615f374D3085123A210448E74Fc6393',
        dustAmount: 0.0001
    },
    '3Crv': {
        decimals: 18,
        address: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
        dustAmount: 0.1
    },
    crvFRAX: {
        decimals: 18,
        address: '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC',
        dustAmount: 0.1
    },
    LUSD: {
        decimals: 18,
        address: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
        dustAmount: 0.1
    },
    sGNO: {
        decimals: 18,
        address: '0xA4eF9Da5BA71Cc0D2e5E877a910A37eC43420445',
        dustAmount: 0.1
    },
    GNO: {
        decimals: 18,
        address: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
        dustAmount: 0.1
    },
    COMP: {
        decimals: 18,
        address: '0xc00e94cb662c3520282e6f5717214004a7f26888',
        dustAmount: 0.1
    },
    BAT: {
        decimals: 18,
        address: '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
        dustAmount: 0.1
    },
    TUSD: {
        decimals: 18,
        address: '0x0000000000085d4780B73119b644AE5ecd22b376',
        dustAmount: 0.1
    },
    SUSHI: {
        decimals: 18,
        address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
        dustAmount: 0.1
    },
    AAVE: {
        decimals: 18,
        address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
        dustAmount: 0.1
    },
    USDP: {
        decimals: 18,
        address: '0x8E870D67F660D95d5be530380D0eC0bd388289E1',
        dustAmount: 0.1
    },
    FEI: {
        decimals: 18,
        address: '0x956F47F50A910163D8BF957Cf5846D573E7f87CA',
        dustAmount: 0.1
    },
    cbETH: {
        decimals: 18,
        address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
        dustAmount: 0.0001
    },
    wstETH: {
        decimals: 18,
        address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        dustAmount: 0.0001
    },
    HarryPotterObamaSonic10Inu: {
        decimals: 8,
        address: '0x72e4f9F808C49A2a61dE9C5896298920Dc4EEEa9',
        dustAmount: 1
    },
    PEPE: {
        decimals: 18,
        address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
        dustAmount: 10000
    },
    BLUR: {
        decimals: 18,
        address: '0x5283d291dbcf85356a21ba090e6db59121208b44',
        dustAmount: 1
    },
    SHIB: {
        decimals: 18,
        address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
        dustAmount: 10000
    },
    RPL: {
        decimals: 18,
        address: '0xD33526068D116cE69F19A9ee46F0bd304F21A51f',
        dustAmount: 0.1
    },
    APE: {
        decimals: 18,
        address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381',
        dustAmount: 0.1
    },
    FXS: {
        decimals: 18,
        address: '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0',
        dustAmount: 0.1
    },
    rsETH: {
        decimals: 18,
        address: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
        dustAmount: 0.001
    },
    pufETH: {
        decimals: 18,
        address: '0xD9A442856C234a39a81a089C06451EBAa4306a72',
        dustAmount: 0.001
    },
    ezETH: {
        decimals: 18,
        address: '0xbf5495Efe5DB9ce00f80364C8B423567e58d2110',
        dustAmount: 0.001
    },
};

const specificPivotsOverride = {
    'pufETH': ['wstETH', 'WETH', 'WBTC', 'USDT', 'USDC', 'DAI']
};

// goes both ways
const watchedPairs = {
    'WETH': [
        {
            quote: 'rETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'wstETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'stETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'USDC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'PEPE',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'BLUR',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'SHIB',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'HarryPotterObamaSonic10Inu',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'cbETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'DAI',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'MANA',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'MKR',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'SNX',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'sUSD',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'UNI',
            pivots: undefined,
            exportToInternalDashboard: false
        },
        {
            quote: 'USDT',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'sDAI',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'rsETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'ezETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'pufETH',
            pivots: undefined,
            exportToInternalDashboard: true
        },
    ],
    'USDC': [
        {
            quote: 'rETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'MKR',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'LINK',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'UNI',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'LDO',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'RPL',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'APE',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'CVX',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'FXS',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'COMP',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WBTC',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'CRV',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'DAI',
            pivots: undefined,
            pivotsSpecific: {
                'sushiswapv2': ['WETH']
            },
            exportToInternalDashboard: true
        },
        {
            quote: 'sDAI',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'MANA',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'SNX',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'sUSD',
            pivots: undefined,
            pivotsSpecific: {
                'uniswapv2': ['WETH']
            },
            exportToInternalDashboard: false
        },
        {
            quote: 'USDT',
            pivots: undefined,
            pivotsSpecific: {
                'sushiswapv2': ['WETH']
            },
            exportToInternalDashboard: true
        },
        {
            quote: 'wstETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote:'stETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote:'cbETH',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'rsETH',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'ezETH',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'pufETH',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
    ],
    'WBTC': [
        {
            quote: 'DAI',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'MANA',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'MKR',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'SNX',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'sUSD',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'UNI',
            pivots: ['WETH'],
            exportToInternalDashboard: false
        },
        {
            quote: 'USDT',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'wstETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'rETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
    ],
    'USDT': [
        {
            quote: 'wstETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'DAI',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'sDAI',
            pivots: undefined,
            exportToInternalDashboard: true
        },
        {
            quote: 'rETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
    ],
    'wstETH': [
        {
            quote: 'rsETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'ezETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'pufETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'DAI',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'rETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
    ],
    'DAI': [
        {
            quote: 'rETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
    ],
    'rETH': [
        {
            quote: 'WEETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        },
        {
            quote: 'rsETH',
            pivots: ['WETH'],
            exportToInternalDashboard: true
        }
    ]
};


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


const newAssetsForMinVolatility = [ 'ezETH', 'pufETH', 'rsETH' ];

module.exports = { tokens, watchedPairs, GetPairToUse, newAssetsForMinVolatility, specificPivotsOverride };
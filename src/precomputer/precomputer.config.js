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


const riskDataConfig = [
    {
        base: 'DAI',
        quote: 'USDC'
    },
    {
        base: 'USDT',
        quote: 'USDC'
    },
];

const riskDataTestNetConfig = {
    DAI: {
        substitute: 'SDAI',
        address: '0xD8134205b0328F5676aaeFb3B2a0DC15f4029d8C',
        decimals:18,
    },
    USDT: {
        substitute: 'USDT',
        address: '0x576e379FA7B899b4De1E251e935B31543Df3e954',
        decimals:6,

    },
    USDC: {
        substitute: 'USDC',
        address: '0x62bD2A599664D421132d7C54AB4DbE3233f4f0Ae',
        decimals: 6,
    }
};
/**
 * get a token configuration object searching by symbol but for the risk data testnet.
 * @param {string} symbol 
 * @returns {{symbol: string, decimals: number, address: string, dustAmount: number}} token configuration
 */
function getStagingConfTokenBySymbol(symbol) {
    const tokenConf = riskDataTestNetConfig[symbol];
    if (!tokenConf) {
        throw new Error(`Cannot find token with symbol ${symbol}`);
    }
    // add symbol to config
    tokenConf.symbol = symbol;
    return tokenConf;
}

module.exports = { pairsToCompute, riskDataConfig, riskDataTestNetConfig, getStagingConfTokenBySymbol };
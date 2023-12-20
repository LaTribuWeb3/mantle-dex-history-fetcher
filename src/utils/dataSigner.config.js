const { BN_1e18, BN_1e6 } = require("./constants");

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

function getStagingConfTokenBySymbol(symbol) {
    const tokenConf = riskDataTestNetConfig[symbol];
    if(!tokenConf) {
        throw new Error(`Cannot find token with symbol ${symbol}`);
    }
    // add symbol to config
    tokenConf.symbol = symbol;
    return tokenConf;
}

module.exports = {
    riskDataConfig, riskDataTestNetConfig, getStagingConfTokenBySymbol
};
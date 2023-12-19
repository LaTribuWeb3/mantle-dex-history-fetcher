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
        address: '0xD8134205b0328F5676aaeFb3B2a0DC15f4029d8C'
    },
    USDT: {
        substitute: 'USDT',
        address: '0x576e379FA7B899b4De1E251e935B31543Df3e954'
    },
    USDC: {
        address: '0x62bD2A599664D421132d7C54AB4DbE3233f4f0Ae'
    }
}

module.exports = {
    riskDataConfig, riskDataTestNetConfig
};
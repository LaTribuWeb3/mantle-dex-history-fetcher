function morphoMarketTranslator(string) {
    if (string.toLowerCase().startsWith('0x')) {
        const marketToTokenMap = {
            '0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41': 'wsETH',
        };
        return marketToTokenMap[string];
    }
    else {
        const tokenToMarketMap = {
            'wstETH-WETH': '0xc54d7acf14de29e0e5527cabd7a576506870346a78a11a6762e2cca66322ec41',
        };
        return tokenToMarketMap[string];
    }
}

module.exports = { morphoMarketTranslator };
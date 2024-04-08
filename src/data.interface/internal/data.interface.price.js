// price related functions
const { readMedianPricesFileAtBlock, readMedianPricesFile } = require('./data.interface.utils');

function getPrices(platform, fromSymbol, toSymbol, fromBlock = undefined, toBlock = undefined) {
    return readMedianPricesFile(platform, fromSymbol, toSymbol, fromBlock, toBlock);
}

function getPriceAtBlock(platform, fromSymbol, toSymbol, block) {
    return readMedianPricesFileAtBlock(platform, fromSymbol, toSymbol, block);
}


module.exports = { getPriceAtBlock, getPrices };
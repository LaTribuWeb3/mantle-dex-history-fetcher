// price related functions
const { readMedianPricesFile } = require('./data.interface.utils');

function getPrices(platform, fromSymbol, toSymbol, fromBlock = undefined, toBlock = undefined) {
    return readMedianPricesFile(platform, fromSymbol, toSymbol, fromBlock, toBlock);
}


module.exports = { getPrices };
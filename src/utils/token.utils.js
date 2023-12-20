const { BigNumber, utils } = require('ethers');
const { tokens } = require('../global.config');
const { riskDataTestNetConfig } = require('./dataSigner.config');

/**
 * Normalize a integer value to a number
 * @param {string | BigNumber} amount 
 * @param {number} decimals 
 * @returns {number} normalized number for the decimals in inputs
 */
function normalize(amount, decimals) {
    if (decimals === 18) {
        return Number(utils.formatEther(amount));
    }
    else if (decimals > 18) {
        const factor = BigNumber.from('10').pow(BigNumber.from(decimals - 18));
        const norm = BigNumber.from(amount.toString()).div(factor);
        return Number(utils.formatEther(norm));
    } else {
        const factor = BigNumber.from('10').pow(BigNumber.from(18 - decimals));
        const norm = BigNumber.from(amount.toString()).mul(factor);
        return Number(utils.formatEther(norm));
    }
}

/**
 * get a token configuration object searching by symbol
 * @param {string} symbol 
 * @returns {{symbol: string, decimals: number, address: string, dustAmount: number}} token configuration
 */
function getConfTokenBySymbol(symbol) {
    const tokenConf = tokens[symbol];
    if (!tokenConf) {
        throw new Error(`Cannot find token with symbol ${symbol}`);
    }
    // add symbol to config
    tokenConf.symbol = symbol;
    return tokenConf;
}

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

/**
 * Get a token symbol from the configuration, searching by address
 * @param {string} address 
 * @returns {string} token symbol
 */
function getTokenSymbolByAddress(address) {
    for (let [tokenSymbol, tokenConf] of Object.entries(tokens)) {
        if (tokenConf.address.toLowerCase() == address.toLowerCase()) {
            return tokenSymbol;
        }
    }

    return null;
}
/**
 * Return the big number appropriate for the number of decimals
 * @param {number} decimals 
 * @returns big number
 * */
function getDecimalFactorAsBN(decimals) {
    if (typeof (decimals) === Number) {
        return new BigNumber(10).pow(decimals);
    }
    throw(error){
        console.log('get Decimals as BN only accepts numbers as parameter')
    }

}

module.exports = { normalize, getTokenSymbolByAddress, getDecimalFactorAsBN, getConfTokenBySymbol, getStagingConfTokenBySymbol };
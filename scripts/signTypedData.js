// Import necessary modules and constants
const BigNumber = require('bignumber.js').default;
const { getDecimalFactorAsBN } = require('../src/utils/token.utils');
const { ethers } = require('ethers');
const { BN_1e18 } = require('../src/utils/constants');

// Function to sign data using a private key
async function signData(typedData) {
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if(!privateKey){
        throw new Error('No private key in env config');
    }
    const wallet = new ethers.Wallet(privateKey);
    return await wallet._signTypedData(typedData.domain, typedData.types, typedData.value);
}



/**
 * Function to generate typed data for Ethereum EIP-712 signature
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} baseTokenConf 
 * @param {{symbol: string, decimals: number, address: string, dustAmount: number}} quoteTokenConf 
 * @param {number} liquidity 
 * @param {number} volatility 
 * @param {boolean} isStaging 
 * @returns typed data
 */
function generateTypedData(baseTokenConf, quoteTokenConf, liquidity, volatility, isStaging) {
    // Convert values to 18 decimals and create typed data structure
    const volatility18Decimals = new BigNumber(volatility).times(BN_1e18).toFixed(0);
    const pythiaAddress = process.env.PYTHIA_ADDRESS;
    if(!pythiaAddress){
        throw new Error('No pythia address in env config');
    }
    const liquidityAdjustedToDecimalsFactor = new BigNumber(liquidity).times(new BigNumber(10).pow(quoteTokenConf.decimals)).toFixed(0);

    return {
        types: {
            RiskData: [
                { name: 'collateralAsset', type: 'address' },
                { name: 'debtAsset', type: 'address' },
                { name: 'liquidity', type: 'uint256' },
                { name: 'volatility', type: 'uint256' },
                { name: 'lastUpdate', type: 'uint256' },
                { name: 'chainId', type: 'uint256' },
            ],
        },
        primaryType: 'RiskData',
        domain: {
            name: 'SPythia',
            version: '0.0.1',
            chainId: isStaging ? 5 : 1,
            verifyingContract: pythiaAddress,
        },
        value: {
            collateralAsset: baseTokenConf.address,
            debtAsset: quoteTokenConf.address,
            liquidity: String(liquidityAdjustedToDecimalsFactor), // cast just for typing
            volatility: String(volatility18Decimals), // cast just for typing
            lastUpdate: Math.round(Date.now() / 1000),
            chainId: isStaging ? 5 : 1,
        },
    };
}

module.exports = {
    signData, generateTypedData
};

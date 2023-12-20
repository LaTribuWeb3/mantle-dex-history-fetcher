// Required modules and constants
const BigNumber = require('bignumber.js').default;
const { getRollingVolatility, getLiquidity } = require('../src/data.interface/data.interface');
const { getConfTokenBySymbol } = require('../src/utils/token.utils');
const { ethers } = require('ethers');
const { BN_1e18, MORPHO_RISK_PARAMETERS_ARRAY } = require('../src/utils/constants');
const { PLATFORMS } = require('../src/utils/constants');
const { fnName } = require('../src/utils/utils');
const { getBlocknumberForTimestamp } = require('../src/utils/web3.utils');
const { getStagingConfTokenBySymbol } = require('../src/utils/dataSigner.config');

// Calculate averages of slippage data across multiple platforms
function calculateSlippageBaseAverages(allPlatformsLiquidity) {
    const totals = {};

    for (const blockData of Object.values(allPlatformsLiquidity)) {
        for (const [slippageKey, slippageData] of Object.entries(blockData.slippageMap)) {
            const key = parseInt(slippageKey, 10);

            // Initialize key if not present
            if (!totals[key]) {
                totals[key] = { sum: 0, count: 0 };
            }

            // Sum and count for each slippage data point
            totals[key].sum += slippageData.base;
            totals[key].count++;
        }
    }

    // Compute and return averages
    return Object.keys(totals).reduce((averages, key) => {
        averages[key] = totals[key].count > 0 ? totals[key].sum / totals[key].count : 0;
        return averages;
    }, {});
}

// Function to sign typed data for Ethereum transactions
async function signTypedData(baseToken = 'WETH', quoteToken = 'USDC', IS_STAGING= false) {
    // Configure Ethereum providers and token data
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    const base = IS_STAGING ? getStagingConfTokenBySymbol(baseToken) : getConfTokenBySymbol(baseToken);
    const quote = IS_STAGING ? getStagingConfTokenBySymbol(quoteToken) : getConfTokenBySymbol(quoteToken);

    // Determine start and current block numbers
    const startDate = Date.now();
    const startBlock = await getBlocknumberForTimestamp(Math.round(startDate / 1000) - 30 * 24 * 60 * 60);
    const currentBlock = (await web3Provider.getBlockNumber()) - 100;

    console.log(`${fnName()}: precomputing for pair ${base.symbol}/${quote.symbol}`);
    let allPlatformsLiquidity;

    // Collect liquidity data from various platforms
    for (const platform of PLATFORMS) {
        console.log(`${fnName()}[${base.symbol}/${quote.symbol}]: precomputing for platform ${platform}`);
        const platformLiquidity = getLiquidity(platform, base.symbol, quote.symbol, startBlock, currentBlock, true);

        // Accumulate liquidity data
        if (platformLiquidity) {
            if (!allPlatformsLiquidity) {
                allPlatformsLiquidity = platformLiquidity;
            } else {
                for (const block of Object.keys(allPlatformsLiquidity)) {
                    for (const slippageBps of Object.keys(allPlatformsLiquidity[block].slippageMap)) {
                        allPlatformsLiquidity[block].slippageMap[slippageBps].base += platformLiquidity[block].slippageMap[slippageBps].base;
                        allPlatformsLiquidity[block].slippageMap[slippageBps].quote += platformLiquidity[block].slippageMap[slippageBps].quote;
                    }
                }
            }
        } else {
            console.log(`no liquidity data for ${platform} ${base.symbol} ${quote.symbol}`);
        }
    }

    // Calculate averaged liquidity and fetch volatility data
    const averagedLiquidity = calculateSlippageBaseAverages(allPlatformsLiquidity);
    const volatilityData = await getRollingVolatility('all', base.symbol, quote.symbol, web3Provider);

    const finalArray = [];
    for (const parameter of MORPHO_RISK_PARAMETERS_ARRAY) {
        const liquidity = averagedLiquidity[parameter.bonus];
        const volatility = volatilityData.latest.current;
        // Generate typed data for signing
        const typedData = generatedTypedData(base, quote, liquidity, volatility);
        // Sign the data using a private key
        const privateKey = '0x0123456789012345678901234561890123456789012345678901234567890123';
        const wallet = new ethers.Wallet(privateKey);
        const signature = await wallet._signTypedData(typedData.domain, typedData.types, typedData.value);
        const splitSig = ethers.utils.splitSignature(signature);

        // Output the signature components
        const toPush = {
            r: splitSig.r,
            s: splitSig.s,
            v: splitSig.v,
            liquidationBonus: parameter.bonus,
            riskData: typedData.value,
        };

        finalArray.push(toPush);
    }
    return finalArray;
}

// Function to generate typed data for Ethereum EIP-712 signature
/**
 * 
 * @param  {{symbol: string, decimals: number, address: string, dustAmount: number}} baseTokenConf 
 * @param  {{symbol: string, decimals: number, address: string, dustAmount: number}} quoteTokenConf 
 * @param {number} liquidity 
 * @param {number} volatility 
 * @returns 
 */
function generatedTypedData(baseTokenConf, quoteTokenConf, liquidity, volatility) {
    // Convert values to 18 decimals and create typed data structure
    const volatility18Decimals = new BigNumber(volatility).times(BN_1e18).toFixed(0);
    const liquidity18Decimals = new BigNumber(liquidity).times(BN_1e18).toFixed(0);

    const typedData = {
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
            chainId: 5,
            verifyingContract: '0xa9aCE3794Ed9556f4C91e1dD325bC5e4AB1CCDE7',
        },
        value: {
            collateralAsset: baseTokenConf.address,
            debtAsset: quoteTokenConf.address,
            liquidity: liquidity18Decimals,
            volatility: volatility18Decimals,
            lastUpdate: Math.round(Date.now() / 1000),
            chainId: 5,
        },
    };

    return typedData;
}

module.exports = {
    signTypedData
};
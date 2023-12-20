// Import necessary modules and constants
const BigNumber = require('bignumber.js').default;
const { getRollingVolatility, getLiquidity } = require('../src/data.interface/data.interface');
const { getConfTokenBySymbol, getStagingConfTokenBySymbol, getDecimalsAsBN, getDecimalFactorAsBN } = require('../src/utils/token.utils');
const { ethers } = require('ethers');
const { BN_1e18, MORPHO_RISK_PARAMETERS_ARRAY, PLATFORMS } = require('../src/utils/constants');
const { fnName } = require('../src/utils/utils');
const { getBlocknumberForTimestamp } = require('../src/utils/web3.utils');

// Function to calculate averages of slippage data across multiple platforms
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
async function signTypedData(baseToken = 'WETH', quoteToken = 'USDC', isStaging = false) {
    // Configure Ethereum providers and token data
    const web3Provider = new ethers.providers.StaticJsonRpcProvider('https://eth.llamarpc.com');
    const base = isStaging ? getStagingConfTokenBySymbol(baseToken) : getConfTokenBySymbol(baseToken);
    const quote = isStaging ? getStagingConfTokenBySymbol(quoteToken) : getConfTokenBySymbol(quoteToken);

    // Determine start and current block numbers
    const startDate = Date.now();
    const startBlock = await getBlocknumberForTimestamp(Math.round(startDate / 1000) - 30 * 24 * 60 * 60);
    const currentBlock = (await web3Provider.getBlockNumber()) - 100;

    console.log(`${fnName()}: precomputing for pair ${base.symbol}/${quote.symbol}`);
    let allPlatformsLiquidity = {};

    // Collect liquidity data from various platforms
    for (const platform of PLATFORMS) {
        const platformLiquidity = await getLiquidity(platform, base.symbol, quote.symbol, startBlock, currentBlock, true);
        if (platformLiquidity) {
            mergePlatformLiquidity(allPlatformsLiquidity, platformLiquidity);
        } else {
            console.log(`No liquidity data for ${platform} ${base.symbol} ${quote.symbol}`);
        }
    }

    // Calculate averaged liquidity and fetch volatility data
    const averagedLiquidity = calculateSlippageBaseAverages(allPlatformsLiquidity);
    const volatilityData = await getRollingVolatility('all', base.symbol, quote.symbol, web3Provider);

    return generateAndSignRiskData(averagedLiquidity, volatilityData, base, quote, isStaging);
}

// Function to merge platform liquidity into the allPlatformsLiquidity object
function mergePlatformLiquidity(allPlatformsLiquidity, platformLiquidity) {
    for (const block of Object.keys(platformLiquidity)) {
        if (!allPlatformsLiquidity[block]) {
            allPlatformsLiquidity[block] = platformLiquidity[block];
        } else {
            for (const slippageBps of Object.keys(platformLiquidity[block].slippageMap)) {
                if (!allPlatformsLiquidity[block].slippageMap[slippageBps]) {
                    allPlatformsLiquidity[block].slippageMap[slippageBps] = platformLiquidity[block].slippageMap[slippageBps];
                } else {
                    allPlatformsLiquidity[block].slippageMap[slippageBps].base += platformLiquidity[block].slippageMap[slippageBps].base;
                    allPlatformsLiquidity[block].slippageMap[slippageBps].quote += platformLiquidity[block].slippageMap[slippageBps].quote;
                }
            }
        }
    }
}

// Function to generate and sign risk data
async function generateAndSignRiskData(averagedLiquidity, volatilityData, baseTokenConf, quoteTokenConf, isStaging) {
    const finalArray = [];

    for (const parameter of MORPHO_RISK_PARAMETERS_ARRAY) {
        const liquidity = averagedLiquidity[parameter.bonus];
        const volatility = volatilityData.latest.current;

        // Generate typed data for signing
        const typedData = generateTypedData(baseTokenConf, quoteTokenConf, liquidity, volatility, isStaging);
        const signature = await signData(typedData);

        // Output the signature components
        finalArray.push({
            ...ethers.utils.splitSignature(signature),
            liquidationBonus: parameter.bonus,
            riskData: typedData.value,
        });
    }

    return finalArray;
}

// Function to sign data using a private key
async function signData(typedData) {
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if(!privateKey){
        throw new Error('No private key in env config');
    }
    const wallet = new ethers.Wallet(privateKey);
    return wallet._signTypedData(typedData.domain, typedData.types, typedData.value);
}

// Function to generate typed data for Ethereum EIP-712 signature
function generateTypedData(baseTokenConf, quoteTokenConf, liquidity, volatility, isStaging) {
    // Convert values to 18 decimals and create typed data structure
    const volatility18Decimals = new BigNumber(volatility).times(BN_1e18).toFixed(0);
    const pythiaAddress = process.env.PYTHIA_ADDRESS;
    if(!pythiaAddress){
        throw new Error('No pythia address in env config');
    }
    const liquidityAdjustedToDecimalsFactor = new BigNumber(liquidity).times(getDecimalFactorAsBN(quoteTokenConf.decimals)).toFixed(0);

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
            liquidity: liquidityAdjustedToDecimalsFactor,
            volatility: volatility18Decimals,
            lastUpdate: Math.round(Date.now() / 1000),
            chainId: isStaging ? 5 : 1,
        },
    };
}

module.exports = {
    signTypedData
};

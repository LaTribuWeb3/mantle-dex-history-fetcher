const { default: BigNumber } = require('bignumber.js');
const {
    getRollingVolatility,
    getLiquidity,
} = require('../src/data.interface/data.interface');
const { getConfTokenBySymbol } = require('../src/utils/token.utils');
const { ethers } = require('ethers');
const { BN_1e18 } = require('../src/utils/constants');
const { DATA_DIR, PLATFORMS } = require('../src/utils/constants');
const { fnName } = require('../src/utils/utils');
const { getBlocknumberForTimestamp } = require('../src/utils/web3.utils');

// eslint-disable-next-line quotes
const SPythiaAbi = [
    { inputs: [], stateMutability: 'nonpayable', type: 'constructor' }, {
        inputs: [],
        name: 'DOMAIN_SEPARATOR',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'EIP712DOMAIN_TYPEHASH',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'RISKDATA_TYPEHASH',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'chainId',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { internalType: 'address', name: 'collateralAsset', type: 'address' },
                    { internalType: 'address', name: 'debtAsset', type: 'address' },
                    { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
                    { internalType: 'uint256', name: 'volatility', type: 'uint256' },
                    { internalType: 'uint256', name: 'lastUpdate', type: 'uint256' },
                    { internalType: 'uint256', name: 'chainId', type: 'uint256' },
                ],
                internalType: 'struct SPythia.RiskData',
                name: 'data',
                type: 'tuple',
            },
            { internalType: 'uint8', name: 'v', type: 'uint8' },
            { internalType: 'bytes32', name: 'r', type: 'bytes32' },
            { internalType: 'bytes32', name: 's', type: 'bytes32' },
        ],
        name: 'getSigner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { internalType: 'address', name: 'collateralAsset', type: 'address' },
                    { internalType: 'address', name: 'debtAsset', type: 'address' },
                    { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
                    { internalType: 'uint256', name: 'volatility', type: 'uint256' },
                    { internalType: 'uint256', name: 'lastUpdate', type: 'uint256' },
                    { internalType: 'uint256', name: 'chainId', type: 'uint256' },
                ],
                internalType: 'struct SPythia.RiskData',
                name: 'data',
                type: 'tuple',
            },
        ],
        name: 'hashStruct',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { internalType: 'string', name: 'name', type: 'string' },
                    { internalType: 'string', name: 'version', type: 'string' },
                    { internalType: 'uint256', name: 'chainId', type: 'uint256' },
                    {
                        internalType: 'address',
                        name: 'verifyingContract',
                        type: 'address',
                    },
                ],
                internalType: 'struct SPythia.EIP712Domain',
                name: 'eip712Domain',
                type: 'tuple',
            },
        ],
        name: 'hashStruct',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function',
    },
];
function calculateSlippageBaseAverages(allPlatformsLiquidity) {
    const totals = {};

    // Iterate over each block data in the allPlatformsLiquidity object.
    for (const blockData of Object.values(allPlatformsLiquidity)) {
        // Iterate over each slippage key-value pair in the slippage map of the current block data.
        for (const [slippageKey, slippageData] of Object.entries(blockData.slippageMap)) {
            const key = parseInt(slippageKey, 10);

            if (!totals[key]) {
                totals[key] = { sum: 0, count: 0 };
            }
            totals[key].sum += slippageData.base;
            totals[key].count++;
        }
    }

    // Calculate and return the averages.
    return Object.keys(totals).reduce((averages, key) => {
        averages[key] = totals[key].count > 0 ? totals[key].sum / totals[key].count : 0;
        return averages;
    }, {});
}



async function signTypedData(baseToken='WETH', quoteToken='USDC') {
    const web3Provider = new ethers.providers.StaticJsonRpcProvider(
        'https://eth.llamarpc.com'
    );
    const base = getConfTokenBySymbol(baseToken);
    const quote = getConfTokenBySymbol(quoteToken);

    const startDate = Date.now();
    const startBlock = await getBlocknumberForTimestamp(
        Math.round(startDate / 1000) - 30 * 24 * 60 * 60
    );
    const currentBlock = (await web3Provider.getBlockNumber()) - 100;

    console.log(
        `${fnName()}: precomputing for pair ${base.symbol}/${quote.symbol}`
    );
    let allPlatformsLiquidity = undefined;
    for (const platform of PLATFORMS) {
        console.log(
            `${fnName()}[${base.symbol}/${
                quote.symbol
            }]: precomputing for platform ${platform}`
        );
        // get the liquidity since startBlock - avgStep because, for the first block (= startBlock), we will compute the avg liquidity and volatility also
        const platformLiquidity = getLiquidity(
            platform,
            base.symbol,
            quote.symbol,
            startBlock,
            currentBlock,
            true
        );
        if (platformLiquidity) {
            if (!allPlatformsLiquidity) {
                allPlatformsLiquidity = platformLiquidity;
            } else {
                // sum liquidity
                for (const block of Object.keys(allPlatformsLiquidity)) {
                    for (const slippageBps of Object.keys(
                        allPlatformsLiquidity[block].slippageMap
                    )) {
                        allPlatformsLiquidity[block].slippageMap[slippageBps].base +=
              platformLiquidity[block].slippageMap[slippageBps].base;
                        allPlatformsLiquidity[block].slippageMap[slippageBps].quote +=
              platformLiquidity[block].slippageMap[slippageBps].quote;
                    }
                }
            }
        } else {
            console.log(
                `no liquidity data for ${platform} ${base.symbol} ${quote.symbol}`
            );
        }
    }

    const averagedLiquidity = calculateSlippageBaseAverages(allPlatformsLiquidity);

    const volatilityData = await getRollingVolatility(
        'all',
        base.symbol,
        quote.symbol,
        web3Provider
    );
    const typedData = generatedTypedData(
        base,
        quote,
        allPlatformsLiquidity,
        volatilityData.latest.current
    );

    const privateKey =
    '0x0123456789012345678901234561890123456789012345678901234567890123';
    const wallet = new ethers.Wallet(privateKey);

    const signature = await wallet._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.value
    );
    const splitSig = ethers.utils.splitSignature(signature);

    const dataJson = JSON.stringify({
        r: splitSig.r,
        s: splitSig.s,
        v: splitSig.v,
        liquidationBonus: 100,
        riskData: typedData.value,
    });
    console.log(dataJson);
    /*
        v: 28,
        r: '0xbafb174e0605f88711e19eb6b0c8aff8e18cc503fd23dc2116c1e1c075369348',
        s: '0x55915af7d1442e85d1c5551027d5180af1058c36e0ca112a94093e72459fb9cb',
  */
    // const sigBytes =  joinSignature(splitSig)
    // const splitSig = ethers.utils.Signature.from(signature);

    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider(
        'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
    );

    const spythia = new ethers.Contract(
        '0xa9aCE3794Ed9556f4C91e1dD325bC5e4AB1CCDE7',
        SPythiaAbi,
        web3ProviderGoerli
    );
    const signer = await spythia.getSigner(
        typedData.value,
        splitSig.v,
        splitSig.r,
        splitSig.s
    );

    console.log(signer);

    if (signer != wallet.address) {
        throw new Error('SIGNER IS NOT WALLET PUBLIC KEY');
    } else {
        console.log('Signer is our wallet !');
    }

    const fakeValues = {
        collateralAsset: base.address,
        debtAsset: quote.address,
        liquidity: '10000000000000000000000000000000000000',
        volatility: '0',
        lastUpdate: Math.round(Date.now() / 1000),
        chainId: 5,
    };
    const signer_fakedata = await spythia.getSigner(
        fakeValues,
        splitSig.v,
        splitSig.r,
        splitSig.s
    );

    console.log(signer_fakedata);

    if (signer_fakedata != wallet.address) {
        throw new Error('SIGNER IS NOT WALLET PUBLIC KEY');
    } else {
        console.log('Signer is our wallet !');
    }
}


// PASSING WRONG LIQUIDITY = MUST CALCULATE 30 DAYS AVERAGE 

/**
 * 
 * @param  {{symbol: string, decimals: number, address: string, dustAmount: number}} baseTokenConf 
 * @param  {{symbol: string, decimals: number, address: string, dustAmount: number}} quoteTokenConf 
 * @param {number} liquidity 
 * @param {number} volatility 
 * @returns 
 */
function generatedTypedData(
    baseTokenConf,
    quoteTokenConf,
    liquidity,
    volatility
) {
    const volatility18Decimals = new BigNumber(volatility)
        .times(BN_1e18)
        .toFixed(0);
    const liquidity18Decimals = new BigNumber(liquidity)
        .times(BN_1e18)
        .toFixed(0);
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

signTypedData();

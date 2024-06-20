const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { default: axios } = require('axios');
dotenv.config();
const { kinzaConfig, pairsToCompute, protocolDataProviderAddress, protocolDataProviderABI } = require('./kinza.dashboard.precomputer.config');
const { findRiskLevelFromParameters } = require('../utils/smartLTV');
const { RecordMonitoring } = require('../utils/monitoring');
const { fnName, retry, getLiquidityAndVolatilityFromDashboardData } = require('../utils/utils');
const { getConfTokenBySymbol } = require('../utils/token.utils');
const { DATA_DIR } = require('../utils/constants');

/**
 * Compute the Summary values for Morpho
 * @param {number} fetchEveryMinutes 
 */
async function kinzaDashboardPrecomputer(fetchEveryMinutes) {
    const MONITORING_NAME = '[MANTLE] Kinza Dashboard Summary Computer';
    const start = Date.now();
    try {
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'running',
            'lastStart': Math.round(start / 1000),
            'runEvery': fetchEveryMinutes * 60
        });
        if (!process.env.RPC_URL) {
            throw new Error('Could not find RPC_URL env variable');
        }

        console.log(new Date(start));
        console.log(`${fnName()}: starting`);
        const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
        const currentBlock = await web3Provider.getBlockNumber();

        const promises = [];
        for (const base of Object.keys(pairsToCompute)) {
            const promise = computeDataForPair(base, pairsToCompute[base], web3Provider);
            await promise;
            promises.push(promise);
        }

        const allPairs = await Promise.all(promises);

        const kinzaOverview = {};
        for (const pair of allPairs) {
            for (const base of Object.keys(pair)) {
                kinzaOverview[base] = pair[base];
            }
        }
        
        if (!fs.existsSync(`${DATA_DIR}/precomputed/kinza-dashboard/`)) {
            fs.mkdirSync(`${DATA_DIR}/precomputed/kinza-dashboard/`, { recursive: true });
        }
        const summaryFilePath = path.join(DATA_DIR, 'precomputed/kinza-dashboard/kinza-summary.json');
        const objectToWrite = JSON.stringify(kinzaOverview, null, 2);
        fs.writeFileSync(summaryFilePath, objectToWrite, 'utf8');
        console.log('Kinza Dashboard Summary Computer: ending');

        const runEndDate = Math.round(Date.now() / 1000);
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'success',
            'lastEnd': runEndDate,
            'lastDuration': runEndDate - Math.round(start / 1000),
            'lastBlockFetched': currentBlock
        });
    } catch (error) {
        const errorMsg = `An exception occurred: ${error}`;
        console.error(errorMsg);
        await RecordMonitoring({
            'name': MONITORING_NAME,
            'status': 'error',
            'error': errorMsg
        });
    }
}

async function getPrice(tokenAddress) {
    const apiUrl = `https://coins.llama.fi/prices/current/ethereum:${tokenAddress}?searchWidth=12h`;
    const priceResponse = await retry(axios.get, [apiUrl], 0, 100);
    return priceResponse.data.coins[`ethereum:${tokenAddress}`].price;
}



async function computeDataForPair(base, quotes, web3Provider) {
    // const subMarkets = await Promise.all(quotes.map(async (quote) => await computeSubMarket(base, quote)));
    const subMarkets = [];
    for (let quote of quotes) {
        const newSubMarket = await computeSubMarket(base, quote, web3Provider);
        subMarkets.push(newSubMarket);
    }
  
    let riskLevel = Math.max(...subMarkets.map((_) => _.riskLevel));
    let data = {};
    data[base] = {
        riskLevel: riskLevel,
        subMarkets: subMarkets
    };
    return data;
}
  
async function computeSubMarket(base, quote, web3Provider) {
    console.log(`computeSubMarket[${base}/${quote}]: starting`);
    const baseConf = getConfTokenBySymbol(base);
    const quoteConf = getConfTokenBySymbol(quote);
    const baseTokenAddress = baseConf.address;
    const quoteTokenAddress = quoteConf.address;
    const protocolDataProviderContract = new ethers.Contract(
        protocolDataProviderAddress,
        protocolDataProviderABI,
        web3Provider
    );
  
    const baseTokenInfo = await axios.get(
        'https://coins.llama.fi/prices/current/mantle:' + baseTokenAddress + ',mantle:' + quoteTokenAddress
    );

    const basePrice = baseTokenInfo.data.coins['mantle:' + baseTokenAddress].price;
    const quotePrice = baseTokenInfo.data.coins['mantle:' + quoteTokenAddress].price;
  
    // if wBETH/USDC, baseReserveCaps is for wBETH
    const baseReserveCaps = await retry(protocolDataProviderContract.getReserveCaps, [baseConf.address]);
    // if wBETH/USDC, quoteReserveCaps is for USDC
    const quoteReserveCaps = await retry(protocolDataProviderContract.getReserveCaps, [quoteConf.address]);
    const reserveDataConfigurationBase = await retry(protocolDataProviderContract.getReserveConfigurationData, [
        baseTokenAddress
    ]);

    let riskLevel = 0.0;
  
    const liquidationBonusBps = reserveDataConfigurationBase.liquidationBonus.toNumber() - 10000;
    // const liquidationBonusBps = 500;
  
    const baseSupplyCapUSD = baseReserveCaps.supplyCap.toNumber() * basePrice;
    const quoteBorrowCapUSD = quoteReserveCaps.borrowCap.toNumber() * quotePrice;
    // const baseSupplyCapUSD = 50_000_000;
    // const quoteBorrowCapUSD = 50_000_000;
    const capToUseUsd = Math.min(baseSupplyCapUSD, quoteBorrowCapUSD);
    const liquidationThresholdBps = reserveDataConfigurationBase.liquidationThreshold.toNumber();
    // const liquidationThresholdBps = 7500;
    const ltvBps = reserveDataConfigurationBase.ltv.toNumber();
    // const ltvBps = 8000;

    const {volatility, liquidityInKind} = getLiquidityAndVolatilityFromDashboardData(base, quote, liquidationBonusBps);
  
    const liquidity = liquidityInKind;
    const liquidityUsd = liquidity * basePrice;
    const selectedVolatility = volatility;
    riskLevel = findRiskLevelFromParameters(
        selectedVolatility,
        liquidityUsd,
        liquidationBonusBps / 10000,
        liquidationThresholdBps / 10000,
        capToUseUsd
    );
    const pairValue = {
        quote: quote,
        riskLevel: riskLevel,
        liquidationThreshold: liquidationThresholdBps / 10000,
        LTV: ltvBps / 10000,
        liquidationBonus: liquidationBonusBps / 10000,
        supplyCapUsd: baseSupplyCapUSD,
        supplyCapInKind: baseReserveCaps.supplyCap.toNumber(),
        // supplyCapInKind: 50_000_000 / basePrice,
        borrowCapUsd: quoteBorrowCapUSD,
        borrowCapInKind: quoteReserveCaps.borrowCap.toNumber(),
        // borrowCapInKind: 50_000_000 / quotePrice,
        volatility: selectedVolatility,
        liquidity: liquidity,
        basePrice: basePrice,
        quotePrice: quotePrice
    };
  
    console.log(`computeSubMarket[${base}/${quote}]: result:`, pairValue);
    return pairValue;
}

// kinzaDashboardPrecomputer(60);
module.exports = { kinzaDashboardPrecomputer };

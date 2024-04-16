const { ethers } = require('ethers');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { default: axios } = require('axios');
dotenv.config();
const { kinzaConfig } = require('./kinza.dashboard.precomputer.config');
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
    const MONITORING_NAME = 'Kinza Dashboard Summary Computer';
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

        const results = {};

        for(const base of Object.keys(kinzaConfig)) {
            results[base] = {
                riskLevel: 0,
                subMarkets: []
            };
            const baseToken = getConfTokenBySymbol(base);
            for(const quoteConfig of kinzaConfig[base]) {
                const quote = quoteConfig.quote;
                const quoteToken = getConfTokenBySymbol(quote);
                console.log(`Working on ${base}/${quote}`);

                const basePrice = await getPrice(baseToken.address);
                const quotePrice = await getPrice(quoteToken.address);

                const liquidityAndVolatility = getLiquidityAndVolatilityFromDashboardData(base, quote, quoteConfig.liquidationBonusBPS);
                const liquidityInKind = liquidityAndVolatility.liquidityInKind;
                const liquidityUsd = liquidityAndVolatility.liquidityInKind * basePrice;
                const supplyCapInKind = quoteConfig.supplyCap;
                const supplyCapUsd = supplyCapInKind * basePrice;
                const borrowCapInKind = quoteConfig.borrowCap;
                const borrowCapUsd = borrowCapInKind * quotePrice;
                const capToUseUsd = Math.min(supplyCapUsd, borrowCapUsd);

                const subMarketRiskLevel = findRiskLevelFromParameters(liquidityAndVolatility.volatility, 
                    liquidityUsd,
                    quoteConfig.liquidationBonusBPS / 10000,
                    quoteConfig.ltv,
                    capToUseUsd);

                results[base].subMarkets.push({
                    quote: quote,
                    riskLevel: subMarketRiskLevel,
                    LTV: quoteConfig.ltv,
                    liquidationBonus: quoteConfig.liquidationBonusBPS/10000,
                    supplyCapUsd: supplyCapUsd,
                    supplyCapInKind: supplyCapInKind,
                    borrowCapUsd: borrowCapUsd,
                    borrowCapInKind: borrowCapInKind,
                    volatility: liquidityAndVolatility.volatility,
                    liquidity: liquidityInKind,
                    basePrice: basePrice,
                    quotePrice: quotePrice
                });

                if(results[base].riskLevel < subMarketRiskLevel) {
                    results[base].riskLevel = subMarketRiskLevel;
                }
            }
        }
        
        if (!fs.existsSync(`${DATA_DIR}/precomputed/kinza-dashboard/`)) {
            fs.mkdirSync(`${DATA_DIR}/precomputed/kinza-dashboard/`, { recursive: true });
        }
        const summaryFilePath = path.join(DATA_DIR, 'precomputed/kinza-dashboard/kinza-summary.json');
        const objectToWrite = JSON.stringify(results, null, 2);
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

// kinzaDashboardPrecomputer(60);
module.exports = { kinzaDashboardPrecomputer };

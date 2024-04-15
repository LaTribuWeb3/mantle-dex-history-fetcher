const { watchedPairs } = require('../src/global.config');
const { getLiquidity, getLiquidityAll, getLiquidityV2, getLiquidityAverageV2 } = require('../src/data.interface/data.interface');
const { PLATFORMS, BLOCK_PER_DAY } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');
const { getConfTokenBySymbol, normalize } = require('../src/utils/token.utils');
const { default: axios } = require('axios');
const { default: BigNumber } = require('bignumber.js');
const { getPriceAtBlock } = require('../src/data.interface/internal/data.interface.price');
const dotenv = require('dotenv');
const { computeAverageSlippageMap } = require('../src/data.interface/internal/data.interface.liquidity');
dotenv.config();

async function test() {
    const block = 19659592;
    fs.writeFileSync('liquidityresult.csv', 'platform,base,quote,liquidity old, liquidity new,diff,1Inch avg slippage\n');

    const pairsToFetch = [];
    for(const base of Object.keys(watchedPairs)) {
        for(const quoteCfg of watchedPairs[base]) {
            if(!quoteCfg.exportToInternalDashboard) continue;
            const quote = quoteCfg.quote;
            pairsToFetch.push({
                base,
                quote
            });

            pairsToFetch.push({
                base: quote,
                quote: base
            });
        }
    }

    for(const pairToFetch of pairsToFetch) {
        const base = pairToFetch.base;
        const quote = pairToFetch.quote;

        // for(const platform of PLATFORMS) {
        //     console.log(`Working on ${base}/${quote} for ${platform}`);
        //     const oldLiquidity = getLiquidity(platform, base, quote, block, block);
        //     let liquidityOld = 0;
        //     if(oldLiquidity) {
        //         liquidityOld = oldLiquidity[block].slippageMap[500].base;
        //     }

        //     const newLiquidity = await getLiquidityV2(platform, base, quote, block);
        //     let liquidityNew = 0;
        //     if(newLiquidity) {
        //         liquidityNew = newLiquidity.slippageMap[500];
        //     }
        //     fs.appendFileSync('liquidityresult.csv', `${platform},${base},${quote},${liquidityOld},${liquidityNew},N/A\n`); 
        // }

        const oldLiquidity = getLiquidityAll(base, quote, block - 30 * BLOCK_PER_DAY, block);
        let liquidityOld = 0;
        if(oldLiquidity) {
            liquidityOld = computeAverageSlippageMap(oldLiquidity).slippageMap[500].base;
        }

        const newLiquidity = await getLiquidityAverageV2('all', base, quote, block - 30 * BLOCK_PER_DAY, block);
        let liquidityNew = 0;
        if(newLiquidity) {
            liquidityNew = newLiquidity.slippageMap[500];
        }

        let diff = 0;
        if(liquidityOld != 0) {
            diff = roundTo(((liquidityNew - liquidityOld)/liquidityOld)*100, 2);
        }
        let slippage = 0;
        // if(liquidityNew != 0) {
        //     const baseToken = getConfTokenBySymbol(base);
        //     const baseTokenPrice = getPriceAtBlock('uniswapv3', baseToken.symbol, 'USDC', block);
        //     const quoteToken = getConfTokenBySymbol(quote);
        //     const quoteTokenPrice = getPriceAtBlock('uniswapv3', quoteToken.symbol, 'USDC', block);
        //     const baseAmount = new BigNumber(roundTo(liquidityNew, 8)).times(new BigNumber(10).pow(baseToken.decimals)).toString(10).split('.')[0];
        //     // fetch data 1inch
        //     const oneInchApiUrl =
        // `https://api.1inch.dev/swap/v6.0/${1}/quote?` +
        // `src=${baseToken.address}` +
        // `&dst=${quoteToken.address}` +
        // `&amount=${baseAmount}`;

        //     const oneInchSwapResponse = await axios.get(oneInchApiUrl, {
        //         headers: {
        //             Authorization: `Bearer ${process.env.ONE_INCH_KEY}`
        //         }
        //     });

        //     // console.log(oneInchSwapResponse.data);
        //     const quoteAmount = oneInchSwapResponse.data.dstAmount;
        //     const quoteAmountNorm = normalize(quoteAmount, quoteToken.decimals);

        //     const newPrice = quoteAmountNorm * quoteTokenPrice;
        //     const oldPrice = liquidityNew * baseTokenPrice;
        //     slippage = Math.abs(roundTo(((newPrice - oldPrice)/oldPrice)*100, 2));
        // }

        fs.appendFileSync('liquidityresult.csv', `all,${base},${quote},${liquidityOld},${liquidityNew},${diff}%,${roundTo(slippage * 100, 2)}%\n`); 
    }
}

test();
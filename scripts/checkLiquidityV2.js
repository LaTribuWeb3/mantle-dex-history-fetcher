const { watchedPairs } = require("../src/global.config");
const { getLiquidity, getLiquidityAll, getLiquidityV2 } = require('../src/data.interface/data.interface');
const { PLATFORMS } = require('../src/utils/constants');
const fs = require('fs');
const { roundTo } = require('../src/utils/utils');

async function test() {
    const block = 19609694;
    fs.writeFileSync('liquidityresult.csv', 'platform,base,quote,liquidity old, liquidity new\n');
    for(const base of Object.keys(watchedPairs)) {
        for(const quoteCfg of watchedPairs[base]) {
            if(!quoteCfg.exportToInternalDashboard) continue;
            const quote = quoteCfg.quote;
            for(const platform of PLATFORMS) {
                console.log(`Working on ${base}/${quote} for ${platform}`);
                const oldLiquidity = getLiquidity(platform, base, quote, block, block);
                let liquidityOld = 0;
                if(oldLiquidity) {
                    liquidityOld = oldLiquidity[block].slippageMap[500].base;
                }

                const newLiquidity = await getLiquidityV2(platform, base, quote, block);
                let liquidityNew = 0;
                if(newLiquidity) {
                    liquidityNew = newLiquidity.slippageMap[500];
                }
                fs.appendFileSync('liquidityresult.csv', `${platform},${base},${quote},${liquidityOld},${liquidityNew}\n`); 
            }

            const oldLiquidity = getLiquidityAll(base, quote, block, block);
            let liquidityOld = 0;
            if(oldLiquidity) {
                liquidityOld = oldLiquidity[block].slippageMap[500].base;
            }

            const newLiquidity = await getLiquidityV2('all', base, quote, block);
            let liquidityNew = 0;
            if(newLiquidity) {
                liquidityNew = newLiquidity.slippageMap[500];
            }
            fs.appendFileSync('liquidityresult.csv', `all,${base},${quote},${liquidityOld},${liquidityNew}\n`); 
        }
    }
}

test();
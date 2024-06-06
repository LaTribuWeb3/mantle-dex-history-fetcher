const fs = require('fs');
const { readLastLine } = require('../src/utils/utils');

async function f() {
    for(const file of fs.readdirSync('./data/precomputed/merchantmoe')) {
        if(file.endsWith('-unified-data.csv')) {
            const filePath = './data/precomputed/merchantmoe/' + file;
            const lastLine = await readLastLine(filePath);
            const jsonPart = lastLine.replace('64000000,1,', '');
            const slippageMap = JSON.parse(jsonPart);

            const slippageMap500 =slippageMap[500];
            for(let s = 550; s <= 2000; s+=50) {
                slippageMap[s] = {
                    base: slippageMap500.base,
                    quote: slippageMap500.quote
                };
            }

            fs.writeFileSync(filePath, `64000000,1,${JSON.stringify(slippageMap)}\n`);
        }
    }
}

f();
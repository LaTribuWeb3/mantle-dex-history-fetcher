const DATA_DIR = process.cwd() + '/data';
const path = require('path');
const fs = require('fs');

function jsDateToString(date) {
    const dateObj = date;
    const month = dateObj.getUTCMonth() + 1; //months from 1-12
    const day = dateObj.getUTCDate();
    const year = dateObj.getUTCFullYear();
    return day + '.' + month + '.' + year;
}


function unifyProtocolData(protocol) {
    let numberOfDaysAccumulated = 0;
    let currentDay = new Date();
    const protocolData = {};
    while (numberOfDaysAccumulated < 180) {
        //opening latest protocol file
        const day = jsDateToString(currentDay);
        const folderPath = DATA_DIR + '/clf/' + day;
        const fileName = `${day}_${protocol}_CLFs.json`;
        const filePath = path.join(folderPath, fileName);
        try {
            const contents = fs.readFileSync(filePath, 'utf8');
            const latestData = JSON.parse(contents);
            for (const [market, marketData] of Object.entries(latestData.results)) {
                if (!protocolData[market]) {
                    protocolData[market] = {};
                }
                for (const [collateral, collateralValues] of Object.entries(marketData.collateralsData)) {
                    if (!protocolData[market][collateral] && collateralValues) {
                        protocolData[market][collateral] = {};
                    }
                    if (collateralValues) {
                        protocolData[market][collateral][day] = collateralValues.clfs;

                        // read the pair file
                        const pairFilename = path.join(folderPath, `${day}_${collateral}-${market}_${protocol}_CLFs.json`);
                        const pairData = JSON.parse(fs.readFileSync(pairFilename, 'utf-8'));
                        
                        protocolData[market][collateral][day].protocolParameters = pairData.assetParameters;
                        protocolData[market][collateral][day].parameters = pairData.parameters;
                    }
                }
            }
        }
        catch (error) {
            console.log(error);
            console.log('Number of days accumulated', numberOfDaysAccumulated);
            break;
        }
        currentDay.setDate(currentDay.getDate() - 1);
        numberOfDaysAccumulated++;
    }
    return { protocolData, numberOfDaysAccumulated };
}


function computeCLFHistoryForProtocol(protocol = 'compoundv3') {
    const volatilities = [7, 30, 180];
    const spans = [7, 30, 180];
    const { protocolData, numberOfDaysAccumulated } = unifyProtocolData(protocol);
    const orderedCLFData = {};
    for (const [market, marketData] of Object.entries(protocolData)) {
        orderedCLFData[market] = {};
        for (const [token, tokenData] of Object.entries(marketData)) {
            for (const volatility of volatilities) {
                if(!orderedCLFData[market][volatility]) {
                    orderedCLFData[market][volatility] = {};
                }
                for (const span of spans) {
                    if (!orderedCLFData[market][volatility][span]) {
                        orderedCLFData[market][volatility][span] = [];
                    }
                    for (const [date, dateData] of Object.entries(tokenData)) {
                        const index = orderedCLFData[market][volatility][span].findIndex(_ => _.date === date);
                        if (index >= 0) {
                            orderedCLFData[market][volatility][span][index][token] = dateData[volatility][span];
                            orderedCLFData[market][volatility][span][index][`${token}-volatility`] = dateData.parameters[volatility].volatility;
                            orderedCLFData[market][volatility][span][index][`${token}-liquidity`] = dateData.parameters[span].liquidity;
                            orderedCLFData[market][volatility][span][index][`${token}-parameters`] = dateData.protocolParameters;
                        }
                        else {
                            const objectToStore = {
                                date: date,
                                [`${token}`]: dateData[volatility][span],
                                [`${token}-volatility`]: dateData.parameters[volatility].volatility,
                                [`${token}-liquidity`]: dateData.parameters[span].liquidity,
                                [`${token}-parameters`]: dateData.protocolParameters,
                            };

                            orderedCLFData[market][volatility][span].push(objectToStore);
                        }
                    }
                }
            }
        }
    }
    return orderedCLFData;
}

// computeCLFHistoryForProtocol();
module.exports = { computeCLFHistoryForProtocol };

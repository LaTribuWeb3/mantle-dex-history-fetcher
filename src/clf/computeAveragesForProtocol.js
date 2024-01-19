const DATA_DIR = process.cwd() + '/data';
const path = require('path');
const fs = require('fs');
const { average } = require('simple-statistics');

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
    protocolData['protocolAverage'] = {};
    while (numberOfDaysAccumulated < 180) {
        //opening latest protocol file
        const day = jsDateToString(currentDay);
        const folderPath = DATA_DIR + `/clf/${protocol}/` + day;
        const fileName = `${day}_${protocol}_CLFs.json`;
        const filePath = path.join(folderPath, fileName);
        try {
            const contents = fs.readFileSync(filePath, 'utf8');
            const latestData = JSON.parse(contents);
            protocolData['protocolAverage'][currentDay.getTime()] = latestData['weightedCLF'];

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

function computeAverages(protocolData, numberOfDaysAccumulated) {
    const toAverage = {};
    const averaged = {};
    const minimumDataPoints = [];
    averaged['protocolAverageHistory'] = protocolData['protocolAverage'];
    try {
        for (const [market, marketData] of Object.entries(protocolData)) {
            if (market == 'protocolAverage') {
                continue;
            }
            if (!toAverage[market]) {
                toAverage[market] = {};
            }
            for (const [collateral, collateralValues] of Object.entries(marketData)) {
                const cptValues = Object.keys(collateralValues).length;
                minimumDataPoints.push(Object.keys(collateralValues).length);
                console.log(`${market} ${collateral}: values: ${cptValues}`);

                if (cptValues < 180) {
                    // find discontinuity
                    checkDataDiscontinuity(collateralValues, cptValues);
                }
                if (!toAverage[market][collateral]) {
                    toAverage[market][collateral] = {};
                }
                let daysAveraged = 0;
                for (const volatilitySpan of Object.values(collateralValues)) {
                    daysAveraged++;
                    for (const [volSpan, liquiditySpan] of Object.entries(volatilitySpan)) {
                        if (!toAverage[market][collateral][volSpan]) {
                            toAverage[market][collateral][volSpan] = {};
                        }
                        for (const [liqSpan, liquidityValue] of Object.entries(liquiditySpan)) {
                            if (!toAverage[market][collateral][volSpan][liqSpan]) {
                                toAverage[market][collateral][volSpan][liqSpan] = 0;
                            }
                            toAverage[market][collateral][volSpan][liqSpan] += liquidityValue;
                            if (daysAveraged === 7 || daysAveraged === 30 || daysAveraged === 180 || (minimumDataPoints.includes(daysAveraged) && daysAveraged < 7) || daysAveraged === numberOfDaysAccumulated) {
                                if (!averaged[market]) {
                                    averaged[market] = {};
                                }
                                if (!averaged[market][collateral]) {
                                    averaged[market][collateral] = {};
                                }
                                if (!averaged[market][collateral][`${daysAveraged}D_averageSpan`]) {
                                    averaged[market][collateral][`${daysAveraged}D_averageSpan`] = {};
                                }
                                if (!averaged[market][collateral][`${daysAveraged}D_averageSpan`][volSpan]) {
                                    averaged[market][collateral][`${daysAveraged}D_averageSpan`][volSpan] = {};
                                }
                                if (!averaged[market][collateral][`${daysAveraged}D_averageSpan`][volSpan][liqSpan]) {
                                    averaged[market][collateral][`${daysAveraged}D_averageSpan`][volSpan][liqSpan] = toAverage[market][collateral][volSpan][liqSpan] / daysAveraged;
                                }
                            }
                            
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        console.log(error);
    }
    return averaged;
}

function checkDataDiscontinuity(collateralValues, cptValues) {
    const first = Object.keys(collateralValues)[0];
    // console.log(first);
    const firstSplitted = first.split('.').map(_ => Number(_));
    const date = new Date(firstSplitted[2], firstSplitted[1] - 1, firstSplitted[0], 12, 0, 0);
    // console.log(date);

    for (let i = 1; i < cptValues; i++) {
        const dt = Object.keys(collateralValues)[i];
        date.setDate(date.getDate() - 1);

        const formatedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
        // console.log(dt, formatedDate);
        if (formatedDate != dt) {
            console.error(`Discontinuity error on date ${dt}, should be ${formatedDate}`);
            throw new Error(`Discontinuity error on date ${dt}, should be ${formatedDate}`);
        }
    }
}

function computeAveragesForProtocol(protocol) {
    const { protocolData, numberOfDaysAccumulated } = unifyProtocolData(protocol);
    const averagesToWrite = computeAverages(protocolData, numberOfDaysAccumulated);
    return averagesToWrite;
}

module.exports = { computeAveragesForProtocol };

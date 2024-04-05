const BigNumber = require('bignumber.js');

function writeGLPMSpec(spec, liquidity) {
    // Retrieving each field from the structured object
    const { assets, origin, target, slippageStepBps, targetSlippageBps } = spec;
    // TODO: Limite le maxslippage pour les 5000 - 10000 - 15000, etc.

    const numSlippageSteps = targetSlippageBps / slippageStepBps;
    const liquidationBonus = targetSlippageBps;

    const allNames = [];

    function elementInArray(arr, e) {
        for (const elm of arr) {
            if (elm === e) return true;
        }

        return false;
    }

    function getName(assetIn, assetOut, slippage) {
        const name = assetIn + '_' + slippage.toString() + '_' + assetOut;
        if (!elementInArray(allNames, name)) {
            allNames.push(name);

            //console.log({name})
        }

        //console.log({name})
        //console.log({name})    
        //console.log(elementInArray(allNames,"a_5_usdc"))
        return name;
    }

    function getInputLiquidity(assetIn, assetOut, slippage) {
        if (!liquidity.hasOwnProperty(assetIn)) return 0;
        const srcLiquidity = liquidity[assetIn]; // UNDERSTAND WHYU ITS
        //console.log(Object.keys(srcLiquidity))
        if (!srcLiquidity.hasOwnProperty(assetOut)) return 0;

        return srcLiquidity[assetOut][slippage];
    }

    function buildConstraints(src, dst) {
        const constraints = [];
        for (const assetIn of assets) {
            // out = in, unless it is src or dst
            if (assetIn === dst || assetIn === src) continue;
            const inEqualsOutvectors = {};

            for (const assetOut of assets) {
                for (let step = 0; step < numSlippageSteps; step++) {
                    const slippage = (step + 1) * slippageStepBps;

                    // in edges
                    if (getInputLiquidity(assetIn, assetOut, step) > 0 && assetOut !== src) {
                        const name = getName(assetIn, assetOut, slippage);
                        const weight = getInputLiquidity(assetIn, assetOut, step);

                        inEqualsOutvectors[name] = 1;

                        const weightVecotr = {};
                        weightVecotr[name] = 1;
                        constraints.push({ 'namedVector': weightVecotr, 'constraint': '<=', 'constant': weight });

                        if (assetIn === src) {
                            constraints.push({ 'namedVector': weightVecotr, 'constraint': '>=', 'constant': 0.0 });
                            //constraints.push({"namedVector" : weightVecotr, "constraint" : "<=", "constant" : -1.0})                                                
                        }
                    }

                    // out edge
                    if (getInputLiquidity(assetOut, assetIn, step) > 0) {
                        const name = getName(assetOut, assetIn, slippage);
                        const weight = getInputLiquidity(assetOut, assetIn, step);

                        inEqualsOutvectors[name] = new BigNumber(-1.0).times(new BigNumber(10_000).minus(slippage)).div(10_000); // - (1 - slippage) / 100

                        const weightVecotr = {};
                        weightVecotr[name] = 1;
                        constraints.push({ 'namedVector': weightVecotr, 'constraint': '<=', 'constant': weight });
                    }
                }
            }

            // encode equality with <= and =>
            constraints.push({ 'namedVector': inEqualsOutvectors, 'constraint': '<=', 'constant': 0.0 });
            constraints.push({ 'namedVector': inEqualsOutvectors, 'constraint': '>=', 'constant': 0.0 });
        }

        //console.log(JSON.stringify(constraints, null, 4))
        return constraints;
    }

    function buildObjective(src, dst, liquidationBonus) {
        const objective = {};

        // what going out of src is negative. what enters dst is positive. liquidation bonus is discounted from negative.

        // encode src negative objective
        for (const asset of assets) {
            if (asset === src) continue;
            for (let step = 0; step < numSlippageSteps; step++) {
                const slippage = (step + 1) * slippageStepBps;
                if (getInputLiquidity(src, asset, step) === 0) continue;

                const name = getName(src, asset, slippage);
                objective[name] = (new BigNumber(10_000).minus(liquidationBonus)).div(10_000).times(-1); // (1 - liquidationBonus) * (-1) // To convert to BigNumber
            }
        }

        // encode dst positive objective
        for (const asset of assets) {
            if (asset === dst) continue;
            for (let step = 0; step < numSlippageSteps; step++) {
                const slippage = (step + 1) * slippageStepBps;
                if (getInputLiquidity(asset, dst, step) === 0) continue;

                const name = getName(asset, dst, slippage);
                objective[name] = 1;
            }
        }

        /*
    // encode the rest with 0 objective, otherwise solver crash
    for(const assetIn of assets) {
        if(assetIn === src || assetIn === dst) continue
        for(const assetOut of assets) {
            if(assetOut === src) continue
            for(let step = 0 ; step < numSlippageSteps ; step++) {
                const slippage = (step + 1) * slippageStep
                if(getInputLiquidity(assetIn, assetOut, step) === 0) continue
                objective[getName(assetIn, assetOut, slippage)] = 0
            }
        }
    }*/

        return objective;
    }

    function addSlackVariables(vector) {
    //console.log(elementInArray(allNames,"a_5_usdc"))
    //sd
        for (const name of allNames) {
            if (!(name in vector)) {
                vector[name] = 0;
            }
        }

        return vector;
    }

    function addSlackVariablesToConstraints(constraints) {
        const newConstraints = [];
        for (const c of constraints) {
            newConstraints.push({ 'namedVector': addSlackVariables(c.namedVector), 'constraint': c.constraint, 'constant': c.constant });
            //console.log(newConstraints[newConstraints.length - 1].constraint)
        }

        return newConstraints;
    }


    const constraints = addSlackVariablesToConstraints(buildConstraints(origin, target));
    const objective = addSlackVariables(buildObjective(origin, target, liquidationBonus));

    var GLPMSpec = '';

    for (const name of allNames) {
        GLPMSpec += 'var ' + name + ' >= 0;\n';
    }

    let objectiveString = 'maximize z: ';
    let i = 0;
    for (const key in Object(objective)) {
        if (objective[key] == 0) continue;
        if (i++ > 0) objectiveString += ' + ';
        objectiveString += '( ' + objective[key].toString() + ') * ' + key;
    }
    objectiveString += ';';

    GLPMSpec += objectiveString + '\n';

    for (const constraint of constraints) {
        let string = 'subject to c' + (i++).toString() + ': ';
        let j = 0;
        for (const key in Object(constraint.namedVector)) {
            if (constraint.namedVector[key] == 0) continue;
            if (j++ > 0) string += ' + ';
            string += '(' + constraint.namedVector[key].toString() + ') * ' + key;
        }

        string += ' ' + constraint.constraint + ' ' + constraint.constant.toString() + ';';
        GLPMSpec += string + '\n';
    }

    GLPMSpec += 'end;';

    return GLPMSpec;
}

module.exports = {
    writeGLPMSpec
};
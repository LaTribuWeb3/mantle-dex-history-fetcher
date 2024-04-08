const BigNumber = require('bignumber.js');

function writeGLPMSpec(spec, liquidity) {
    // Retrieving each field from the structured object
    const { assets, origin, target, slippageStepBps, targetSlippageBps } = spec;
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
        }
        return name;
    }

    function getInputLiquidity(assetIn, assetOut, slippage) {
        if (!liquidity[assetIn]) return 0;
        const srcLiquidity = liquidity[assetIn]; // UNDERSTAND WHYU ITS
        //console.log(Object.keys(srcLiquidity))
        if (!srcLiquidity[assetOut]) return 0;

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

        return objective;
    }

    function addSlackVariables(vector) {
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
        }

        return newConstraints;
    }


    const constraints = addSlackVariablesToConstraints(buildConstraints(origin, target));
    const objective = addSlackVariables(buildObjective(origin, target, liquidationBonus));

    var GLPMSpec = [];

    GLPMSpec = GLPMSpec.concat(allNames.map(name => 'var ' + name + ' >= 0;'));

    const nonNullObjectives = Object.entries(objective).filter(([, value]) => value != 0);

    GLPMSpec = GLPMSpec.concat(['maximize z: ' + nonNullObjectives
        .map(([key, value]) => `( ${value} ) * ${key}`)
        .join(' + ') + ';']);

    GLPMSpec = GLPMSpec.concat(constraints.map((constraint, i) =>
        'subject to c' + (nonNullObjectives.length + i).toString() + ': ' + Object.entries(constraint.namedVector)
            .filter(([, value]) => value != 0)
            .map(([key, value]) => `(${value}) * ${key}`)
            .join(' + ')
        + ' ' + constraint.constraint
        + ' ' + constraint.constant.toString() + ';'));

    GLPMSpec.push('end;');

    return GLPMSpec.join('\n');
}


function parseGLPMOutput(glpmOutput, baseToken) {
    let columns = glpmOutput.columns.filter(column => column.activity !== 0);
    let ret = {};

    for (let column of columns) {
        let [base, slippage, quote] = column.name.split('_');
        if (ret[base] == undefined) ret[base] = {};
        if (ret[base][quote] == undefined) ret[base][quote] = {};
        ret[base][quote][slippage] = column.activity;
    }

    // here, in ret, we have all the data for all pairs
    // we only want to have data when base == origin
    let totalAmountOfBase = 0;
    if(!ret[baseToken]) {
        return 0;
    }
    for(const quote of Object.keys(ret[baseToken])) {
        for(const slippage of Object.keys(ret[baseToken][quote])) {
            const amount = ret[baseToken][quote][slippage];
            totalAmountOfBase += amount;
        }
    }

    return totalAmountOfBase;
}

module.exports = {
    writeGLPMSpec,
    parseGLPMOutput
};
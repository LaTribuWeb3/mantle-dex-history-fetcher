
const assets = ['a', 'dai', 'eth', 'usdc', 'usdt', 'b', 'steth'];

let spec = "";

const liquidity = {
  a: {
    eth: [123, 256, 890, 2001, 5000],
    usdc: [123, 3167, 3333, 9000, 10000]
  },
  eth: {
    usdc: [5000, 6000, 7000, 8000, 9000],
    dai: [4000, 5000, 6000, 7000, 8000],
    usdt: [4200, 5500, 6500, 7500, 8500],
    b: [666, 777, 888, 999, 1010],
    steth: [1e6, 2e6, 3e6, 4e6, 5e6]
  },
  usdc: {
    usdt: [1e6, 2e6, 3e6, 4e6, 5e6],
    dai: [1.1e6, 2.1e6, 3.2e6, 4.3e6, 5.4e6],
    b: [185, 222, 333, 444, 555]
  },
  dai: {
    usdt: [1e6, 2e6, 3.5e6, 4e6, 6e6],
    usdc: [1.2e6, 2.2e6, 3.2e6, 4.2e6, 5.2e6],
    b: [185, 212, 331, 544, 655]
  },
  usdt: {
    dai: [1e6, 2e6, 3.5e6, 4e6, 6e6],
    usdc: [1.2e6, 2.2e6, 3.2e6, 4.2e6, 5.2e6],
    b: [285, 312, 431, 644, 755]
  },
  steth: { eth: [1e6, 2e6, 3e6, 4e6, 5e6] }
};

const slippageStep = 0.01;
const numSlippageSteps = 5;
const maxSlippage = 5.0;

const allNames = [];

function elementInArray(arr, e) {
  for (const elm of arr) {
    if (elm === e) return true;
  }

  return false;
}

function getName(assetIn, assetOut, slippage) {
  const name = assetIn + '_' + (slippage * 100).toString() + '_' + assetOut;
  if (!elementInArray(allNames, name)) {
    allNames.push(name);

    //spec += ({name}) + '\r\n'
  }

  //spec += ({name}) + '\r\n'
  //spec += ({name}) + '\r\n'
  //spec += (elementInArray(allNames,"a_5_usdc")) + '\r\n'
  return name;
}

function getLiquidity(assetIn, assetOut, slippage) {
  if (!(assetIn in liquidity)) return 0;
  const srcLiquidity = liquidity[assetIn];
  //spec += (Object.keys(srcLiquidity)) + '\r\n'
  if (!(assetOut in srcLiquidity)) return 0;

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
        const slippage = (step + 1) * slippageStep;

        // in edges
        if (getLiquidity(assetIn, assetOut, step) > 0 && assetOut !== src) {
          const name = getName(assetIn, assetOut, slippage);
          const weight = getLiquidity(assetIn, assetOut, step);

          inEqualsOutvectors[name] = 1;

          const weightVecotr = {};
          weightVecotr[name] = 1;
          constraints.push({ namedVector: weightVecotr, constraint: '<=', constant: weight });

          if (assetIn === src) {
            constraints.push({ namedVector: weightVecotr, constraint: '>=', constant: 0.0 });
            //constraints.push({"namedVector" : weightVecotr, "constraint" : "<=", "constant" : -1.0})
          }
        }

        // out edge
        if (getLiquidity(assetOut, assetIn, step) > 0) {
          const name = getName(assetOut, assetIn, slippage);
          const weight = getLiquidity(assetOut, assetIn, step);

          inEqualsOutvectors[name] = -1.0 * (1 - slippage);

          const weightVecotr = {};
          weightVecotr[name] = 1;
          constraints.push({ namedVector: weightVecotr, constraint: '<=', constant: weight });
        }
      }
    }

    // encode equality with <= and =>
    constraints.push({ namedVector: inEqualsOutvectors, constraint: '<=', constant: 0.0 });
    constraints.push({ namedVector: inEqualsOutvectors, constraint: '>=', constant: 0.0 });
  }

  //spec += (JSON.stringify(constraints, null, 4)) + '\r\n'
  return constraints;
}

function buildObjective(src, dst, liquidationBonus) {
  const objective = {};

  // what going out of src is negative. what enters dst is positive. liquidation bonus is discounted from negative.

  // encode src negative objective
  for (const asset of assets) {
    if (asset === src) continue;
    // Only assets going out
    for (let step = 0; step < numSlippageSteps; step++) {
      const slippage = (step + 1) * slippageStep;
      if (getLiquidity(src, asset, step) === 0) continue;

      const name = getName(src, asset, slippage); // USD-ETH-1000
      objective[name] = (1 - liquidationBonus) * -1; // -95%
    }
  }

  // encode dst positive objective
  for (const asset of assets) {
    if (asset === dst) continue;
    for (let step = 0; step < numSlippageSteps; step++) {
      const slippage = (step + 1) * slippageStep;
      if (getLiquidity(asset, dst, step) === 0) continue;

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
            if(getLiquidity(assetIn, assetOut, step) === 0) continue

            objective[getName(assetIn, assetOut, slippage)] = 0

        }
    }
}*/

  return objective;
}

function addSlackVariables(vector) {
  //spec += (elementInArray(allNames,"a_5_usdc")) + '\r\n'
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
    newConstraints.push({
      namedVector: addSlackVariables(c.namedVector),
      constraint: c.constraint,
      constant: c.constant
    });
    //spec += (newConstraints[newConstraints.length - 1].constraint) + '\r\n'
  }

  return newConstraints;
}

const constraints = addSlackVariablesToConstraints(buildConstraints('a', 'b'));
const objective = addSlackVariables(buildObjective('a', 'b', 0.05));

/*
 * objective: {"a_1_eth":-0.95,"a_2_eth":-0.95,"a_3_eth":-0.95,"a_4_eth":-0.95,"a_5_eth":-0.95,"a_1_usdc":-0.95,"a_2_usdc":-0.95,"a_3_usdc":-0.95,"a_4_usdc":-0.95,"a_5_usdc":-0.95,"dai_1_b":1
 */

for (const name of allNames) {
  spec += ('var ' + name + ' >= 0;') + '\r\n';
}

let objectiveString = 'maximize z: ';
let i = 0;
for (const key in Object(objective)) {
  if (objective[key] == 0) continue;
  if (i++ > 0) objectiveString += ' + ';
  objectiveString += '(' + objective[key].toString() + ') * ' + key;
}
objectiveString += ';';

spec += (objectiveString) + '\r\n';

for (const constraint of constraints) {
  let string = 'subject to c' + (i++).toString() + ': ';
  let j = 0;
  for (const key in Object(constraint.namedVector)) {
    if (constraint.namedVector[key] == 0) continue;
    if (j++ > 0) string += ' + ';
    string += '(' + constraint.namedVector[key].toString() + ') * ' + key;
  }

  string += ' ' + constraint.constraint + ' ' + constraint.constant.toString() + ';';
  spec += (string) + '\r\n';
}

spec += ('end;') + '\r\n';

async function test() {
  const lp_solve = require('lp_solve/build');
  const res = await lp_solve.executeGLPSol(spec);
}

test();
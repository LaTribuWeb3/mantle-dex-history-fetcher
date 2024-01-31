const { ethers, Contract, BigNumber } = require('ethers');

const fs = require('fs');
const { normalize, getConfTokenBySymbol } = require('../utils/token.utils');
const { tricryptoFactoryAbi } = require('./curve.config');
const BIGINT_1e18 = (BigInt(10) ** BigInt(18));

function getCurveDataforBlockInterval(dataDir, poolName, startBlock, endBlock) {
    const filePath = getCurveDataFile(dataDir, poolName);
    if(!filePath) {
        throw new Error(`Could not find pool data in ${dataDir}/curve/${poolName} for curve`);
    }

    // load the file in RAM
    const fileContent = fs.readFileSync(filePath, 'utf-8').split('\n');

    // header looks like: 
    // blocknumber,ampfactor,lp_supply_0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490,reserve_DAI_0x6B175474E89094C44Da98b954EedeAC495271d0F,reserve_USDC_0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,reserve_USDT_0xdAC17F958D2ee523a2206206994597C13D831ec7
    const headersSplitted = fileContent[0].split(',');
    if(headersSplitted.includes('gamma')) {
        return getCurveDataforBlockIntervalCryptoV2(fileContent, startBlock, endBlock);
    } else {
        const dataContents = {
            isCryptoV2: false,
            poolTokens: [], // ORDERED
            reserveValues: {},
        };

        for(let i = 3; i < headersSplitted.length; i++) {
        // save the symbol value into pool tokens
            dataContents.poolTokens.push(headersSplitted[i].split('_')[1]);
        }
    

        let lastValue = undefined;
        for(let i = 1; i < fileContent.length - 1; i++) {
            const line = fileContent[i];
            const splt = line.split(',');
            const blockNum = Number(splt[0]);

            if(blockNum > endBlock) {
                break;
            }

            // if blockNum inferior to startBlock, ignore but save last value
            if(blockNum < startBlock) {
                lastValue = {
                    blockNumber: blockNum,
                    lineValue: line.toString(),
                };
            } else {
            // here it means we went through the sinceBlock, save the last value before 
            // reaching sinceBlock to have one previous data
                if(lastValue && blockNum != startBlock) {
                    const beforeValueSplitted = lastValue.lineValue.split(',');
                    const lastValueBlock = lastValue.blockNumber;

                    dataContents.reserveValues[lastValueBlock] = {
                        ampFactor: Number(beforeValueSplitted[1]),
                        lpSupply: beforeValueSplitted[2]
                    };

                    for(let i = 3; i < beforeValueSplitted.length; i++) {
                        const token = dataContents.poolTokens[i-3];
                        dataContents.reserveValues[lastValueBlock][token] = beforeValueSplitted[i];
                    }

                    // set lastValue to null, meaning we already saved it
                    lastValue = null;
                }

                // save current value
                dataContents.reserveValues[blockNum] = {
                    ampFactor: Number(splt[1]),
                    lpSupply: splt[2]
                };

                for(let i = 3; i < splt.length; i++) {
                    const token = dataContents.poolTokens[i-3];
                    dataContents.reserveValues[blockNum][token] = splt[i];
                }
            }

        }

        return dataContents;
    }
}

/**
 * 
 * @param {string[]} fileContent 
 */
function getCurveDataforBlockIntervalCryptoV2(fileContent, startBlock, endBlock) {
    const headersSplitted = fileContent[0].split(',');
    const dataContents = {
        isCryptoV2: true,
        poolTokens: [], // ORDERED
        reserveValues: {},
    };

    for(let i = 5; i < headersSplitted.length; i++) {
        const type = headersSplitted[i].split('_')[0]; // reserve of price_scale

        if(type == 'reserve') {
            // save the symbol value into pool tokens
            dataContents.poolTokens.push(headersSplitted[i].split('_')[1]);
        }
    }

    let lastValue = undefined;
    for(let i = 1; i < fileContent.length - 1; i++) {
        const line = fileContent[i];
        const splt = line.split(',');
        const blockNum = Number(splt[0]);

        if(blockNum > endBlock) {
            break;
        }

        // if blockNum inferior to startBlock, ignore but save last value
        if(blockNum < startBlock) {
            lastValue = {
                blockNumber: blockNum,
                lineValue: line.toString(),
            };
        } else {
            // here it means we went through the sinceBlock, save the last value before 
            // reaching sinceBlock to have one previous data
            if(lastValue && blockNum != startBlock) {
                const beforeValueSplitted = lastValue.lineValue.split(',');
                const lastValueBlock = lastValue.blockNumber;

                dataContents.reserveValues[lastValueBlock] = {
                    ampFactor: Number(beforeValueSplitted[1]),
                    gamma: beforeValueSplitted[2],
                    D: beforeValueSplitted[3],
                    lpSupply: beforeValueSplitted[4],
                };

                for(let i = 0; i < dataContents.poolTokens.length; i++) {
                    const token = dataContents.poolTokens[i];
                    dataContents.reserveValues[lastValueBlock][token] = beforeValueSplitted[i+5];
                }

                dataContents.reserveValues[lastValueBlock].priceScale = [];
                for(let i = 0; i < dataContents.poolTokens.length - 1; i++) {
                    dataContents.reserveValues[lastValueBlock].priceScale.push(beforeValueSplitted[i+5+dataContents.poolTokens.length]);
                }

                // set lastValue to null, meaning we already saved it
                lastValue = null;
            }

            // save current value
            dataContents.reserveValues[blockNum] = {
                ampFactor: Number(splt[1]),
                gamma: splt[2],
                D: splt[3],
                lpSupply: splt[4],
            };
            
            for(let i = 0; i < dataContents.poolTokens.length; i++) {
                const token = dataContents.poolTokens[i];
                dataContents.reserveValues[blockNum][token] = splt[i+5];
            }

            dataContents.reserveValues[blockNum].priceScale = [];
            for(let i = 0; i < dataContents.poolTokens.length - 1; i++) {
                dataContents.reserveValues[blockNum].priceScale.push(splt[i+5+dataContents.poolTokens.length]);
            }
        }
    }

    return dataContents;
}

function getCurveDataFile(dataDir, poolName) {
    let path = `${dataDir}/curve/${poolName}_curve.csv`;

    if(fs.existsSync(path)) {
        return path;
    } else {
        return null;
    }
}

/**
 * Find the liquidity for slippage using curve data
 * Use binary search to find the value
 * This is the new computing formula: find the amount to sell to bring the new price to the target
 * @param {BigInt} baseQty 
 * @param {number} basePrice 
 * @param {number} targetPrice 
 * @param {BigInt[]} reserves 
 * @param {number} i 
 * @param {number} j 
 * @param {number} amplificationFactor
 */
function v2_computeLiquidityForSlippageCurvePool(baseQty, targetPrice, baseReserves, i, j, amplificationFactor) {
    let low = undefined;
    let high = undefined;
    let lowTo = undefined;
    let highTo = undefined;
    let qtyFrom = baseQty * 2n;
    const exitBoundsDiff = 0.1/100; // exit binary search when low and high bound have less than this amount difference
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const qtyTo = get_return(i, j, qtyFrom, baseReserves, amplificationFactor);
        const newReserves = [];
        for(const reserve of baseReserves) {
            newReserves.push(reserve);
        }

        // selling i for j mean more i and less j
        newReserves[i] += qtyFrom;
        newReserves[j] -= qtyTo;

        // get the new price for 1e18 (the min value for curve pool)
        const newQtyTo = get_return(i, j, BIGINT_1e18, newReserves, amplificationFactor);
        const normalizedFrom = normalize(BIGINT_1e18.toString(), 18);
        const normalizedTo = normalize(newQtyTo.toString(), 18);
        const currentPrice = normalizedTo / normalizedFrom;

        const variation = (Number(high) / Number(low)) - 1;
        // console.log(`DAI Qty: [${low ? normalize(BigNumber.from(low), 18) : '0'} <-> ${high ? normalize(BigNumber.from(high), 18) : '+∞'}]. Current price: 1 ${fromSymbol} = ${currentPrice} ${toSymbol}, targetPrice: ${targetPrice}. Try qty: ${normalizedFrom} ${fromSymbol} = ${normalizedTo} ${toSymbol}. variation: ${variation * 100}%`);
        if(low && high) {
            if(variation < exitBoundsDiff) {
                const base = (high + low) / 2n;
                const quote = (highTo + lowTo) / 2n;
                return {base, quote};
            }
        }

        if (currentPrice > targetPrice) {
            // current price too high, must increase qtyFrom
            low = qtyFrom;
            lowTo = qtyTo;

            if(!high) {
                // if high is undefined, just double next try qty
                qtyFrom = qtyFrom * 2n;
            } else {
                qtyFrom = qtyFrom + ((high - low) / 2n);
            }
        } else {
            // current price too low, must decrease qtyFrom
            high = qtyFrom;
            highTo = qtyTo;

            if(!low) {
                // if low is undefined, next try qty = qty / 2
                qtyFrom = qtyFrom / 2n;
            } else {
                qtyFrom = qtyFrom - ((high - low) / 2n);
            }
        }
    }
}


// this is the old function: avg slippage
function computeLiquidityForSlippageCurvePool(baseQty, targetPrice, reserves, i, j, amplificationFactor) {
    let low = undefined;
    let high = undefined;
    let qtyFrom = baseQty * 2n;
    const exitBoundsDiff = 0.1/100; // exit binary search when low and high bound have less than this amount difference
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const qtyTo = get_return(i, j, qtyFrom, reserves, amplificationFactor);
        const normalizedFrom = normalize(qtyFrom.toString(), 18);
        const normalizedTo = normalize(qtyTo.toString(), 18);
        const currentPrice = normalizedTo / normalizedFrom;

        const variation = (Number(high) / Number(low)) - 1;
        // console.log(`DAI Qty: [${low ? normalize(BigNumber.from(low), 18) : '0'} <-> ${high ? normalize(BigNumber.from(high), 18) : '+∞'}]. Current price: 1 ${fromSymbol} = ${currentPrice} ${toSymbol}, targetPrice: ${targetPrice}. Try qty: ${normalizedFrom} ${fromSymbol} = ${normalizedTo} ${toSymbol}. variation: ${variation * 100}%`);
        if(low && high) {
            if(variation < exitBoundsDiff) {
                return (high + low) / 2n;
            }
        }

        if (currentPrice > targetPrice) {
            // current price too high, must increase qtyFrom
            low = qtyFrom;

            if(!high) {
                // if high is undefined, just double next try qty
                qtyFrom = qtyFrom * 2n;
            } else {
                qtyFrom = qtyFrom + ((high - low) / 2n);
            }
        } else {
            // current price too low, must decrease qtyFrom
            high = qtyFrom;

            if(!low) {
                // if low is undefined, next try qty = qty / 2
                qtyFrom = qtyFrom / 2n;
            } else {
                qtyFrom = qtyFrom - ((high - low) / 2n);
            }
        }
    }
}


function v2_computeLiquidityForSlippageCurvePoolCryptoV2(baseAmountPrice, baseQty, targetPrice, baseReserves, i, j, amplificationFactor, gamma, D, priceScale, precisions, decimalsFrom, decimalsTo) {
    let low = undefined;
    let high = undefined;
    let lowTo = undefined;
    let highTo = undefined;
    let qtyFrom = baseQty * 2n;
    const exitBoundsDiff = 0.1/100; // exit binary search when low and high bound have less than this amount difference
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const qtyTo = get_dy_v2(i, j, qtyFrom, baseReserves, BigInt(baseReserves.length), amplificationFactor, gamma, D, priceScale, precisions);
        const newReserves = [];
        for(const reserve of baseReserves) {
            newReserves.push(reserve);
        }

        // selling i for j mean more i and less j
        newReserves[i] += qtyFrom;
        newReserves[j] -= qtyTo;

        // get the new price for one token
        const newQtyTo = get_dy_v2(i, j, baseAmountPrice, newReserves, BigInt(newReserves.length), amplificationFactor, gamma, D, priceScale, precisions);

        const normalizedFrom = normalize(baseAmountPrice.toString(), decimalsFrom);
        const normalizedTo = normalize(newQtyTo.toString(), decimalsTo);
        const currentPrice = normalizedTo / normalizedFrom;

        const variation = (Number(high) / Number(low)) - 1;
        // console.log(`WBTC Qty: [${low ? normalize(BigNumber.from(low), 18) : '0'} <-> ${high ? normalize(BigNumber.from(high), 18) : '+∞'}]. Current price: 1 WBTC = ${currentPrice} USDT, targetPrice: ${targetPrice}. Try qty: ${normalizedFrom} WBTC = ${normalizedTo} USDT. variation: ${variation * 100}%`);
        if(low && high) {
            if(variation < exitBoundsDiff) {
                const base = (high + low) / 2n;
                const quote = (highTo + lowTo) / 2n;
                return {base, quote};
            }
        }

        if (currentPrice > targetPrice) {
            // current price too high, must increase qtyFrom
            low = qtyFrom;
            lowTo = qtyTo;
            if(!high) {
                // if high is undefined, just double next try qty
                qtyFrom = qtyFrom * 2n;
            } else {
                qtyFrom = qtyFrom + ((high - low) / 2n);
            }
        } else {
            // current price too low, must decrease qtyFrom
            high = qtyFrom;
            highTo = qtyTo;

            if(!low) {
                // if low is undefined, next try qty = qty / 2
                qtyFrom = qtyFrom / 2n;
            } else {
                qtyFrom = qtyFrom - ((high - low) / 2n);
            }
        }
    }
}

// this is the old function: avg slippage
function computeLiquidityForSlippageCurvePoolCryptoV2(baseQty, targetPrice, reserves, i, j, amplificationFactor, gamma, D, priceScale, precisions, decimalsFrom, decimalsTo) {
    let low = undefined;
    let high = undefined;
    let qtyFrom = baseQty * 2n;
    const exitBoundsDiff = 0.1/100; // exit binary search when low and high bound have less than this amount difference
    // eslint-disable-next-line no-constant-condition
    while(true) {
        const qtyTo = get_dy_v2(i, j, qtyFrom, reserves, BigInt(reserves.length), amplificationFactor, gamma, D, priceScale, precisions);
        const normalizedFrom = normalize(qtyFrom.toString(), decimalsFrom);
        const normalizedTo = normalize(qtyTo.toString(), decimalsTo);
        const currentPrice = normalizedTo / normalizedFrom;

        const variation = (Number(high) / Number(low)) - 1;
        // console.log(`DAI Qty: [${low ? normalize(BigNumber.from(low), 18) : '0'} <-> ${high ? normalize(BigNumber.from(high), 18) : '+∞'}]. Current price: 1 ${fromSymbol} = ${currentPrice} ${toSymbol}, targetPrice: ${targetPrice}. Try qty: ${normalizedFrom} ${fromSymbol} = ${normalizedTo} ${toSymbol}. variation: ${variation * 100}%`);
        if(low && high) {
            if(variation < exitBoundsDiff) {
                return (high + low) / 2n;
            }
        }

        if (currentPrice > targetPrice) {
            // current price too high, must increase qtyFrom
            low = qtyFrom;

            if(!high) {
                // if high is undefined, just double next try qty
                qtyFrom = qtyFrom * 2n;
            } else {
                qtyFrom = qtyFrom + ((high - low) / 2n);
            }
        } else {
            // current price too low, must decrease qtyFrom
            high = qtyFrom;

            if(!low) {
                // if low is undefined, next try qty = qty / 2
                qtyFrom = qtyFrom / 2n;
            } else {
                qtyFrom = qtyFrom - ((high - low) / 2n);
            }
        }
    }
}

/* CURVE PRICE ALGORITHM FUNCTIONS */

/**
 * get the virtual price
 * @param {BigInt[]} xp array of balances, all in 'wei' (1e18)
 * @param {BigInt} N_COINS number of coins
 * @param {BigInt} A Amplification factor
 * @param {number} tokenSupply normalized token total supply
 * @returns {number} virtual price with good decimal place
 */
// function get_virtual_price(xp, N_COINS, A, tokenSupply) {
//     const D = get_D(xp, N_COINS, A);
//     return normalize(D.toString(), 18) / tokenSupply;
// }


/**
 * 
 * @param {BigInt[]} xp array of balances, all in 'wei' (1e18)
 * @param {BigInt} N_COINS number of coins
 * @param {BigInt} A Amplification factor
 * @returns 
 */
function get_D(xp, N_COINS, A) {
    let S = 0n;
    for (const _x of xp) {
        S += _x;
    }

    if (S == 0)
        return 0n;    

    let Dprev = 0;
    let D = S;
    const Ann = A * N_COINS;
    for (let _i = 0 ; _i < 255 ; _i++) {
        let D_P = D;
        for (const _x of xp)
            D_P = D_P * D / (_x * N_COINS + 1n);  // +1 is to prevent /0
        Dprev = D;
        D = (Ann * S + D_P * N_COINS) * D / ((Ann - 1n) * D + (N_COINS + 1n) * D_P);
        // Equality with the precision of 1
        if (D > Dprev)
            if (D - Dprev <= 1n)
                break;
            else
            if (Dprev - D <= 1n)
                break;
    }
    return D;
}

function get_y(i, j, x, _xp, N_COINS, A) {
    // x in the input is converted to the same price/precision
    //assert (i != j) and (i >= 0) and (j >= 0) and (i < N_COINS) and (j < N_COINS)

    const D = get_D(_xp, N_COINS, A);
    let c = D;
    let S_ = 0n;
    const Ann = A * N_COINS;

    let _x = 0n;
    for (let _i = 0 ; _i < N_COINS ; _i++) {
        if (_i == i)
            _x = x;
        else if (_i != j)
            _x = _xp[_i];
        else
            continue;
        S_ += _x;
        c = c * D / (_x * N_COINS);
    }
    c = c * D / (Ann * N_COINS);
    const b = S_ + D / Ann;  // - D
    let y_prev = 0n;
    let y = D;
    for (let _i = 0 ; _i < 255 ; _i++) {
        y_prev = y;
        y = (y*y + c) / (2n * y + b - D);
        // Equality with the precision of 1
        if (y > y_prev)
            if (y - y_prev <= 1n)
                break;
            else
            if (y_prev - y <= 1n)
                break;
    }

    return _xp[j] - y;
}

/**
 * 
 * @param {*} i 
 * @param {*} j 
 * @param {*} dx 
 * @param {*} reserves 
 * @param {Number} N_COINS 
 * @param {*} A 
 * @param {*} gamma 
 * @param {*} D 
 * @param {*} price_scale 
 * @returns 
 */
function get_dy_v2(i, j, dx, reserves, N_COINS, A, gamma, D, price_scale, precisions) {

    // xp: uint256[N_COINS] = empty(uint256[N_COINS])
    // for k in range(N_COINS):
    // xp[k] = Curve(msg.sender).balances(k)
    const xp = [];
    for(let k = 0; k < N_COINS; k++) {
        xp[k] = structuredClone(reserves[k]);
    }

    // xp[i] += dx
    // xp[0] *= precisions[0]
    xp[i] += dx;
    xp[0] *= precisions[0];   

    // for k in range(N_COINS-1):
    // xp[k+1] = xp[k+1] * price_scale[k] * precisions[k+1] / PRECISION
    for(let k = 0 ; k < N_COINS -1n; k++) {
        xp[k+1] = xp[k+1] * price_scale[k] * precisions[k+1] / 10n**18n;
    }

    // y: uint256 = Math(self.math).newton_y(A, gamma, xp, Curve(msg.sender).D(), j)
    const y = get_newton_y(A, gamma, xp, D, j, N_COINS);

    // dy: uint256 = xp[j] - y - 1
    let dy = xp[j] - y - 1n;

    
    // if j > 0:
    // dy = dy * PRECISION / price_scale[j-1]
    if(j > 0) {
        dy = dy * 10n**18n / price_scale[j-1];
    }

    // dy /= precisions[j]
    dy = dy / precisions[j];

    return dy;
}
const A_MULTIPLIER = 10000n;

const bigIntMax = (...args) => args.reduce((m, e) => e > m ? e : m);
// const bigIntMin = (...args) => args.reduce((m, e) => e < m ? e : m);

/**
     * 
     * @param {*} A 
     * @param {*} gamma 
     * @param {BigInt[]} reserves 
     * @param {*} D 
     * @param {*} i 
     * @param {*} N_COINS 
     */
function get_newton_y(ANN, gamma, reserves, D, i, N_COINS) {
    // y: uint256 = D / N_COINS
    // K0_i: uint256 = 10**18
    // S_i: uint256 = 0
    let y = D / N_COINS;
    let K0_i = 10n ** 18n;
    let S_i = 0n;

    // x_sorted: uint256[N_COINS] = x
    // x_sorted[i] = 0
    // x_sorted = self.sort(x_sorted)  # From high to low
    const x_sorted =  structuredClone(reserves);
    x_sorted[i] = 0n;
    x_sorted.sort((a, b) => (a < b) ? 1 : ((a > b) ? -1 : 0));
    
    //convergence_limit: uint256 = max(max(x_sorted[0] / 10**14, D / 10**14), 100)
    const convergence_limit = bigIntMax(bigIntMax(x_sorted[0] / 10n ** 14n, D / 10n**14n), 100n);

    // for j in range(2, N_COINS+1):
    //     _x: uint256 = x_sorted[N_COINS-j]
    //     y = y * D / (_x * N_COINS)  # Small _x first
    //     S_i += _x
    for(let j = 2n; j < N_COINS + 1n; j++) {
        const _x = x_sorted[N_COINS-j];
        y = y * D / (_x * N_COINS);
        S_i += _x;
    }    

    // for j in range(N_COINS-1):
    //     K0_i = K0_i * x_sorted[j] * N_COINS / D  # Large _x first
    for(let j = 0; j < N_COINS-1n; j++) {
        K0_i = K0_i * x_sorted[j] * N_COINS / D;
    }

    // for j in range(255):
    for(let j = 0; j < 255; j++) {
        // y_prev: uint256 = y
        const y_prev = y;

        // K0: uint256 = K0_i * y * N_COINS / D
        // S: uint256 = S_i + y
        const K0 = K0_i * y * N_COINS / D;
        const S = S_i + y;

        // _g1k0: uint256 = gamma + 10**18
        // if _g1k0 > K0:
        //     _g1k0 = _g1k0 - K0 + 1
        // else:
        //     _g1k0 = K0 - _g1k0 + 1
        let _g1k0 = gamma + 10n**18n;
        if(_g1k0 > K0) {
            _g1k0 = _g1k0 - K0 + 1n;
        } else {
            _g1k0 = K0 - _g1k0 + 1n;
        }

        // # D / (A * N**N) * _g1k0**2 / gamma**2
        // mul1: uint256 = 10**18 * D / gamma * _g1k0 / gamma * _g1k0 * A_MULTIPLIER / ANN
        const mul1 = 10n**18n * D / gamma * _g1k0 / gamma * _g1k0 * A_MULTIPLIER / ANN;

        // # 2*K0 / _g1k0
        // mul2: uint256 = 10**18 + (2 * 10**18) * K0 / _g1k0
        const mul2 = 10n**18n + (2n * 10n**18n) * K0 / _g1k0;

        // yfprime: uint256 = 10**18 * y + S * mul2 + mul1
        // _dyfprime: uint256 = D * mul2
        let yfprime = 10n**18n * y + S * mul2 + mul1;
        const _dyfprime = D * mul2;

        // if yfprime < _dyfprime:
        //     y = y_prev / 2
        //     continue
        // else:
        //     yfprime -= _dyfprime
        if(yfprime < _dyfprime) {
            y = y_prev / 2;
            continue;
        } else {
            yfprime -= _dyfprime;
        }

        // fprime: uint256 = yfprime / y
        const fprime = yfprime / y;

        // # y -= f / f_prime;  y = (y * fprime - f) / fprime
        // # y = (yfprime + 10**18 * D - 10**18 * S) // fprime + mul1 // fprime * (10**18 - K0) // K0
        // y_minus: uint256 = mul1 / fprime
        // y_plus: uint256 = (yfprime + 10**18 * D) / fprime + y_minus * 10**18 / K0
        // y_minus += 10**18 * S / fprime
        let y_minus = mul1 / fprime;
        const y_plus = (yfprime + 10n**18n * D) / fprime + y_minus * 10n**18n / K0;
        y_minus += 10n**18n * S / fprime;

        // if y_plus < y_minus:
        //     y = y_prev / 2
        // else:
        //     y = y_plus - y_minus
        if(y_plus < y_minus) {
            y = y_prev / 2;
        } else {
            y = y_plus - y_minus;
        }

        // diff: uint256 = 0
        // if y > y_prev:
        //     diff = y - y_prev
        // else:
        //     diff = y_prev - y
        let diff = 0n;
        if(y > y_prev) {
            diff = y - y_prev;
        } else {
            diff = y_prev - y;
        }

        // if diff < max(convergence_limit, y / 10**14):
        //     frac: uint256 = y * 10**18 / D
        //     assert (frac > 10**16 - 1) and (frac < 10**20 + 1)  # dev: unsafe value for y
        //     return y

        if(diff < bigIntMax(convergence_limit, y / 10n**14n)) {
            return y;
        }
    }

    throw new Error('Did not converge');
}


/**
 * get the amount of token j you will receive when selling 'x' amount of i
 * all amount should be with the same precision, in wei preferably (1e18 decimals)
 * @param {number} i position (in 'balances' array) of token to sell
 * @param {number} j position (in 'balances' array) of token to buy
 * @param {BigInt} x amount of token i to sell in wei (1e18 decimals)
 * @param {BigInt[]} balances balances of each coins in the pool, in wei (1e18 decimals)
 * @param {number} A amplification factor of the pool
 * @returns 
 */
function get_return(i, j, x, balances, A) {
    return get_y(i, j, x + balances[i], balances, BigInt(balances.length), BigInt(A));
}

function getAvailableCurve(dataDir) {
    const summary = JSON.parse(fs.readFileSync(`${dataDir}/curve/curve_pools_summary.json`));
    const available = {};
    for (const poolName of Object.keys(summary)) {
        for (const [token, reserveValue] of Object.entries(summary[poolName])) {
            if (!available[token]) {
                available[token] = {};
            }

            for (const [tokenB, reserveValueB] of Object.entries(summary[poolName])) {
                if (tokenB === token) {
                    continue;
                }

                available[token][tokenB] = available[token][tokenB] || {};
                available[token][tokenB][poolName] = available[token][tokenB][poolName] || {};
                available[token][tokenB][poolName][token] = reserveValue;
                available[token][tokenB][poolName][tokenB] = reserveValueB;
            }
        }
    }
    return available;
}

/**
 * 
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {string[]} poolTokens 
 * @param {number} ampFactor
 * @param {string[]} reserves 
 */
function computePriceAndSlippageMapForReserveValue(fromSymbol, toSymbol, poolTokens, ampFactor, reserves) {
    if(poolTokens.length != reserves.length) {
        throw new Error('Tokens array must be same length as reserves array');
    }

    const tokenConfs = [];
    for(const poolToken of poolTokens) {
        tokenConfs.push(getConfTokenBySymbol(poolToken));
    }

    const reservesNorm18Dec = getReservesNormalizedTo18Decimals(tokenConfs, reserves);
    
    const indexFrom = poolTokens.indexOf(fromSymbol);
    const indexTo = poolTokens.indexOf(toSymbol);
    const returnVal = get_return(indexFrom, indexTo, BIGINT_1e18, reservesNorm18Dec, ampFactor);
    const price = normalize(returnVal.toString(), 18);
    const slippageMap = {};
    let lastAmount = BIGINT_1e18;
    for(let slippageBps = 50; slippageBps <= 2000; slippageBps += 50) {
        const targetPrice = price - (price * slippageBps / 10000);
        const liquidityObj = v2_computeLiquidityForSlippageCurvePool(lastAmount, targetPrice, reservesNorm18Dec, indexFrom, indexTo, ampFactor);
        const liquidityAtSlippage = normalize(liquidityObj.base.toString(), 18);
        const quoteObtainedAtSlippage = normalize(liquidityObj.quote.toString(), 18);
        lastAmount = liquidityObj.base;
        slippageMap[slippageBps] = {base: liquidityAtSlippage, quote: quoteObtainedAtSlippage};
    }

    return {price, slippageMap};
}

const baseAmountMap = {
    'DAI': 1000n * 10n**18n, // 1000 DAI ~= 1000$
    'USDT': 1000n * 10n**6n, // 1000 USDT ~= 1000$
    'sUSD': 1000n * 10n**18n, // 1000 sUSD ~= 1000$
    'USDC': 1000n * 10n**6n, // 1000 USDC ~= 1000$
    'WETH': 5n * 10n**17n, // 0.5 ETH ~= 1000$
    'stETH': 5n * 10n**17n, // 0.5 stETH ~= 1000$
    'rETH': 5n * 10n**17n, // 0.5 stETH ~= 1000$
    'cbETH': 5n * 10n**17n, // 0.5 cbETH ~= 1000$
    'WBTC': 4n * 10n**6n, // 0.04 WBTC ~= 1000$
};

/**
 * 
 * @param {string} fromSymbol 
 * @param {string} toSymbol 
 * @param {string[]} poolTokens 
 * @param {number} ampFactor
 * @param {string[]} reserves 
 */
function computePriceAndSlippageMapForReserveValueCryptoV2(fromSymbol, toSymbol, poolTokens, ampFactor, reserves, precisions, gamma, D, priceScale) {
    if(poolTokens.length != reserves.length) {
        throw new Error('Tokens array must be same length as reserves array');
    }

    reserves = reserves.map(_ => BigInt(_));
    priceScale = priceScale.map(_ => BigInt(_));
    ampFactor = BigInt(ampFactor);
    gamma = BigInt(gamma);
    D = BigInt(D);
    
    const indexFrom = poolTokens.indexOf(fromSymbol);
    const indexTo = poolTokens.indexOf(toSymbol);
    const fromConf = getConfTokenBySymbol(fromSymbol);
    const toConf = getConfTokenBySymbol(toSymbol);
    let baseAmount = baseAmountMap[fromSymbol];
    if(!baseAmount) {
        console.warn(`No base amount for ${fromSymbol}`);
        baseAmount = 10n**BigInt(fromConf.decimals);
    }

    const returnVal = get_dy_v2(indexFrom, indexTo, baseAmount, reserves, BigInt(poolTokens.length), BigInt(ampFactor), BigInt(gamma), BigInt(D), priceScale, precisions);
    const price = normalize(returnVal.toString(), toConf.decimals) / normalize(baseAmount, fromConf.decimals);
    // console.log(price);
    // const invPrice = 1 / price;
    // console.log(invPrice);
    const slippageMap = {};
    let lastAmount = baseAmount;
    for(let slippageBps = 50; slippageBps <= 2000; slippageBps += 50) {
        const targetPrice = price - (price * slippageBps / 10000);
        const liquidityObj = v2_computeLiquidityForSlippageCurvePoolCryptoV2(baseAmount, lastAmount, targetPrice, reserves, indexFrom, indexTo, ampFactor, gamma, D, priceScale, precisions, fromConf.decimals, toConf.decimals);
        const liquidityAtSlippage = normalize(liquidityObj.base.toString(), fromConf.decimals);
        const quoteObtainedAtSlippage = normalize(liquidityObj.quote.toString(), toConf.decimals);
        lastAmount = liquidityObj.base;
        
        slippageMap[slippageBps] =  {base: liquidityAtSlippage, quote: quoteObtainedAtSlippage};
    }

    return {price, slippageMap};
}

/**
 * 
 * @param {tokenConf[]} tokens 
 * @param {string[]} reserves 
 * @returns 
 */
function getReservesNormalizedTo18Decimals(tokens, reserves) {
    if(tokens.length != reserves.length) {
        throw new Error('Tokens array must be same length as reserves array');
    }
    const reservesNorm = [];

    for(let i = 0; i < reserves.length; i++) {
        const tokenReserve18DecimalStr = reserves[i] + ''.padEnd(18 - tokens[i].decimals, '0');
        reservesNorm.push(BigInt(tokenReserve18DecimalStr));
    }

    return reservesNorm;
}



// function testNewCompute() {
//     const data = computePriceAndSlippageMapForReserveValue('WETH', 'stETH', ['WETH', 'stETH'], 30, ['79015703658069886024138', '79588585062930050790420']);
//     console.log(data);
// }

// testNewCompute();


// eslint-disable-next-line quotes
const tricryptoAbi = [{"name":"TokenExchange","inputs":[{"name":"buyer","type":"address","indexed":true},{"name":"sold_id","type":"uint256","indexed":false},{"name":"tokens_sold","type":"uint256","indexed":false},{"name":"bought_id","type":"uint256","indexed":false},{"name":"tokens_bought","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"AddLiquidity","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amounts","type":"uint256[3]","indexed":false},{"name":"fee","type":"uint256","indexed":false},{"name":"token_supply","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidity","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amounts","type":"uint256[3]","indexed":false},{"name":"token_supply","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidityOne","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amount","type":"uint256","indexed":false},{"name":"coin_index","type":"uint256","indexed":false},{"name":"coin_amount","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"CommitNewAdmin","inputs":[{"name":"deadline","type":"uint256","indexed":true},{"name":"admin","type":"address","indexed":true}],"anonymous":false,"type":"event"},{"name":"NewAdmin","inputs":[{"name":"admin","type":"address","indexed":true}],"anonymous":false,"type":"event"},{"name":"CommitNewParameters","inputs":[{"name":"deadline","type":"uint256","indexed":true},{"name":"admin_fee","type":"uint256","indexed":false},{"name":"mid_fee","type":"uint256","indexed":false},{"name":"out_fee","type":"uint256","indexed":false},{"name":"fee_gamma","type":"uint256","indexed":false},{"name":"allowed_extra_profit","type":"uint256","indexed":false},{"name":"adjustment_step","type":"uint256","indexed":false},{"name":"ma_half_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"NewParameters","inputs":[{"name":"admin_fee","type":"uint256","indexed":false},{"name":"mid_fee","type":"uint256","indexed":false},{"name":"out_fee","type":"uint256","indexed":false},{"name":"fee_gamma","type":"uint256","indexed":false},{"name":"allowed_extra_profit","type":"uint256","indexed":false},{"name":"adjustment_step","type":"uint256","indexed":false},{"name":"ma_half_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RampAgamma","inputs":[{"name":"initial_A","type":"uint256","indexed":false},{"name":"future_A","type":"uint256","indexed":false},{"name":"initial_gamma","type":"uint256","indexed":false},{"name":"future_gamma","type":"uint256","indexed":false},{"name":"initial_time","type":"uint256","indexed":false},{"name":"future_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"StopRampA","inputs":[{"name":"current_A","type":"uint256","indexed":false},{"name":"current_gamma","type":"uint256","indexed":false},{"name":"time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"ClaimAdminFee","inputs":[{"name":"admin","type":"address","indexed":true},{"name":"tokens","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"owner","type":"address"},{"name":"admin_fee_receiver","type":"address"},{"name":"A","type":"uint256"},{"name":"gamma","type":"uint256"},{"name":"mid_fee","type":"uint256"},{"name":"out_fee","type":"uint256"},{"name":"allowed_extra_profit","type":"uint256"},{"name":"fee_gamma","type":"uint256"},{"name":"adjustment_step","type":"uint256"},{"name":"admin_fee","type":"uint256"},{"name":"ma_half_time","type":"uint256"},{"name":"initial_prices","type":"uint256[2]"}],"outputs":[]},{"stateMutability":"payable","type":"fallback"},{"stateMutability":"view","type":"function","name":"price_oracle","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"price_scale","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"last_prices","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"token","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"coins","inputs":[{"name":"i","type":"uint256"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"A","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"fee_calc","inputs":[{"name":"xp","type":"uint256[3]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_virtual_price","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"}],"outputs":[]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"use_eth","type":"bool"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"get_dy","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"calc_token_fee","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"xp","type":"uint256[3]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"add_liquidity","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"min_mint_amount","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity","inputs":[{"name":"_amount","type":"uint256"},{"name":"min_amounts","type":"uint256[3]"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"calc_token_amount","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"deposit","type":"bool"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"calc_withdraw_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"},{"name":"min_amount","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"claim_admin_fees","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"ramp_A_gamma","inputs":[{"name":"future_A","type":"uint256"},{"name":"future_gamma","type":"uint256"},{"name":"future_time","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"stop_ramp_A_gamma","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"commit_new_parameters","inputs":[{"name":"_new_mid_fee","type":"uint256"},{"name":"_new_out_fee","type":"uint256"},{"name":"_new_admin_fee","type":"uint256"},{"name":"_new_fee_gamma","type":"uint256"},{"name":"_new_allowed_extra_profit","type":"uint256"},{"name":"_new_adjustment_step","type":"uint256"},{"name":"_new_ma_half_time","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"apply_new_parameters","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"revert_new_parameters","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"commit_transfer_ownership","inputs":[{"name":"_owner","type":"address"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"apply_transfer_ownership","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"revert_transfer_ownership","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"kill_me","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"unkill_me","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"set_admin_fee_receiver","inputs":[{"name":"_admin_fee_receiver","type":"address"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"last_prices_timestamp","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"initial_A_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_A_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"initial_A_gamma_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_A_gamma_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"allowed_extra_profit","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_allowed_extra_profit","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"fee_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_fee_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"adjustment_step","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_adjustment_step","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"ma_half_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_ma_half_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"mid_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"out_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"admin_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_mid_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_out_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_admin_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"balances","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"D","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"owner","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"future_owner","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"xcp_profit","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"xcp_profit_a","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"virtual_price","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"is_killed","inputs":[],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"view","type":"function","name":"kill_deadline","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"transfer_ownership_deadline","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"admin_actions_deadline","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"admin_fee_receiver","inputs":[],"outputs":[{"name":"","type":"address"}]}];

async function test_new_dy() {
    require('dotenv').config();

    const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
    const tricryptoContract = new Contract('0xd51a44d3fae010294c616388b506acda1bfaae46', tricryptoAbi, web3Provider);
    const A = await tricryptoContract.A();
    const gamma = await tricryptoContract.gamma();
    const D = await tricryptoContract.D();

    const reserves = [
        BigInt((await tricryptoContract.balances(0)).toString()),
        BigInt((await tricryptoContract.balances(1)).toString()),
        BigInt((await tricryptoContract.balances(2)).toString())
    ];

    const priceScale = [
        BigInt((await tricryptoContract.price_scale(0)).toString()),
        BigInt((await tricryptoContract.price_scale(1)).toString()),
    ];

    const precisions = [
        1000000000000n,
        10000000000n,
        1n,
    ];

    // const dx = BigNumber.from(10000000).mul(BigNumber.from(10).pow(6));

    // const realDy = await tricryptoContract.get_dy(0, 1, dx);

    //  y = 3683879

    const slippageMap = computePriceAndSlippageMapForReserveValueCryptoV2('WETH', 'USDT', ['USDT', 'WBTC', 'WETH'], A.toString(), reserves, precisions, gamma.toString(), D.toString(), priceScale)

    console.log(slippageMap);
    console.log(`computed liquidity for 5% slippage: ${slippageMap.slippageMap[500]} USDT vs WBTC`);
    // const y = get_dy_v2(0, 1, BigInt(dx.toString()), reserves, 3n, BigInt(A.toString()), BigInt(gamma.toString()), BigInt(D.toString()), priceScale, precisions);
    

    // console.log(realDy.toString(), '<<< contract result from get_dy()', );
    // console.log(y, '<<< javascript result from same data');
    // console.log(normalize(realDy.toString(), 8), '<<< normalized contract result from get_dy()', );
    // console.log(normalize(y.toString(), 8), '<<< normalized javascript result from same data');
    // console.log(normalize(y.toString(), 8) * (1 - 0.042/100), '<<< normalized javascript with fees from same data');
}

// test_new_dy();

module.exports = { getAvailableCurve, getCurveDataforBlockInterval, computePriceAndSlippageMapForReserveValue, computePriceAndSlippageMapForReserveValueCryptoV2 };

const { default: BigNumber } = require('bignumber.js');
const { getRollingVolatility } = require('../src/data.interface/data.interface');
const { getConfTokenBySymbol, normalize } = require('../src/utils/token.utils');
const { ethers, Contract } = require('ethers');
const { BN_1e18 } = require('../src/utils/constants');
const dotenv = require('dotenv');
const { sleep } = require('../src/utils/utils');
dotenv.config();

// eslint-disable-next-line quotes
const SPythiaAbi = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"EIP712DOMAIN_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"RISKDATA_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"chainId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"collateralAsset","type":"address"},{"internalType":"address","name":"debtAsset","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"volatility","type":"uint256"},{"internalType":"uint256","name":"lastUpdate","type":"uint256"},{"internalType":"uint256","name":"chainId","type":"uint256"}],"internalType":"struct SPythia.RiskData","name":"data","type":"tuple"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"getSigner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"collateralAsset","type":"address"},{"internalType":"address","name":"debtAsset","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"volatility","type":"uint256"},{"internalType":"uint256","name":"lastUpdate","type":"uint256"},{"internalType":"uint256","name":"chainId","type":"uint256"}],"internalType":"struct SPythia.RiskData","name":"data","type":"tuple"}],"name":"hashStruct","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"pure","type":"function"},{"inputs":[{"components":[{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"version","type":"string"},{"internalType":"uint256","name":"chainId","type":"uint256"},{"internalType":"address","name":"verifyingContract","type":"address"}],"internalType":"struct SPythia.EIP712Domain","name":"eip712Domain","type":"tuple"}],"name":"hashStruct","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"pure","type":"function"}];
// eslint-disable-next-line quotes
const allocatorAbi = [{"inputs":[{"internalType":"contract SmartLTV","name":"smartLTV","type":"address"},{"internalType":"address","name":"morphoVaultAddress","type":"address"},{"internalType":"address","name":"initialOwner","type":"address"},{"internalType":"uint256","name":"riskLevel","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"uint256","name":"a","type":"uint256"},{"internalType":"uint256","name":"b","type":"uint256"}],"name":"INVALID_RISK_DATA_COUNT","type":"error"},{"inputs":[{"internalType":"uint256","name":"a","type":"uint256"},{"internalType":"uint256","name":"b","type":"uint256"}],"name":"INVALID_SIGNATURE_COUNT","type":"error"},{"inputs":[{"internalType":"uint256","name":"ltv","type":"uint256"},{"internalType":"uint256","name":"maxLtv","type":"uint256"}],"name":"LTV_TOO_HIGH","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"inputs":[],"name":"METAMORPHO_VAULT","outputs":[{"internalType":"contract IMetaMorpho","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MIN_CLF","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SMART_LTV","outputs":[{"internalType":"contract SmartLTV","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"}],"internalType":"struct MarketAllocation[]","name":"allocations","type":"tuple[]"},{"components":[{"internalType":"address","name":"collateralAsset","type":"address"},{"internalType":"address","name":"debtAsset","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"volatility","type":"uint256"},{"internalType":"uint256","name":"lastUpdate","type":"uint256"},{"internalType":"uint256","name":"chainId","type":"uint256"}],"internalType":"struct RiskData[]","name":"riskDatas","type":"tuple[]"},{"components":[{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"internalType":"struct Signature[]","name":"signatures","type":"tuple[]"}],"name":"checkAndReallocate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}];

// eslint-disable-next-line quotes
const morphoAbi = [{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"}],"name":"accrueInterest","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"address","name":"receiver","type":"address"}],"name":"borrow","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"}],"name":"createMarket","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"irm","type":"address"}],"name":"enableIrm","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"lltv","type":"uint256"}],"name":"enableLltv","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"slots","type":"bytes32[]"}],"name":"extSloads","outputs":[{"internalType":"bytes32[]","name":"res","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"flashLoan","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id","name":"","type":"bytes32"}],"name":"idToMarketParams","outputs":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"isAuthorized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"isIrmEnabled","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"isLltvEnabled","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"address","name":"borrower","type":"address"},{"internalType":"uint256","name":"seizedAssets","type":"uint256"},{"internalType":"uint256","name":"repaidShares","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"liquidate","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id","name":"","type":"bytes32"}],"name":"market","outputs":[{"internalType":"uint128","name":"totalSupplyAssets","type":"uint128"},{"internalType":"uint128","name":"totalSupplyShares","type":"uint128"},{"internalType":"uint128","name":"totalBorrowAssets","type":"uint128"},{"internalType":"uint128","name":"totalBorrowShares","type":"uint128"},{"internalType":"uint128","name":"lastUpdate","type":"uint128"},{"internalType":"uint128","name":"fee","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonce","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"Id","name":"","type":"bytes32"},{"internalType":"address","name":"","type":"address"}],"name":"position","outputs":[{"internalType":"uint256","name":"supplyShares","type":"uint256"},{"internalType":"uint128","name":"borrowShares","type":"uint128"},{"internalType":"uint128","name":"collateral","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"repay","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"authorized","type":"address"},{"internalType":"bool","name":"newIsAuthorized","type":"bool"}],"name":"setAuthorization","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"authorizer","type":"address"},{"internalType":"address","name":"authorized","type":"address"},{"internalType":"bool","name":"isAuthorized","type":"bool"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"internalType":"struct Authorization","name":"authorization","type":"tuple"},{"components":[{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"internalType":"struct Signature","name":"signature","type":"tuple"}],"name":"setAuthorizationWithSig","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newFeeRecipient","type":"address"}],"name":"setFeeRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"setOwner","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"supply","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"supplyCollateral","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"address","name":"receiver","type":"address"}],"name":"withdraw","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"address","name":"onBehalf","type":"address"},{"internalType":"address","name":"receiver","type":"address"}],"name":"withdrawCollateral","outputs":[],"stateMutability":"nonpayable","type":"function"}];
// eslint-disable-next-line quotes
const metamorphoAbi = [{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"morpho","type":"address"},{"internalType":"uint256","name":"initialTimelock","type":"uint256"},{"internalType":"address","name":"_asset","type":"address"},{"internalType":"string","name":"_name","type":"string"},{"internalType":"string","name":"_symbol","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"AboveMaxTimelock","type":"error"},{"inputs":[{"internalType":"address","name":"target","type":"address"}],"name":"AddressEmptyCode","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"AddressInsufficientBalance","type":"error"},{"inputs":[],"name":"AllCapsReached","type":"error"},{"inputs":[],"name":"AlreadyPending","type":"error"},{"inputs":[],"name":"AlreadySet","type":"error"},{"inputs":[],"name":"BelowMinTimelock","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"DuplicateMarket","type":"error"},{"inputs":[],"name":"ECDSAInvalidSignature","type":"error"},{"inputs":[{"internalType":"uint256","name":"length","type":"uint256"}],"name":"ECDSAInvalidSignatureLength","type":"error"},{"inputs":[{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"ECDSAInvalidSignatureS","type":"error"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"allowance","type":"uint256"},{"internalType":"uint256","name":"needed","type":"uint256"}],"name":"ERC20InsufficientAllowance","type":"error"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"uint256","name":"balance","type":"uint256"},{"internalType":"uint256","name":"needed","type":"uint256"}],"name":"ERC20InsufficientBalance","type":"error"},{"inputs":[{"internalType":"address","name":"approver","type":"address"}],"name":"ERC20InvalidApprover","type":"error"},{"inputs":[{"internalType":"address","name":"receiver","type":"address"}],"name":"ERC20InvalidReceiver","type":"error"},{"inputs":[{"internalType":"address","name":"sender","type":"address"}],"name":"ERC20InvalidSender","type":"error"},{"inputs":[{"internalType":"address","name":"spender","type":"address"}],"name":"ERC20InvalidSpender","type":"error"},{"inputs":[{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"ERC2612ExpiredSignature","type":"error"},{"inputs":[{"internalType":"address","name":"signer","type":"address"},{"internalType":"address","name":"owner","type":"address"}],"name":"ERC2612InvalidSigner","type":"error"},{"inputs":[{"internalType":"address","name":"receiver","type":"address"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"max","type":"uint256"}],"name":"ERC4626ExceededMaxDeposit","type":"error"},{"inputs":[{"internalType":"address","name":"receiver","type":"address"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"uint256","name":"max","type":"uint256"}],"name":"ERC4626ExceededMaxMint","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"uint256","name":"max","type":"uint256"}],"name":"ERC4626ExceededMaxRedeem","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"uint256","name":"max","type":"uint256"}],"name":"ERC4626ExceededMaxWithdraw","type":"error"},{"inputs":[],"name":"FailedInnerCall","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"InconsistentAsset","type":"error"},{"inputs":[],"name":"InconsistentReallocation","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"currentNonce","type":"uint256"}],"name":"InvalidAccountNonce","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"InvalidMarketRemovalNonZeroCap","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"InvalidMarketRemovalNonZeroSupply","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"InvalidMarketRemovalTimelockNotElapsed","type":"error"},{"inputs":[],"name":"InvalidShortString","type":"error"},{"inputs":[],"name":"MarketNotCreated","type":"error"},{"inputs":[],"name":"MarketNotEnabled","type":"error"},{"inputs":[],"name":"MathOverflowedMulDiv","type":"error"},{"inputs":[],"name":"MaxFeeExceeded","type":"error"},{"inputs":[],"name":"MaxQueueLengthExceeded","type":"error"},{"inputs":[],"name":"NoPendingValue","type":"error"},{"inputs":[],"name":"NotAllocatorRole","type":"error"},{"inputs":[],"name":"NotCuratorNorGuardianRole","type":"error"},{"inputs":[],"name":"NotCuratorRole","type":"error"},{"inputs":[],"name":"NotGuardianRole","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"inputs":[{"internalType":"uint8","name":"bits","type":"uint8"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"SafeCastOverflowedUintDowncast","type":"error"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},{"inputs":[{"internalType":"string","name":"str","type":"string"}],"name":"StringTooLong","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"SupplyCapExceeded","type":"error"},{"inputs":[],"name":"TimelockNotElapsed","type":"error"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"UnauthorizedMarket","type":"error"},{"inputs":[],"name":"WithdrawMorphoFailed","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"inputs":[],"name":"ZeroFeeRecipient","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"feeShares","type":"uint256"}],"name":"AccrueFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"assets","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"shares","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[],"name":"EIP712DomainChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"suppliedAssets","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"suppliedShares","type":"uint256"}],"name":"ReallocateSupply","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"withdrawnAssets","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"withdrawnShares","type":"uint256"}],"name":"ReallocateWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"}],"name":"RevokePendingCap","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"RevokePendingGuardian","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"}],"name":"RevokePendingMarketRemoval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"}],"name":"RevokePendingTimelock","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"cap","type":"uint256"}],"name":"SetCap","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newCurator","type":"address"}],"name":"SetCurator","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"SetFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newFeeRecipient","type":"address"}],"name":"SetFeeRecipient","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"address","name":"guardian","type":"address"}],"name":"SetGuardian","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"allocator","type":"address"},{"indexed":false,"internalType":"bool","name":"isAllocator","type":"bool"}],"name":"SetIsAllocator","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newSkimRecipient","type":"address"}],"name":"SetSkimRecipient","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":false,"internalType":"Id[]","name":"newSupplyQueue","type":"bytes32[]"}],"name":"SetSupplyQueue","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":false,"internalType":"uint256","name":"newTimelock","type":"uint256"}],"name":"SetTimelock","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":false,"internalType":"Id[]","name":"newWithdrawQueue","type":"bytes32[]"}],"name":"SetWithdrawQueue","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Skim","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"cap","type":"uint256"}],"name":"SubmitCap","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newGuardian","type":"address"}],"name":"SubmitGuardian","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"caller","type":"address"},{"indexed":true,"internalType":"Id","name":"id","type":"bytes32"}],"name":"SubmitMarketRemoval","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newTimelock","type":"uint256"}],"name":"SubmitTimelock","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newTotalAssets","type":"uint256"}],"name":"UpdateLastTotalAssets","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"receiver","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"assets","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"shares","type":"uint256"}],"name":"Withdraw","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MORPHO","outputs":[{"internalType":"contract IMorpho","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"acceptCap","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"acceptGuardian","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"acceptTimelock","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"asset","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"Id","name":"","type":"bytes32"}],"name":"config","outputs":[{"internalType":"uint192","name":"cap","type":"uint192"},{"internalType":"bool","name":"enabled","type":"bool"},{"internalType":"uint56","name":"removableAt","type":"uint56"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"convertToAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"name":"convertToShares","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"curator","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"address","name":"receiver","type":"address"}],"name":"deposit","outputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"eip712Domain","outputs":[{"internalType":"bytes1","name":"fields","type":"bytes1"},{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"version","type":"string"},{"internalType":"uint256","name":"chainId","type":"uint256"},{"internalType":"address","name":"verifyingContract","type":"address"},{"internalType":"bytes32","name":"salt","type":"bytes32"},{"internalType":"uint256[]","name":"extensions","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint96","name":"","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"guardian","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"isAllocator","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastTotalAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"maxDeposit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"maxMint","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"maxRedeem","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"maxWithdraw","outputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"receiver","type":"address"}],"name":"mint","outputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes[]","name":"data","type":"bytes[]"}],"name":"multicall","outputs":[{"internalType":"bytes[]","name":"results","type":"bytes[]"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"Id","name":"","type":"bytes32"}],"name":"pendingCap","outputs":[{"internalType":"uint192","name":"value","type":"uint192"},{"internalType":"uint56","name":"validAt","type":"uint56"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingGuardian","outputs":[{"internalType":"address","name":"value","type":"address"},{"internalType":"uint56","name":"validAt","type":"uint56"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingTimelock","outputs":[{"internalType":"uint192","name":"value","type":"uint192"},{"internalType":"uint56","name":"validAt","type":"uint56"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"name":"previewDeposit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"previewMint","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"previewRedeem","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"name":"previewWithdraw","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"assets","type":"uint256"}],"internalType":"struct MarketAllocation[]","name":"allocations","type":"tuple[]"}],"name":"reallocate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"shares","type":"uint256"},{"internalType":"address","name":"receiver","type":"address"},{"internalType":"address","name":"owner","type":"address"}],"name":"redeem","outputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"revokePendingCap","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"revokePendingGuardian","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"revokePendingMarketRemoval","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"revokePendingTimelock","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newCurator","type":"address"}],"name":"setCurator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newFeeRecipient","type":"address"}],"name":"setFeeRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAllocator","type":"address"},{"internalType":"bool","name":"newIsAllocator","type":"bool"}],"name":"setIsAllocator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newSkimRecipient","type":"address"}],"name":"setSkimRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id[]","name":"newSupplyQueue","type":"bytes32[]"}],"name":"setSupplyQueue","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"skim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"skimRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"loanToken","type":"address"},{"internalType":"address","name":"collateralToken","type":"address"},{"internalType":"address","name":"oracle","type":"address"},{"internalType":"address","name":"irm","type":"address"},{"internalType":"uint256","name":"lltv","type":"uint256"}],"internalType":"struct MarketParams","name":"marketParams","type":"tuple"},{"internalType":"uint256","name":"newSupplyCap","type":"uint256"}],"name":"submitCap","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newGuardian","type":"address"}],"name":"submitGuardian","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"Id","name":"id","type":"bytes32"}],"name":"submitMarketRemoval","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newTimelock","type":"uint256"}],"name":"submitTimelock","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"supplyQueue","outputs":[{"internalType":"Id","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"supplyQueueLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"timelock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalAssets","outputs":[{"internalType":"uint256","name":"assets","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256[]","name":"indexes","type":"uint256[]"}],"name":"updateWithdrawQueue","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"assets","type":"uint256"},{"internalType":"address","name":"receiver","type":"address"},{"internalType":"address","name":"owner","type":"address"}],"name":"withdraw","outputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"withdrawQueue","outputs":[{"internalType":"Id","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdrawQueueLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

const allocatorAddress = '0x41daaf7b733e820fcabfe211b36feed6e50d8120';
const morphoAddress = '0x64c7044050Ba0431252df24fEd4d9635a275CB41';
const metamorphoAddress = '0xb6c383fF0257D20e4c9872B6c9F1ce412F4AAC4C';
const pythiaAddress = '0x2FD84AeED36CE14AF86E7DB303358F505F7A79Ae';
const privateKey = process.env.ETH_PRIVATE_KEY;

const USDCAddress =  '0x62bD2A599664D421132d7C54AB4DbE3233f4f0Ae';
const sDAIAddress =  '0xD8134205b0328F5676aaeFb3B2a0DC15f4029d8C';
const USDTAddress= '0x576e379FA7B899b4De1E251e935B31543Df3e954';

const marketIdSdai = '0x7a9e4757d1188de259ba5b47f4c08197f821e54109faa5b0502b9dfe2c10b741';
const marketIdUSDT = '0xbc6d1789e6ba66e5cd277af475c5ed77fcf8b084347809d9d92e400ebacbdd10';
const marketIdIdle = '0x655f87b795c56753741185b9f6fa24c9eb8411bbbbadb44335c9cd4ee0883990';

async function checkAndReallocate() {
    // await checkAndReallocateWithdraw10k10k();
    // await checkAndReallocateSupply5kEachMarket();
    await checkAndReallocateSupplyTarget20KUSDT();
    // await checkAndReallocateSupplyTarget10KUSDT();
    // const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    // const tx = await web3ProviderGoerli.getTransaction('0x735f3451a2e24689b590a3d2f3ad1bc91e0dd67b18ada642844f2a69585ddf25');
    // const allocatorContract = new Contract(allocatorAddress, allocatorAbi, web3ProviderGoerli);
    // const response = await web3ProviderGoerli.call(
    //     {
    //         to: tx.to,
    //         from: tx.from,
    //         nonce: tx.nonce,
    //         gasLimit: tx.gasLimit,
    //         gasPrice: tx.gasPrice,
    //         data: tx.data,
    //         value: tx.value,
    //         chainId: tx.chainId,
    //         type: tx.type ?? undefined,
    //         accessList: tx.accessList,
    //     },
    //     tx.blockNumber
    // );

    // const error = allocatorContract.interface.parseError(response);
    // console.log({error});
    // const txParsed = allocatorContract.interface.parseTransaction(tx);
    // }catch(err) {
    //     const decodedError = allocatorContract.interface.parseError(err.data)
    //     console.log({decodedError});
    // }

    // await checkAndReallocate15k15k();
    // await checkAndReallocateUSDT();
    // await checkAndReallocateToSDAI();
}

async function checkAndReallocateWithdraw10k10k() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);
    
    const allocations = [];
    const riskDatas = [];
    const signatures = [];


    // set sDAI market to 10k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, sDAIAddress, USDCAddress, 10_000e6, 143_000_000,  2.75 / 100, marketIdSdai);

    // set USDT market to 10k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 10_000e6, 92_000_000,  9.66 / 100, marketIdUSDT);

    // remaining to idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 500_000});

}


async function checkAndReallocateSupply5kEachMarket() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);
    
    const allocations = [];
    const riskDatas = [];
    const signatures = [];


    // empty idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, 0, 0,  0, marketIdIdle);

    // set sDAI market to 15k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, sDAIAddress, USDCAddress, 15_000e6, 143_000_000,  2.75 / 100, marketIdSdai);

    // set USDT market to 15k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 15_000e6, 92_000_000,  9.66 / 100, marketIdUSDT);

    // remaining to idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 500_000});

}


async function checkAndReallocateSupplyTarget20KUSDT() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);
    
    const allocations = [];
    const riskDatas = [];
    const signatures = [];


    // empty idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, 0, 0,  0, marketIdIdle);

    // set USDT market to 20k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 20_000e6, 92_000_000,  9.66 / 100, marketIdUSDT);

    // remaining to idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 500_000});

}


async function checkAndReallocateSupplyTarget10KUSDT() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);
    
    const allocations = [];
    const riskDatas = [];
    const signatures = [];

    // set USDT market to 20k
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 10_000e6, 92_000_000,  9.66 / 100, marketIdUSDT);

    // remaining to idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 500_000});

}

async function checkAndReallocateUSDT() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const metamorphoContract = new Contract(metamorphoAddress, metamorphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);

    const config = await metamorphoContract.config(marketIdUSDT);
    console.log(config.cap.toString());
    const allocations = [];
    const riskDatas = [];
    const signatures = [];

    // generate sDAI/USDC allocation, riskData and signature
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, sDAIAddress, USDCAddress, 0, 147_420_000,  2.75 / 100, marketIdSdai);

    // generate USDT/USDC allocation, riskData and signature
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 20_000e6, 101_980_000,  9.68 / 100, marketIdUSDT);

    // generate IDLE/USDC allocation, riskData and signature
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    const txResponse = await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 1_000_000});
    txResponse.wait();
    let txFinished = false;
    while (!txFinished) {
        const txReceipt = await web3ProviderGoerli.getTransactionReceipt(txResponse.hash);
        if (txReceipt && txReceipt.blockNumber) {
            console.log(`transaction has been mined in block ${txReceipt.blockNumber}`);
            txFinished = true;
        } else {
            console.log(`waiting for transaction ${txResponse.hash} to be mined`);
            await sleep(5000);
        }
    }
}


async function checkAndReallocateToSDAI() {
    const web3ProviderGoerli = new ethers.providers.StaticJsonRpcProvider('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
    const wallet = new ethers.Wallet(privateKey, web3ProviderGoerli);
    const morphoContract = new Contract(morphoAddress, morphoAbi, web3ProviderGoerli);
    const metamorphoContract = new Contract(metamorphoAddress, metamorphoAbi, web3ProviderGoerli);
    const allocatorContract = new Contract(allocatorAddress, allocatorAbi, wallet);

    const config = await metamorphoContract.config(marketIdUSDT);
    console.log(config.cap.toString());
    const allocations = [];
    const riskDatas = [];
    const signatures = [];

    
    // empty idle market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, 0, 0,  0, marketIdIdle);

    // empty usdt market
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, USDTAddress, USDCAddress, 0, 101_980_000,  9.68 / 100, marketIdUSDT);

    // set 35k to sDAI
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, sDAIAddress, USDCAddress, 35_000e6, 147_420_000,  2.75 / 100, marketIdSdai);

    // send the rest to idle
    await generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, ethers.constants.AddressZero, USDCAddress, ethers.constants.MaxUint256, 0,  0, marketIdIdle);

    console.log(allocations.length);
    console.log(riskDatas.length);
    console.log(signatures.length);

    const txResponse = await allocatorContract.checkAndReallocate(allocations, riskDatas, signatures, {gasLimit: 1_000_000});
    let txFinished = false;
    while (!txFinished) {
        const txReceipt = await web3ProviderGoerli.getTransactionReceipt(txResponse.hash);
        if (txReceipt && txReceipt.blockNumber) {
            console.log(`transaction has been mined in block ${txReceipt.blockNumber}`);
            txFinished = true;
        } else {
            console.log(`waiting for transaction ${txResponse.hash} to be mined`);
            await sleep(5000);
        }
    }
}

async function generateCheckAndReallocateData(wallet, morphoContract, allocations, riskDatas, signatures, baseAddress, quoteAddress, amount, liquidity, volatility, marketId) {
    const typedData = generatedTypedData(baseAddress, quoteAddress, liquidity, volatility);
    const signature = await wallet._signTypedData(typedData.domain, typedData.types, typedData.value);
    const splitSig = ethers.utils.splitSignature(signature);
    const marketsParams = await morphoContract.idToMarketParams(marketId);
    console.log(`lltv: ${normalize(marketsParams.lltv.toString(), 18)}`);
    allocations.push({
        marketParams: {
            loanToken: quoteAddress,
            collateralToken: baseAddress,
            oracle: marketsParams.oracle,
            irm: marketsParams.irm,
            lltv: marketsParams.lltv,
        },
        assets: amount
    });

    riskDatas.push(typedData.value);

    signatures.push({ v: splitSig.v, r: splitSig.r, s: splitSig.s });
}

/*MarketParams market1 =
    MarketParams({
      loanToken: debtAddress,
      collateralToken: collateralAddress1,
      oracle: oracleAddress,
      irm: irmAddress,
      lltv: 0.90e18
    });*/

function generatedTypedData(baseAddress, quoteAddress, liquidity, volatility) {
    
    const BN_1e6 = new BigNumber(10).pow(6);

    const volatility18Decimals = new BigNumber(volatility).times(BN_1e18).toFixed(0);
    const liquidityQuoteDecimals = new BigNumber(liquidity).times(BN_1e6).toFixed(0);
    const typedData = {
        types: {
            RiskData: [
                { name: 'collateralAsset', type: 'address' },
                { name: 'debtAsset', type: 'address' },
                { name: 'liquidity', type: 'uint256' },
                { name: 'volatility', type: 'uint256' },
                { name: 'lastUpdate', type: 'uint256' },                    
                { name: 'chainId', type: 'uint256' }
            ]
        },
        primaryType: 'RiskData',
        domain: {
            name: 'SPythia',
            version: '0.0.1',
            chainId: 5,
            verifyingContract: pythiaAddress,
        },
        value: {
            collateralAsset: baseAddress,
            debtAsset: quoteAddress,
            liquidity: liquidityQuoteDecimals,
            volatility: volatility18Decimals,
            lastUpdate: Math.round(Date.now()/1000),
            chainId: 5
        },
    };

    return typedData;
}

checkAndReallocate();
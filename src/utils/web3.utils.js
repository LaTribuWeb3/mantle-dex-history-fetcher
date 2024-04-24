const axios = require('axios');
const dotenv = require('dotenv');
const { retry, fnName, sleep } = require('./utils');
const { ethers } = require('ethers');
dotenv.config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

let lastCallEtherscan = 0;
/**
 * Get the contract creation blocknumber using etherscan api
 * WILL ONLY WORK ON MAINNET
 * @param {ethers.providers.BaseProvider} web3Provider 
 * @param {string} contractAddress 
 * @returns {Promise<number>} blocknumber where the contract was created
 */
async function GetContractCreationBlockNumber(web3Provider, contractAddress) {
    console.log(`${fnName()}: fetching data for contract ${contractAddress}`);
    const msToWait = 10000 - (Date.now() - lastCallEtherscan);
    if (msToWait > 0) {
        console.log(`${fnName()}: Sleeping ${msToWait} before calling etherscan`);
        await sleep(msToWait);
    }
    // call etherscan to get the tx receipt of contract creation
    const etherscanUrl = `https://api.etherscan.io/api?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;
    const etherscanResponse = await retry(axios.get, [etherscanUrl]);
    lastCallEtherscan = Date.now();

    const receipt = await web3Provider.getTransactionReceipt(etherscanResponse.data.result[0].txHash);
    // console.log(receipt);
    console.log(`${fnName()}: returning blocknumber: ${receipt.blockNumber}`);
    return receipt.blockNumber;
}

/**
 * Get block closest of timestamp, using defillama api
 * Retry 10 times if needed
 * @param {number} timestamp in seconds
 * @returns {Promise<number>} blocknumber
 */
async function getBlocknumberForTimestamp(timestamp) {
    const defiLamaResp = await retry(axios.get, [`https://coins.llama.fi/block/ethereum/${timestamp}`]);
    const blockNumber = defiLamaResp.data.height;
    console.log(`${fnName()}: at timestamp ${timestamp}, block: ${blockNumber}`);
    return blockNumber;
}


async function getCurrentBlock() {
    const web3Provider = new ethers.providers.StaticJsonRpcProvider(process.env.RPC_URL);
    return await web3Provider.getBlockNumber() - 10;
}

module.exports = { GetContractCreationBlockNumber, getBlocknumberForTimestamp, getCurrentBlock };
// Invoke the spirits of configuration and GitHub interaction.
require('dotenv').config();  // Blessing of environment configuration
const { Octokit } = require('octokit');  // Invocation of the Octokit, the sacred GitHub interface
const base64 = require('base-64');  // Enlist the base64 encoding spirit for data transmutation
const { retry } = require('./utils');  // Import the retry ritual for resilience

// Divining the environment's essence, to discern between staging and production realms.
const IS_STAGING = process.env.STAGING_ENV && process.env.STAGING_ENV.toLowerCase() == 'true';
const REPO_PATH = IS_STAGING ? 'goerli' : 'mainnet';

// Summoning the Octokit with the authentication token, a key to the GitHub sanctum.
const octokit = new Octokit({
    auth: process.env.GH_TOKEN
});

// Function to acquire the SHA - the unique identifier of data in the GitHub repository.
const getSha = async (fileName) => {
    try {
        const res = await octokit.request(`Get /repos/{owner}/{repo}/contents/${REPO_PATH}/latest/{path}`, {
            owner: 'LaTribuWeb3',
            repo: 'risk-data-repo',
            path: `${fileName}`,
        });
        return res.data.sha;
    } catch (err) {
        console.error('Error in retrieving SHA: ', err);  // Log the error for the tech-priests' analysis
        return null;
    }
};

// Function to upload a JSON file to the GitHub repository.
const uploadJsonFile = async (jsonString, fileName) => {
    try {
        const sha = await getSha(fileName);
        return octokit.request(`PUT /repos/{owner}/{repo}/contents/${REPO_PATH}/latest/{path}`, {
            owner: 'LaTribuWeb3',
            repo: 'risk-data-repo',
            path: `${fileName}`,
            message: `risk data push ${new Date().toString()}`,
            sha,
            committer: {
                name: process.env.GH_HANDLE,
                email: 'octocat@github.com'
            },
            content: base64.encode(jsonString)
        });
    } catch (err) {
        console.error('Failed to upload to GitHub: ', err);  // Log the error for future refinement
    }
};

// Exporting the uploadJsonFile function, wrapped in the retry ritual for resilience.
module.exports = {
    uploadJsonFile: (file, filename) => retry(uploadJsonFile, [file, filename]),
};
// Invoke the spirits of configuration and GitHub interaction.
require('dotenv').config();  // Blessing of environment configuration
const { Octokit } = require('octokit');  // Invocation of the Octokit, the sacred GitHub interface
const base64 = require('base-64');  // Enlist the base64 encoding spirit for data transmutation
const { retry } = require('./utils');  // Import the retry ritual for resilience

// Divining the environment's essence, to discern between staging and production realms.
const IS_STAGING = process.env.STAGING_ENV && process.env.STAGING_ENV.toLowerCase() == 'true';
const REPO_PATH = IS_STAGING ? 'goerli' : 'mainnet';

// Function to acquire the SHA - the unique identifier of data in the GitHub repository.
const getSha = async (octokit, fileName, owner, repo, folderPath) => {
    try {
        const res = await octokit.request(`Get /repos/{owner}/{repo}/contents/${folderPath}/latest/{path}`, {
            owner: owner,
            repo: repo,
            path: `${fileName}`,
        });
        return res.data.sha;
    } catch (err) {
        console.error('Error in retrieving SHA: ', err);  // Log the error for the tech-priests' analysis
        return null;
    }
};

// Function to upload a JSON file to the GitHub repository.
const uploadJsonFile = async (jsonString, fileName, owner, repo, folder) => {
    try {
        // Summoning the Octokit for each specific owner
        
        let octokit = new Octokit({
            auth: owner === 'Risk-DAO' ? process.env.GH_TOKEN_RISKDAO : process.env.GH_TOKEN_TRIBU
        });
        const folderPath = folder ? folder + '/' + REPO_PATH : REPO_PATH;
        const sha = await getSha(octokit, fileName, owner, repo, folderPath);
        return octokit.request(`PUT /repos/{owner}/{repo}/contents/${folderPath}/latest/{path}`, {
            owner: owner,
            repo: repo,
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
    uploadJsonFile: (file, filename, owner, repo, folder) => retry(uploadJsonFile, [file, filename, owner, repo, folder]),
};

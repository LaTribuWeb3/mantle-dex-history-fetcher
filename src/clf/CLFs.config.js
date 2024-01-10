const { compoundV3Computer } = require('./compoundV3/compoundV3Computer');
const { morphoFlagshipComputer } = require('./morpho/morphoFlagshipComputer');

const CLFsConfig = [
    {
        name: 'compoundv3',
        toLaunch: compoundV3Computer
    },
    {
        name: 'morpho',
        toLaunch: morphoFlagshipComputer
    }
];


module.exports = {CLFsConfig};
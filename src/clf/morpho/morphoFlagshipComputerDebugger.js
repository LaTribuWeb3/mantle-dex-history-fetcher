const { morphoFlagshipComputer } = require('./morphoFlagshipComputer');

async function ComputeMorphoFlagshipForDate() {
    process.exitCode = 0;

    // const startDate = new Date(startDateMs);
    const startDate = new Date(2024, 1, 8, 14, 0, 0); // BE CAREFUL MONTH IS 0 based

    try {
        await morphoFlagshipComputer(0, startDate);
    } catch(e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
    
}

ComputeMorphoFlagshipForDate();
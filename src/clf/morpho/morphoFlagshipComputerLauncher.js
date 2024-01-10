const { morphoFlagshipComputer } = require('./morphoFlagshipComputer');

async function ComputeMorphoFlagshipForDate() {
    process.exitCode = 0;
    const startDateMs = Number(process.argv[2]);
    if(!startDateMs) {
        throw new Error(`Cannot work with date: ${startDateMs}`);
    }

    const startDate = new Date(startDateMs);
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
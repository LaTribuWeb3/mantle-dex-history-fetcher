const { compoundV3Computer } = require('./compoundV3Computer');

async function compoundV3ComputerDebug() {
    const startDates = [];
    // startDates.push(new Date(2023, 5, 14, 12, 43, 15));
    // startDates.push(new Date(2023, 5, 15, 12, 43, 15));
    // startDates.push(new Date(2023, 6, 31, 12, 43, 15));
    // startDates.push(new Date(2023, 7, 1, 12, 43, 15));
    // startDates.push(new Date(2023, 7, 12, 14, 0, 0));
    startDates.push(new Date(2023, 5, 13, 14, 0, 0));
    // startDates.push(new Date(2023, 7, 28, 14, 0, 0));

    try {

        for(const startDate of startDates) {
            await compoundV3Computer(0);
            // await compoundV3Computer(0, startDate.getTime());
        }
    } catch(e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
}

compoundV3ComputerDebug();
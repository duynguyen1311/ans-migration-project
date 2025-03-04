// scheduler.js
const cron = require('node-cron');
const { main } = require('./index');
const { log, logError } = require('./log');

// Main function to run the invoice sync
async function runInvoiceSync() {
    try {
        log('Starting migration process...');
        await main();
        log('Migration completed successfully');
    } catch (error) {
        logError(`Error running migration: ${error.message}`);
    }
}

// Prevent crashes from unhandled exceptions
process.on('uncaughtException', (error) => {
    logError(`Uncaught exception: ${error.message}`);
});

// Schedule to run every 15 minutes
// Cron format: minute hour day-of-month month day-of-week
// */15 * * * * = At every 15th minute
log('Scheduler started - will run every 15 minutes');
cron.schedule('*/15 * * * *', () => {
    log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>')
    log('Running scheduled migration task...');
    runInvoiceSync().then(() => {
        log('Scheduled task execution completed');
    });
});

// Also run immediately on startup
log('---------------------------------------')
log('Running initial migration on startup...');
runInvoiceSync().then(() => {
    log('Initial migration completed');
});
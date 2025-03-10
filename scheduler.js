// scheduler.js
const cron = require('node-cron');
const workMigrationJob = require('./job/workMigrationJob');
const DailyReportJob = require('./job/dailyReportJob');
const { log, logError } = require('./service/log-service');
const config = require('./config');

// Main function to run the invoice sync
async function runInvoiceSync() {
    try {
        log('Starting migration process...');
        // Using the static method to run the integration
        await workMigrationJob.run(config);
        log('Migration completed successfully');
    } catch (error) {
        logError(`Error running migration: ${error.message}`);
    }
}

// Main function to run the unestimated items report (9:00)
async function runUnestimatedReport() {
    try {
        log('Starting unestimated items report process...');
        // Using the dedicated static method for unestimated items
        await DailyReportJob.runUnestimated(config);
        log('Unestimated items report completed successfully');
    } catch (error) {
        logError(`Error running unestimated items report: ${error.message}`);
    }
}

// Main function to run the due/overdue items report (8:30)
async function runDueAndOverdueReport() {
    try {
        log('Starting due/overdue items report process...');
        // Using the dedicated static method for due/overdue items
        await DailyReportJob.runDueAndOverdue(config);
        log('Due/overdue items report completed successfully');
    } catch (error) {
        logError(`Error running due/overdue items report: ${error.message}`);
    }
}

// Main function to run the phat sinh work items report (9:05)
async function runAdditionalWorkReport() {
    try {
        log('Starting additional work items report process...');
        // Using the dedicated static method for additional work items
        await DailyReportJob.runPhatSinh(config);
        log('Additional work items report completed successfully');
    } catch (error) {
        logError(`Error running additional work items report: ${error.message}`);
    }
}

// Prevent crashes from unhandled exceptions
process.on('uncaughtException', (error) => {
    logError(`Uncaught exception: ${error.message}`);
});

// Schedule the invoice sync to run every 15 minutes
// Cron format: minute hour day-of-month month day-of-week
// */15 * * * * = At every 15th minute
log('Invoice sync scheduler started - will run every 15 minutes');
cron.schedule('*/15 * * * *', () => {
    log('>>>>>>>>>>>>>>>>>>> START RUNNING MIGRATION JOB >>>>>>>>>>>>>>>>>>>')
    log('Running scheduled migration task...');
    runInvoiceSync().then(() => {
        log('Scheduled migration task completed');
    });
});

// Schedule the due/overdue report to run at 8:30 AM every day
// Cron format: 30 8 * * * = At 8:30 AM, every day
log('Due/overdue report scheduler started - will run at 8:30 AM every day');
cron.schedule('30 8 * * *', () => {
    log('>>>>>>>>>>>>>>>>>>> START RUNNING DUE/OVERDUE JOB >>>>>>>>>>>>>>>>>>>')
    log('Running scheduled due/overdue report task...');
    runDueAndOverdueReport().then(() => {
        log('Due/overdue report task completed');
    });
});

// Schedule the unestimated items report to run at 9:00 every day
// Cron format: 0 9 * * * = At 9:00 AM, every day
log('Unestimated items report scheduler started - will run at 9:00 AM every day');
cron.schedule('0 9 * * *', () => {
    log('>>>>>>>>>>>>>>>>>>> START RUNNING UNESTIMATED TIME JOB >>>>>>>>>>>>>>>>>>>')
    log('Running scheduled unestimated items report task...');
    runUnestimatedReport().then(() => {
        log('Unestimated items report task completed');
    });
});

// Schedule the additional work items report to run at 9:00 AM every day
// Cron format: 0 9 * * * = At 9:00 AM, every day
log('Additional work items report scheduler started - will run at 9:05 AM every day');
cron.schedule('5 9 * * *', () => {
    log('>>>>>>>>>>>>>>>>>>> START RUNNING ADDITIONAL WORK JOB >>>>>>>>>>>>>>>>>>>')
    log('Running scheduled additional work items report task...');
    runAdditionalWorkReport().then(() => {
        log('Additional work items report task completed');
    });
});

// Run invoice sync immediately on startup
log('---------------------------------------')
log('Running initial migration on startup...');
runInvoiceSync().then(() => {
    log('Initial migration completed');
});

// Note: We don't run the daily reports on startup as they should only run at their scheduled times
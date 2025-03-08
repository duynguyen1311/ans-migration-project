const workMigrationJob = require("./job/workMigrationJob");
const DailyReportJob = require("./job/dailyReportJob");
const config = require('./config');

class Main {
    async runWorkMigrationJob() {
        const workMigration = new workMigrationJob(config);
        await workMigration.main();
    }
    async runDailyReportJob() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.main();
    }
}

const main = new Main();

/*Migrate work from KiotViet to Google Sheet*/
//main.runWorkMigrationJob();

/*Report daily job*/
main.runDailyReportJob();
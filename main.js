const workMigrationJob = require("./job/workMigrationJob");
const dataMigrationJob = require("./job/dataMigrationJob");
const DailyReportJob = require("./job/dailyReportJob");
const config = require('./config');
const TelegramBot = require("./service/telegram-bot-service");

class Main {
    async runDataMigrationJob() {
        const dataMigration = new dataMigrationJob(config);

        //seed data only
        //await dataMigration.main();

        //customer
        await dataMigration.main('customer');
        //goods
        //await dataMigration.main('goods');
        //services
        //await dataMigration.main('services');
        //invoices
        //await dataMigration.main('invoices');
    }

    async runWorkMigrationJob() {
        const workMigration = new workMigrationJob(config);
        await workMigration.main();
    }
    async runAllDailyReportJob() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.main();
    }

    async runUnestimatedReport() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.runUnestimatedReport();
    }

    async runDueOverDueReport() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.runDueAndOverdueReport();
    }

    async runPhatSinhReport() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.runPhatSinhReport();
    }

    async testTeleBot() {
        const tele = new TelegramBot();
        await tele.getUpdates();
        await tele.sendToDailyReportTopic("Good morning !");
        await tele.sendToFeedbackTopic("Good morning !");
    }
}

const main = new Main();

/*Migrate work from KiotViet to Google Sheet*/
//main.runWorkMigrationJob();

/*Report daily job*/
//main.runAllDailyReportJob();

/*Report unestimated job*/
//main.runUnestimatedReport();

/*Report phat sinh job*/
//main.runPhatSinhReport();

/*Report due&overdue job*/
//main.runDueOverDueReport();

/*Test telegram bot*/
//main.testTeleBot();

main.runDataMigrationJob();
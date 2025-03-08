const workMigrationJob = require("./job/workMigrationJob");
const DailyReportJob = require("./job/dailyReportJob");
const config = require('./config');
const TelegramBot = require("./service/telegram-bot-service");

class Main {
    async runWorkMigrationJob() {
        const workMigration = new workMigrationJob(config);
        await workMigration.main();
    }
    async runDailyReportJob() {
        const dailyReport = new DailyReportJob(config)
        await dailyReport.main();
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
//main.runDailyReportJob();

/*Test telegram bot*/
main.testTeleBot();
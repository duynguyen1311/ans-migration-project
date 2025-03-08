const { getGoogleClient } = require('../service/get-client-service');
const TelegramBot = require('../service/telegram-bot-service');
const { log, logError } = require('../service/log-service');
const config = require('../config');

/**
 * DailyReportJob Class
 *
 * Reads the Google Sheet, finds rows where "Ngày nhận" (column B) equals today's date
 * and have empty "Thời gian" values, and sends a report to the Telegram Daily Report topic.
 */
class DailyReportJob {
    /**
     * Create a new DailyReportJob instance
     *
     * @param {Object} config - Configuration for the job
     * @param {Object} options - Optional dependencies for testing/DI
     */
    constructor(config, options = {}) {
        this.config = config;
        // Set up dependencies with support for dependency injection
        this.getGoogleClient = options.getGoogleClient || getGoogleClient;
        this.log = options.log || log;
        this.logError = options.logError || logError;
        this.telegramBot = options.telegramBot || new TelegramBot();
    }

    /**
     * Main orchestration method
     * @returns {Promise<boolean>} True if process completed successfully
     */
    async main() {
        try {
            this.log('Starting daily report job...');

            // Read data from the Google Sheet
            const { invoiceCodes, totalRows, todayRows } = await this.readSheetData();

            this.log(`Found ${invoiceCodes.length} unique invoice(s) with today's date (${this.formatTodayDate()}) and empty "Thời gian" out of ${todayRows} rows received today and ${totalRows} total rows`);

            // Only send a message to Telegram if there are incomplete invoices
            if (invoiceCodes.length > 0) {
                const message = this.formatMessage(invoiceCodes);
                await this.telegramBot.sendToDailyReportTopic(message);
                this.log('Daily report sent to Telegram successfully');
            } else {
                this.log('No incomplete invoices found for today, skipping Telegram notification');
            }

            this.log('Daily report job completed successfully');
            return true;
        } catch (error) {
            this.logError(`Error in daily report job: ${error.message}`);
            return false;
        }
    }

    /**
     * Format today's date as DD/MM/YYYY to match the Google Sheet format
     *
     * @returns {string} Today's date formatted as DD/MM/YYYY
     */
    formatTodayDate() {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();

        return `${month}/${day}/${year}`;
    }

    /**
     * Read data from the Google Sheet and filter for rows with:
     * 1. "Ngày nhận" (column B) equal to today's date
     * 2. Empty "Thời gian" values (column G)
     *
     * @returns {Promise<{invoiceCodes: Array<string>, totalRows: number, todayRows: number}>}
     * Array of unique invoice codes, total row count, and count of rows received today
     */
    async readSheetData() {
        try {
            // Set up authentication using the dedicated module
            const { sheets } = await this.getGoogleClient();

            // Get all data from the sheet
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: this.config.spreadsheet.id,
                range: `${this.config.spreadsheet.sheetName}!A:G` // We need columns A (invoice code) through G (Thời gian)
            });

            // Get the rows
            const rows = response.data.values || [];

            if (rows.length <= 1) {
                // Only header row or empty sheet
                return { invoiceCodes: [], totalRows: 0, todayRows: 0 };
            }

            // Format today's date for comparison
            const todayFormatted = this.formatTodayDate();

            // Skip the header row and filter for:
            // 1. Rows with "Ngày nhận" (column B, index 1) equal to today's date
            // 2. Rows with empty "Thời gian" (column G, index 6)
            // 3. Rows with a valid invoice code (column A, index 0)
            const incompleteRows = rows.slice(1).filter((row) => {
                // Check if row has enough columns and has an invoice code
                if (row.length < 2 || !row[0]) {
                    return false;
                }

                // Check if "Ngày nhận" column matches today's date
                // Some date cells might include time, so we need to check if the date part matches
                const receiveDate = row[1] ? row[1].split(' ')[0] : '';
                const isToday = receiveDate === todayFormatted;

                if (!isToday) {
                    return false;
                }

                // Check if "Thời gian" column is empty
                // The column G is at index 6, but some rows might not have that many columns
                return row.length <= 6 || !row[6] || row[6].trim() === '';
            });

            // Count how many rows were received today (regardless of Thời gian status)
            const todayRows = rows.slice(1).filter(row => {
                if (row.length < 2 || !row[1]) {
                    return false;
                }
                const receiveDate = row[1].split(' ')[0];
                return receiveDate === todayFormatted;
            }).length;

            // Extract all invoice codes (column A, index 0)
            const allInvoiceCodes = incompleteRows.map(row => row[0]);

            // Create a Set to get unique invoice codes
            const uniqueInvoiceCodes = [...new Set(allInvoiceCodes)];

            return {
                invoiceCodes: uniqueInvoiceCodes,
                totalRows: rows.length - 1, // Exclude header row
                todayRows: todayRows
            };
        } catch (error) {
            this.logError(`Error reading sheet data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format the message to be sent to Telegram
     *
     * @param {Array<string>} invoiceCodes - Array of unique invoice codes
     * @returns {string} Formatted message
     */
    formatMessage(invoiceCodes) {
        // Get current date and time for the report header
        const now = new Date();
        const dateFormatted = now.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const timeFormatted = now.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Using emojis that work well in Telegram
        let message = `⚠️ *BÁO CÁO CÔNG VIỆC NGÀY ${dateFormatted}* ⚠️\n`;
        message += `🕒 Thời điểm: ${dateFormatted} ${timeFormatted}\n\n`;

        // We only format and send messages when there are incomplete invoices
        // This code will only run when invoiceCodes.length > 0
        message += `📋 Các mã hóa đơn chưa nhập thời gian estimate (${invoiceCodes.length}):\n\n`;

        // Add each invoice code as a numbered list item
        invoiceCodes.forEach((code, index) => {
            message += `${index + 1}. ${code}\n`;
        });

        message += '\n\n⏰ Vui lòng cập nhật thời gian estimate cho các công việc trên.';

        return message;
    }

    /**
     * Static method to run the job
     *
     * @param {Object} config - Configuration object
     * @returns {Promise<boolean>} Result of the job process
     */
    static async run(config) {
        const job = new DailyReportJob(config);
        return job.main();
    }
}

// Execute if run directly
if (require.main === module) {
    DailyReportJob.run(config);
} else {
    module.exports = DailyReportJob;
}
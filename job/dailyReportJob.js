const { getGoogleClient } = require('../service/get-client-service');
const TelegramBot = require('../service/telegram-bot-service');
const { log, logError } = require('../service/log-service');
const config = require('../config');

/**
 * DailyReportJob Class
 *
 * Reads the Google Sheet and sends separate reports to the Telegram Daily Report topic:
 * 1. Unestimated report: Items with empty "Thời gian" values
 * 2. Due/Overdue report: Items due today or overdue
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
     * Run the unestimated items report (9:00 AM for previous day's data)
     * @returns {Promise<boolean>} True if process completed successfully
     */
    async runUnestimatedReport() {
        try {
            this.log('Starting unestimated items report job for previous day...');

            // Read data from the Google Sheet for unestimated items from the previous day
            const { invoiceCodes, totalRows, todayRows } = await this.readSheetData(true); // true = use yesterday's date

            const yesterdayDate = this.formatDate(this.getYesterdayDate());
            this.log(`Found ${invoiceCodes.length} unique invoice(s) with previous day's date (${yesterdayDate}) and empty "Thời gian" out of ${todayRows} rows received yesterday and ${totalRows} total rows`);

            // Send message for unestimated items
            if (invoiceCodes.length > 0) {
                const incompleteMessage = this.formatIncompleteMessage(invoiceCodes, true); // true = use yesterday's date
                await this.telegramBot.sendToDailyReportTopic(incompleteMessage);
                this.log('Unestimated invoices report for previous day sent to Telegram successfully');
            } else {
                this.log('No unestimated invoices found for previous day, skipping that report');
            }

            this.log('Unestimated items report job for previous day completed successfully');
            return true;
        } catch (error) {
            this.logError(`Error in unestimated items report job for previous day: ${error.message}`);
            return false;
        }
    }

    /**
     * Run the due today and overdue items report (8:30)
     * @returns {Promise<boolean>} True if process completed successfully
     */
    async runDueAndOverdueReport() {
        try {
            this.log('Starting due today and overdue items report job...');

            // Read data for due today and overdue items
            const { dueTodayItems, overdueItems } = await this.readDueTodayData();

            this.log(`Found ${dueTodayItems.length} unique invoices due for return today (${this.formatTodayDate()})`);
            this.log(`Found ${overdueItems.length} unique overdue invoices`);

            // Send message for due today items
            if (dueTodayItems.length > 0) {
                const dueTodayMessage = this.formatDueTodayMessage(dueTodayItems);
                await this.telegramBot.sendToDailyReportTopic(dueTodayMessage);
                this.log('Due today invoices report sent to Telegram successfully');
            } else {
                this.log('No due today items found, skipping that report');
            }

            // Send message for overdue items
            if (overdueItems.length > 0) {
                const overdueMessage = this.formatOverdueMessage(overdueItems);
                await this.telegramBot.sendToDailyReportTopic(overdueMessage);
                this.log('Overdue invoices report sent to Telegram successfully');
            } else {
                this.log('No overdue items found, skipping that report');
            }

            this.log('Due today and overdue items report job completed successfully');
            return true;
        } catch (error) {
            this.logError(`Error in due today and overdue items report job: ${error.message}`);
            return false;
        }
    }

    /**
     * Run the "Phát sinh" items report
     * @returns {Promise<boolean>} True if process completed successfully
     */
    async runPhatSinhReport() {
        try {
            this.log('Starting Phát sinh items report job...');

            // Read data from the Google Sheet for Phát sinh items
            const phatSinhItems = await this.readPhatSinhData();

            this.log(`Found ${phatSinhItems.length} items with "Phát sinh" status`);

            // Send message for Phát sinh items
            if (phatSinhItems.length > 0) {
                const phatSinhMessage = this.formatPhatSinhMessage(phatSinhItems);
                await this.telegramBot.sendToDailyReportTopic(phatSinhMessage);
                this.log('Phát sinh items report sent to Telegram successfully');
            } else {
                this.log('No Phát sinh items found, skipping that report');
            }

            this.log('Phát sinh items report job completed successfully');
            return true;
        } catch (error) {
            this.logError(`Error in Phát sinh items report job: ${error.message}`);
            return false;
        }
    }

    /**
     * Original main method maintained for backward compatibility
     * @returns {Promise<boolean>} True if process completed successfully
     */
    async main() {
        try {
            this.log('Starting complete daily report job...');

            // Run both reports
            await this.runUnestimatedReport();
            await this.runDueAndOverdueReport();
            await this.runPhatSinhReport();

            this.log('Complete daily report job completed successfully');
            return true;
        } catch (error) {
            this.logError(`Error in complete daily report job: ${error.message}`);
            return false;
        }
    }

    /**
     * Get yesterday's date
     *
     * @returns {Date} Yesterday's date
     */
    getYesterdayDate() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
    }

    /**
     * Format a date as MM/DD/YYYY to match the Google Sheet format
     *
     * @param {Date} date - The date to format
     * @returns {string} Date formatted as MM/DD/YYYY
     */
    formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${month}/${day}/${year}`;
    }

    /**
     * Format today's date as MM/DD/YYYY to match the Google Sheet format
     *
     * @returns {string} Today's date formatted as MM/DD/YYYY
     */
    formatTodayDate() {
        return this.formatDate(new Date());
    }

    /**
     * Read data from the Google Sheet and filter for rows with:
     * 1. "Ngày nhận" (column B) equal to the specified date (today or yesterday)
     * 2. Empty "Thời gian" values (column G)
     * 3. "Trạng thái" (column F) not equal to "Phát sinh" or "Huỷ đơn"
     *
     * @param {boolean} useYesterday - Whether to use yesterday's date instead of today's
     * @returns {Promise<{invoiceCodes: Array<string>, totalRows: number, todayRows: number}>}
     * Array of unique invoice codes, total row count, and count of rows received on the target date
     */
    async readSheetData(useYesterday = false) {
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

            // Format target date for comparison (today or yesterday)
            const targetDate = useYesterday ? this.getYesterdayDate() : new Date();
            const targetDateFormatted = this.formatDate(targetDate);

            // Skip the header row and filter for:
            // 1. Rows with "Ngày nhận" (column B, index 1) equal to today's date
            // 2. Rows with empty "Thời gian" (column G, index 6)
            // 3. Rows with a valid invoice code (column A, index 0)
            // 4. Rows where "Trạng thái" (column F, index 5) is not "Phát sinh" or "Huỷ đơn"
            const incompleteRows = rows.slice(1).filter((row) => {
                // Check if row has enough columns and has an invoice code
                if (row.length < 2 || !row[0]) {
                    return false;
                }

                // Check if "Ngày nhận" column matches today's date
                // Some date cells might include time, so we need to check if the date part matches
                const receiveDate = row[1] ? row[1].split(' ')[0] : '';

                // Standardize date format to MM/DD/YYYY if it's in another format
                let formattedReceiveDate = receiveDate;
                if (receiveDate && receiveDate.includes('/')) {
                    // Try to parse and reformat the date to ensure consistent MM/DD/YYYY format
                    try {
                        const parts = receiveDate.split('/');
                        if (parts.length === 3) {
                            // If the day part seems to be a month (1-12), assume it's already MM/DD/YYYY
                            // Otherwise, try to convert from DD/MM/YYYY to MM/DD/YYYY
                            if (parseInt(parts[0]) > 12) {
                                // Likely DD/MM/YYYY format, so swap day and month
                                formattedReceiveDate = `${parts[1]}/${parts[0]}/${parts[2]}`;
                            }
                        }
                    } catch (e) {
                        // If parsing fails, use the original value
                        this.log(`Warning: Could not parse date ${receiveDate}`);
                    }
                }

                const isTargetDate = formattedReceiveDate === targetDateFormatted;

                if (!isTargetDate) {
                    return false;
                }

                // Check if "Thời gian" column is empty
                // The column G is at index 6, but some rows might not have that many columns
                const hasEmptyTimeEstimate = row.length <= 6 || !row[6] || row[6].trim() === '';

                if (!hasEmptyTimeEstimate) {
                    return false;
                }

                // Check if "Trạng thái" column is "Phát sinh" or "Huỷ đơn"
                // The column F is at index 5, but some rows might not have that many columns
                if (row.length > 5 && row[5]) {
                    const status = row[5].trim();
                    if (status === "Phát sinh" || status === "Huỷ đơn") {
                        return false;
                    }
                }

                return true;
            });

            // Count how many rows were received today (regardless of Thời gian status)
            const todayRows = rows.slice(1).filter(row => {
                if (row.length < 2 || !row[1]) {
                    return false;
                }
                const receiveDate = row[1].split(' ')[0];

                // Use the same date formatting logic as above
                let formattedReceiveDate = receiveDate;
                if (receiveDate && receiveDate.includes('/')) {
                    try {
                        const parts = receiveDate.split('/');
                        if (parts.length === 3) {
                            if (parseInt(parts[0]) > 12) {
                                // Likely DD/MM/YYYY format, so swap day and month
                                formattedReceiveDate = `${parts[1]}/${parts[0]}/${parts[2]}`;
                            }
                        }
                    } catch (e) {
                        // Use original if parsing fails
                    }
                }

                return formattedReceiveDate === targetDateFormatted;
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
     * Read data from the Google Sheet and filter for rows with "Ngày trả" (column C) equal to today's date
     * or in the past, excluding rows with "Trạng thái" = "Đơn đã đóng"
     *
     * @returns {Promise<{dueTodayItems: Array<{code: string, dueDate: string}>, overdueItems: Array<{code: string, dueDate: string, delayStatus: string}>}>}
     * Arrays of objects with invoice codes and due dates, separated by whether they're due today or overdue
     */
    async readDueTodayData() {
        try {
            // Set up authentication using the dedicated module
            const { sheets } = await this.getGoogleClient();

            // Get all data from the sheet - Now including columns K for "Lần Delay" and L for "Ngày trả mới"
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: this.config.spreadsheet.id,
                range: `${this.config.spreadsheet.sheetName}!A:L` // Extended to include columns K and L
            });

            // Get the rows
            const rows = response.data.values || [];

            if (rows.length <= 1) {
                // Only header row or empty sheet
                return { dueTodayItems: [], overdueItems: [] };
            }

            // Format today's date for comparison (month and day parts only)
            const today = new Date();
            const todayDay = today.getDate();
            const todayMonth = today.getMonth() + 1;

            // Helper function to extract and check if a date string contains a valid dd/mm format
            const extractDatePart = (dateStr) => {
                if (!dateStr || dateStr === '0' || dateStr.trim() === '') {
                    return null;
                }

                // Extract any pattern that looks like dd/mm (e.g., "7/3", "07/03", etc.)
                // This will work even if it's embedded in text like "tối 7/3"
                const dateMatches = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
                if (!dateMatches) {
                    return null;
                }

                // Return the extracted date part
                return {
                    day: parseInt(dateMatches[1], 10),
                    month: parseInt(dateMatches[2], 10),
                    fullMatch: dateMatches[0]
                };
            };

            // Helper function to check if a date is today
            const isToday = (dateStr) => {
                const dateParts = extractDatePart(dateStr);
                if (!dateParts) return false;

                return dateParts.day === todayDay && dateParts.month === todayMonth;
            };

            // Helper function to check if a date is overdue (in the past)
            const isOverdue = (dateStr) => {
                const dateParts = extractDatePart(dateStr);
                if (!dateParts) return false;

                // If it's a previous month this year, it's overdue
                if (dateParts.month < todayMonth) return true;

                // If it's this month but the day is in the past
                if (dateParts.month === todayMonth && dateParts.day < todayDay) return true;

                // Otherwise it's today or in the future
                return false;
            };

            // Arrays to store due today and overdue items
            const dueTodayRows = [];
            const overdueRows = [];

            // Filter rows based on our conditions
            rows.slice(1).forEach((row) => {
                // Check if row has enough columns and has an invoice code
                if (row.length < 3 || !row[0]) {
                    return; // Skip this row
                }

                // Check if "Ngày trả mới" has a value, use it if it does, otherwise use the original date
                let effectiveDueDate = '';

                // Get the original Ngày trả value (column C, index 2)
                const originalDueDate = row[2] ? row[2].trim() : '';

                // Check if we have a rescheduled due date (Ngày trả mới, column L, index 11)
                const rescheduledDueDate = row.length > 11 && row[11] ? row[11].trim() : '';

                // If rescheduled date exists, use it; otherwise, use the original date
                effectiveDueDate = rescheduledDueDate || originalDueDate;

                // Skip if no valid date format is found in the effective due date
                const dateParts = extractDatePart(effectiveDueDate);
                if (!dateParts) {
                    return; // Skip this row
                }

                // Check Trạng thái (column F, index 5) - must not be "Đóng đơn"
                if (row.length > 5 && row[5] && row[5].trim() === "Đóng đơn") {
                    return; // Skip this row
                }

                // Sort into the appropriate array based on the effective due date (prioritizing rescheduled date if available)
                if (isToday(effectiveDueDate)) {
                    // Add the due dates to the row for later use
                    const rowWithDates = [...row];
                    rowWithDates.effectiveDueDate = effectiveDueDate;
                    rowWithDates.originalDueDate = originalDueDate;
                    rowWithDates.rescheduledDueDate = rescheduledDueDate;
                    rowWithDates.isUsingRescheduledDate = rescheduledDueDate && effectiveDueDate === rescheduledDueDate;
                    dueTodayRows.push(rowWithDates);
                } else if (isOverdue(effectiveDueDate)) {
                    // Add the due dates to the row for later use
                    const rowWithDates = [...row];
                    rowWithDates.effectiveDueDate = effectiveDueDate;
                    rowWithDates.originalDueDate = originalDueDate;
                    rowWithDates.rescheduledDueDate = rescheduledDueDate;
                    rowWithDates.isUsingRescheduledDate = rescheduledDueDate && effectiveDueDate === rescheduledDueDate;
                    overdueRows.push(rowWithDates);
                }
                // Future dates are ignored
            });

            // Create a Map to track all unique codes and their most critical status
            // Priority: due today > overdue
            const uniqueCodesMap = new Map();

            // Process due today items first (higher priority)
            dueTodayRows.forEach(row => {
                const code = row[0];
                if (!uniqueCodesMap.has(code)) {
                    uniqueCodesMap.set(code, {
                        type: 'dueToday',
                        dueDate: row.effectiveDueDate, // Using effective date (prioritizes rescheduled date)
                        originalDueDate: row.originalDueDate,
                        isUsingRescheduledDate: row.isUsingRescheduledDate
                    });
                }
            });

            // Then process overdue items, without overriding any due today items
            overdueRows.forEach(row => {
                const code = row[0];
                if (!uniqueCodesMap.has(code)) {
                    // Get the delay status from column K (index 10) if it exists
                    const delayStatus = row.length > 10 && row[10] && row[10] !== this.config.delayValues[0]
                        ? row[10]
                        : '';

                    uniqueCodesMap.set(code, {
                        type: 'overdue',
                        dueDate: row[2],
                        delayStatus: delayStatus
                    });
                }
            });

            // Separate items into due today and overdue arrays
            const dueTodayItems = [];
            const overdueItems = [];

            uniqueCodesMap.forEach((data, code) => {
                if (data.type === 'dueToday') {
                    dueTodayItems.push({
                        code: code,
                        dueDate: data.dueDate,
                        originalDueDate: data.originalDueDate,
                        isUsingRescheduledDate: data.isUsingRescheduledDate
                    });
                } else if (data.type === 'overdue') {
                    overdueItems.push({
                        code: code,
                        dueDate: data.dueDate,
                        originalDueDate: data.originalDueDate,
                        delayStatus: data.delayStatus,
                        isUsingRescheduledDate: data.isUsingRescheduledDate
                    });
                }
            });

            return {
                dueTodayItems,
                overdueItems
            };

        } catch (error) {
            this.logError(`Error reading due today data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Read data from the Google Sheet and filter for rows with "Trạng thái" = "Phát sinh"
     *
     * @returns {Promise<Array<{code: string, item: string, work: string}>>} Array of objects with invoice codes and item details
     */
    async readPhatSinhData() {
        try {
            // Set up authentication using the dedicated module
            const { sheets } = await this.getGoogleClient();

            // Get all data from the sheet
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: this.config.spreadsheet.id,
                range: `${this.config.spreadsheet.sheetName}!A:F` // We need columns A (invoice code), D (item), E (work), F (status)
            });

            // Get the rows
            const rows = response.data.values || [];

            if (rows.length <= 1) {
                // Only header row or empty sheet
                return [];
            }

            // Skip the header row and filter for rows with "Trạng thái" = "Phát sinh"
            const phatSinhRows = rows.slice(1).filter((row) => {
                // Check if row has enough columns and has an invoice code
                if (row.length < 6 || !row[0]) {
                    return false;
                }

                // Check if "Trạng thái" column is "Phát sinh"
                // The column F is at index 5
                if (row.length > 5 && row[5]) {
                    const status = row[5].trim();
                    return status === "Phát sinh";
                }

                return false;
            });

            // Convert rows to objects with invoice code and details
            const phatSinhItems = phatSinhRows.map(row => ({
                code: row[0],                    // Hoá đơn (column A)
                item: row.length > 3 ? row[3] : '', // Tên đồ dùng (column D)
                work: row.length > 4 ? row[4] : ''  // Công việc (column E)
            }));

            // Group by invoice code to avoid duplicates
            const groupedItems = new Map();

            phatSinhItems.forEach(item => {
                if (!groupedItems.has(item.code)) {
                    groupedItems.set(item.code, []);
                }

                // Only add if there's an item or work description
                if (item.item || item.work) {
                    groupedItems.get(item.code).push({
                        item: item.item,
                        work: item.work
                    });
                }
            });

            // Convert the Map to an array of objects with code and details
            const result = Array.from(groupedItems.entries()).map(([code, details]) => ({
                code,
                details
            }));

            return result;
        } catch (error) {
            this.logError(`Error reading Phát sinh data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format the message for incomplete invoices (missing time estimates)
     *
     * @param {Array<string>} invoiceCodes - Array of unique invoice codes with empty Thời gian
     * @param {boolean} useYesterday - Whether to use yesterday's date in the message
     * @returns {string} Formatted message
     */
    formatIncompleteMessage(invoiceCodes, useYesterday = false) {
        // Get appropriate date for the report header
        const reportDate = useYesterday ? this.getYesterdayDate() : new Date();
        const dateFormatted = reportDate.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Get current date for the report timestamp
        const now = new Date();
        const nowFormatted = now.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Using emojis that work well in Telegram
        let message = `⚠️ BÁO CÁO CÔNG VIỆC CHƯA CÓ ESTIMATE NGÀY ${dateFormatted} ⚠️\n`;
        message += `🕒 Báo cáo được tạo vào ngày ${nowFormatted}\n\n`;

        // Invoices missing time estimates
        message += `📋 Các mã hóa đơn chưa nhập thời gian estimate (${invoiceCodes.length}):\n\n`;

        // Add each invoice code as a numbered list item
        invoiceCodes.forEach((code, index) => {
            message += `${index + 1}. ${code}\n`;
        });

        message += '\n⏰ Vui lòng cập nhật thời gian estimate cho các mã đơn trên.';

        return message;
    }

    /**
     * Format the message for invoices due today
     *
     * @param {Array<{code: string, dueDate: string, originalDueDate: string, isUsingRescheduledDate: boolean}>} dueTodayItems - Array of items due today
     * @returns {string} Formatted message
     */
    formatDueTodayMessage(dueTodayItems) {
        // Get current date and time for the report header
        const now = new Date();
        const dateFormatted = now.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Using emojis that work well in Telegram
        let message = `📅 BÁO CÁO ĐẾN HẠN TRẢ NGÀY ${dateFormatted} 📅\n\n`;

        // Invoices due for return today
        message += `📦 Các mã hóa đơn cần trả HÔM NAY (${dueTodayItems.length}):\n\n`;

        // Add each invoice code with its due date value (which might be the rescheduled date)
        dueTodayItems.forEach((item, index) => {
            let itemText = `${index + 1}. ${item.code} - ${item.dueDate}`;

            // If using a rescheduled date, indicate it's different from the original
            if (item.isUsingRescheduledDate && item.dueDate !== item.originalDueDate) {
                itemText += ` 🔄 (gốc: ${item.originalDueDate})`;
            }

            message += `${itemText}\n`;
        });

        message += '\n📦 Vui lòng kiểm tra và trả đúng hạn các mã đơn trên.';

        return message;
    }

    /**
     * Format the message for overdue invoices
     *
     * @param {Array<{code: string, dueDate: string, originalDueDate: string, delayStatus: string, isUsingRescheduledDate: boolean}>} overdueItems - Array of overdue items with delay status
     * @returns {string} Formatted message
     */
    formatOverdueMessage(overdueItems) {
        // Get current date and time for the report header
        const now = new Date();

        // Using emojis that work well in Telegram
        let message = `🚨 BÁO CÁO QUÁ HẠN TRẢ 🚨\n\n`;

        // Overdue invoices
        message += `⚠️ Các mã hóa đơn ĐÃ QUÁ HẠN (${overdueItems.length}):\n\n`;

        // Add each invoice code with its original due date value and delay status if available
        overdueItems.forEach((item, index) => {
            let itemText = `${index + 1}. ${item.code} - ${item.dueDate}`;

            // Add delay status if it exists and is not the default value
            if (item.delayStatus && item.delayStatus !== this.config.delayValues[0]) {
                itemText += ` (${item.delayStatus})`;
            }

            message += `${itemText}\n`;
        });

        message += '\n⚠️ Các mã đơn trên đã quá hạn trả, cần xử lý NGAY!';

        return message;
    }

    /**
     * Format the message for Phát sinh invoices
     *
     * @param {Array<{code: string, details: Array<{item: string, work: string}>}>} phatSinhItems - Array of items with "Phát sinh" status
     * @returns {string} Formatted message
     */
    formatPhatSinhMessage(phatSinhItems) {
        // Using emojis that work well in Telegram
        let message = `🔄 BÁO CÁO ĐƠN PHÁT SINH 🔄\n\n`;

        // Phát sinh invoices
        message += `📋 Các mã hóa đơn có trạng thái PHÁT SINH (${phatSinhItems.length}):\n\n`;

        // Add each invoice code with its items and work details
        phatSinhItems.forEach((item, index) => {
            message += `${index + 1}. ${item.code}\n`;

            // Add item details if available
            if (item.details && item.details.length > 0) {
                item.details.forEach((detail, detailIndex) => {
                    // Format the details with item and work
                    let detailText = '';
                    if (detail.item) {
                        detailText += `   - ${detail.item}`;
                    }
                    if (detail.work) {
                        detailText += detailText ? ` + ${detail.work}` : `   - ${detail.work}`;
                    }

                    if (detailText) {
                        message += `${detailText}\n`;
                    }
                });
            }

            // Add a blank line between items for better readability
            message += '\n';
        });

        message += '⚠️ Vui lòng kiểm tra và xử lý các đơn phát sinh trên.';

        return message;
    }

    /**
     * Static method to run the unestimated report job
     *
     * @param {Object} config - Configuration object
     * @returns {Promise<boolean>} Result of the job process
     */
    static async runUnestimated(config) {
        const job = new DailyReportJob(config);
        return job.runUnestimatedReport();
    }

    /**
     * Static method to run the due/overdue report job
     *
     * @param {Object} config - Configuration object
     * @returns {Promise<boolean>} Result of the job process
     */
    static async runDueAndOverdue(config) {
        const job = new DailyReportJob(config);
        return job.runDueAndOverdueReport();
    }

    /**
     * Static method to run the complete report job (for backward compatibility)
     *
     * @param {Object} config - Configuration object
     * @returns {Promise<boolean>} Result of the job process
     */
    static async run(config) {
        const job = new DailyReportJob(config);
        return job.main();
    }

    /**
     * Static method to run the Phát sinh report job
     *
     * @param {Object} config - Configuration object
     * @returns {Promise<boolean>} Result of the job process
     */
    static async runPhatSinh(config) {
        const job = new DailyReportJob(config);
        return job.runPhatSinhReport();
    }
}

// Execute if run directly
if (require.main === module) {
    DailyReportJob.run(config);
} else {
    module.exports = DailyReportJob;
}
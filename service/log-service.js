// logService.js - Centralized logging module
const fs = require('fs');
const path = require('path');

// Use logs directory in the root folder
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
// Log file path - one file per day
function getLogFilePath() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return path.join(logsDir, `job-${year}-${month}-${day}.log`);
}

// Log message to both console and file
function logService(message) {
    // Get timestamp in Vietnamese timezone
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const logMessage = `[${now}] ${message}`;

    // Log to console
    console.log(logMessage);

    // Log to file
    try {
        fs.appendFileSync(getLogFilePath(), logMessage + '\n');
    } catch (err) {
        console.error(`Failed to write to log file: ${err.message}`);
    }
}

// Replacement for console.error that also logs to file
function logError(message) {
    // Get timestamp in Vietnamese timezone
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const logMessage = `[${now}] ERROR: ${message}`;

    // Log to console with error formatting
    console.error(logMessage);

    // Log to file
    try {
        fs.appendFileSync(getLogFilePath(), logMessage + '\n');
    } catch (err) {
        console.error(`Failed to write to log file: ${err.message}`);
    }
}

module.exports = { log: logService, logError };
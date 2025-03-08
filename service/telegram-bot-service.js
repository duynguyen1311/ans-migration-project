const axios = require('axios');
const config = require('../config'); // Import the configuration file

class TelegramBot {
    constructor() {
        // Load configuration from config file
        this.botToken = config.telegram.botToken;
        this.chatId = config.telegram.chatId;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.topicIds = config.telegram.topics;

        // Validate required configuration
        this.validateConfig();
    }

    /**
     * Validate that all required configuration values are set
     */
    validateConfig() {
        if (!this.botToken) {
            throw new Error('Missing Telegram bot token in configuration');
        }
        if (!this.chatId) {
            throw new Error('Missing Telegram chat ID in configuration');
        }
        if (!this.topicIds.feedback) {
            throw new Error('Missing feedback topic ID in configuration');
        }
        if (!this.topicIds.dailyReport) {
            throw new Error('Missing daily report topic ID in configuration');
        }
    }

    /**
     * Send a message to the main chat
     * @param {string} message - The message to send
     * @returns {Promise} - Response from the API
     */
    async sendMessage(message) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/sendMessage`,
                {
                    chat_id: this.chatId,
                    text: message
                }
            );

            console.log('Message sent successfully!');
            return response.data;
        } catch (error) {
            console.error('Error sending message:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Send a message to a specific topic in the chat
     * @param {string} message - The message to send
     * @param {string} topicId - The topic ID to send to
     * @returns {Promise} - Response from the API
     */
    async sendMessageToTopic(message, topicId) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/sendMessage`,
                {
                    chat_id: this.chatId,
                    text: message,
                    message_thread_id: topicId
                }
            );

            console.log('Message sent to topic successfully!');
            return response.data;
        } catch (error) {
            console.error('Error sending message to topic:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Send a message to the feedback topic
     * @param {string} message - The message to send
     * @returns {Promise} - Response from the API
     */
    async sendToFeedbackTopic(message) {
        return this.sendMessageToTopic(message, this.topicIds.feedback);
    }

    /**
     * Send a message to the daily report topic
     * @param {string} message - The message to send
     * @returns {Promise} - Response from the API
     */
    async sendToDailyReportTopic(message) {
        return this.sendMessageToTopic(message, this.topicIds.dailyReport);
    }

    /**
     * Get updates from the bot
     * @returns {Promise} - Response from the API with updates
     */
    async getUpdates() {
        try {
            const response = await axios.get(`${this.baseUrl}/getUpdates`);
            console.log('Get updates successfully');
            return response.data.result;
        } catch (error) {
            console.error('Error getting updates:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = TelegramBot;
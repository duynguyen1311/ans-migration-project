const axios = require('axios');
const qs = require('querystring');
const config = require('../config');
const { log, logError } = require('./log-service');

async function getKiotVietAccessToken() {
    try {
        log('Requesting KiotViet access token...');
        const { clientId, clientSecret } = config;

        // Define the request data
        const requestData = qs.stringify({
            scopes: 'PublicApi.Access',
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        });

        // Make the request to get the token
        const response = await axios.post('https://id.kiotviet.vn/connect/token', requestData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Check if the response is valid
        if (response.data && response.data.access_token) {
            log('✓ KiotViet access token obtained successfully');
            // Return just the token
            return response.data.access_token;
        } else {
            throw new Error('Invalid response from token endpoint');
        }
    } catch (error) {
        logError(`Error getting access token: ${error.message}`);
        if (error.response) {
            logError(`Response status: ${error.response.status}`);
            logError(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`Failed to get access token: ${error.message}`);
    }
}

module.exports = { getKiotVietAccessToken };
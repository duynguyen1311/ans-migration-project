const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { log, logError } = require('./log-service');

/**
 * Create a Google API client with proper authentication
 * @returns {Promise<{auth: GoogleAuth, sheets: any}>} The authenticated Google API clients
 */
async function getGoogleClient() {
    try {
        // Check if service account credentials are provided in environment variables
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
            throw new Error('Google service account credentials not found in environment variables');
        }

        // Parse the credentials from the environment variable
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);

        // Set up authentication with the parsed credentials
        const auth = new GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ],
        });

        // Create the client
        const client = await auth.getClient();

        // Get the sheets API
        const sheets = google.sheets({ version: 'v4', auth: client });

        log('✓ Google API authentication successful');
        return { auth, sheets };
    } catch (error) {
        logError(`Google API authentication failed: ${error.message}`);
        throw error;
    }
}

module.exports = { getGoogleClient };
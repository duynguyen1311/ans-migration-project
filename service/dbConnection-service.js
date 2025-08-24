const { Pool } = require('pg');
const { log, logError } = require('./log-service');

class DatabaseService {
    constructor() {
        this.pool = null;
    }

    /**
     * Initialize the database connection pool
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            this.pool = new Pool({
                host: process.env.POSTGRES_HOST,
                port: parseInt(process.env.POSTGRES_PORT),
                user: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                database: process.env.POSTGRES_DB,
                max: 10,
                ssl: false
            });

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            log('✓ Database connected successfully');
        } catch (error) {
            logError(`Database connection failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a SELECT query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async get(query, params = []) {
        try {
            const result = await this.pool.query(query, params);
            return result.rows;
        } catch (error) {
            logError(`Query failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Insert a record into a table
     * @param {string} table - Table name
     * @param {Object} data - Data to insert
     * @returns {Promise<Object>} Inserted record
     */
    async insert(table, data) {
        try {
            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = keys.map((_, index) => `$${index + 1}`);

            const query = `
                INSERT INTO ${table} (${keys.join(', ')})
                VALUES (${placeholders.join(', ')})
                RETURNING *
            `;

            const result = await this.pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            logError(`Insert failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            log('Database connection closed');
        }
    }
}

// Export singleton instance
const dbService = new DatabaseService();
module.exports = { dbService };
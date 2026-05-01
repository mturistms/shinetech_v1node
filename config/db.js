const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Connection Pool
 * Configured with security best practices
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 // 10s
    // Security: Explicitly disable multiple statements by default
    multipleStatements: false,
    // Character set for broad compatibility
    charset: 'utf8mb4_unicode_ci'
});

// Test connection and log status
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL Database connected successfully');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
    });

module.exports = pool;

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const logFile = path.join(__dirname, 'migration_log.txt');
function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

async function run() {
    log('Starting migration script at ' + new Date().toISOString());
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: "root", // Hardcoded fallback for XAMPP
            password: "",
            database: "shinetech_db"
        });

        log('Connected to DB');

        const [tables] = await connection.query('SHOW TABLES');
        log('Existing Tables: ' + tables.map(t => Object.values(t)[0]).join(', '));

        log('Creating inventory_items...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                part_number VARCHAR(100),
                description TEXT,
                stock INT DEFAULT 0,
                unit VARCHAR(20) DEFAULT 'pcs',
                purchase_price DECIMAL(10,2) DEFAULT 0.00,
                sale_price DECIMAL(10,2) DEFAULT 0.00,
                category VARCHAR(50) DEFAULT 'spare',
                location VARCHAR(100),
                min_stock_level INT DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        log('✅ inventory_items created.');

        log('Creating service_items...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS service_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                cost DECIMAL(10,2) DEFAULT 0.00,
                category VARCHAR(50) DEFAULT 'labour',
                estimated_time_minutes INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        log('✅ service_items created.');

        await connection.end();
        log('Migration finished successfully.');
        process.exit(0);

    } catch (err) {
        log('❌ Error: ' + err.message);
        process.exit(1);
    }
}

run();

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function checkDb() {
    console.log('Checking database tables...');
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected to DB.');
        const [rows] = await connection.query('SHOW TABLES');
        console.log('Tables in ' + process.env.DB_NAME + ':');
        rows.forEach(row => {
            console.log(Object.values(row)[0]);
        });

        // Attempt to create table directly here to see if it works
        console.log('Attempting to create inventory_items...');
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
        console.log('Created inventory_items.');

        console.log('Attempting to create service_items...');
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
        console.log('Created service_items.');

        await connection.end();
        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkDb();

const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected to database.');

        // Check if column exists
        const [rows] = await connection.query('DESC customers');
        const hasAltNum = rows.some(row => row.Field === 'alternate_number');

        if (!hasAltNum) {
            console.log('Adding alternate_number column to customers table...');
            await connection.query('ALTER TABLE customers ADD COLUMN alternate_number VARCHAR(15) AFTER mobile');
            console.log('Column added successfully.');
        } else {
            console.log('Column alternate_number already exists.');
        }

    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();

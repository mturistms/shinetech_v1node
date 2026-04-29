const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        console.log('Adding category column to job_items...');
        await connection.execute("ALTER TABLE job_items ADD COLUMN category VARCHAR(50) DEFAULT 'spare';");
        console.log('Success!');
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column already exists.');
        } else {
            console.error('Error:', err.message);
        }
    } finally {
        await connection.end();
    }
}

migrate();

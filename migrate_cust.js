const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function migrate() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Adding alternate_number column to customers table...');
        try {
            await conn.query(`ALTER TABLE customers ADD COLUMN alternate_number VARCHAR(20) DEFAULT NULL AFTER mobile`);
            console.log('Column alternate_number added successfully.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column alternate_number already exists.');
            } else {
                console.error('Error:', err.message);
            }
        }
        await conn.end();
    } catch (e) {
        console.error(e);
    }
}
migrate();

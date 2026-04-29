const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function run() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });
        console.log('Running ALTER...');
        await conn.query('ALTER TABLE staff MODIFY designation VARCHAR(255) DEFAULT "Employee"');
        console.log('ALTER Success.');
        const [rows] = await conn.query('DESCRIBE staff designation');
        console.log('New Type:', rows[0].Type);
        await conn.end();
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();

const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config({ path: './.env' });

async function fix() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Forcefully altering table...');
        try {
            await conn.query(`ALTER TABLE staff MODIFY designation VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Employee'`);
            console.log('Alter success.');
        } catch (err) {
            console.error('Alter error:', err.message);
        }

        // Check columns
        const [cols] = await conn.query(`SHOW COLUMNS FROM staff LIKE 'designation'`);
        console.log('Column details:', cols);

        // Update remanan manually to be sure
        const [res] = await conn.query(`UPDATE staff SET designation = 'thozhilali' WHERE name LIKE '%remanan%'`);
        console.log('Update result:', res);

        // Fetch back
        const [rows] = await conn.query(`SELECT name, designation FROM staff WHERE name LIKE '%remanan%'`);
        console.log('Final check:', rows);

        await conn.end();
    } catch (e) {
        console.error('Main error:', e);
    }
}

fix();

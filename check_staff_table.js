const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function check() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });
        const [rows] = await connection.query("SHOW TABLES LIKE 'staff'");
        if (rows.length > 0) {
            console.log("Table 'staff' EXISTS.");
        } else {
            console.log("Table 'staff' does NOT exist.");
        }
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();

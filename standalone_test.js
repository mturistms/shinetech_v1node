const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });
async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });
    try {
        await connection.execute('INSERT INTO categories (name, type) VALUES ("ManualTest", "both")');
        const [rows] = await connection.execute('SELECT * FROM categories');
        console.log('Result:', rows);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await connection.end();
        process.exit(0);
    }
}
run();

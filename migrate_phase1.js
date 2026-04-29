const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function migrate() {
    console.log('Starting Phase 1 Database Migrations...');
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        // 1. Create Vendors Table
        console.log('Checking Vendors table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS vendors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                contact_person VARCHAR(255),
                phone VARCHAR(20),
                email VARCHAR(255),
                address TEXT,
                gst_number VARCHAR(50),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Vendors table ready.');

        // 2. Update Inventory Items
        console.log('Updating Inventory Items schema...');
        const [invCols] = await connection.query('DESCRIBE inventory_items');
        const invFields = invCols.map(c => c.Field);

        if (!invFields.includes('vendor_id')) {
            await connection.query('ALTER TABLE inventory_items ADD COLUMN vendor_id INT DEFAULT NULL AFTER category');
            console.log(' + Added vendor_id to inventory_items');
        }
        if (!invFields.includes('rack_number')) {
            await connection.query('ALTER TABLE inventory_items ADD COLUMN rack_number VARCHAR(50) DEFAULT NULL AFTER location');
            console.log(' + Added rack_number to inventory_items');
        }

        // 3. Update Job Items (Crucial for Salary)
        console.log('Updating Job Items schema...');
        const [jobItemCols] = await connection.query('DESCRIBE job_items');
        const jobItemFields = jobItemCols.map(c => c.Field);

        if (!jobItemFields.includes('mechanic_id')) {
            await connection.query('ALTER TABLE job_items ADD COLUMN mechanic_id INT DEFAULT NULL AFTER job_card_id');
            console.log(' + Added mechanic_id to job_items');
        }

        console.log('✅ Phase 1 Migrations Complete.');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();

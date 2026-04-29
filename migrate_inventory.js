const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./config/db');

async function migrateInventory() {
    try {
        console.log('Starting Inventory and Services Migration...');

        // Check connection
        await db.query('SELECT 1');
        console.log('DB Connection Check: OK');

        // 1. Create inventory_items table (Spares)
        await db.query(`
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
        console.log('✅ inventory_items table created/verified.');

        // 2. Create service_items table (Services/Labour)
        await db.query(`
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
        console.log('✅ service_items table created/verified.');

        console.log('🎉 Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrateInventory();

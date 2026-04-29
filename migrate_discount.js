const db = require('./config/db');

async function migrate() {
    try {
        console.log('Running migration: Add discount to job_items...');
        // The pool already has the database from .env
        const [columns] = await db.query('SHOW COLUMNS FROM job_items LIKE "discount"');
        if (columns.length === 0) {
            await db.query('ALTER TABLE job_items ADD COLUMN discount DECIMAL(10,2) DEFAULT 0 AFTER rate');
            console.log('✅ Column "discount" added to job_items table.');
        } else {
            console.log('ℹ️ Column "discount" already exists.');
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();

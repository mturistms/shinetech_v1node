const db = require('./config/db');

async function migrate() {
    try {
        console.log('Running migration...');
        await db.query('ALTER TABLE job_cards ADD COLUMN estimated_amount DECIMAL(10,2) DEFAULT 0.00');
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();

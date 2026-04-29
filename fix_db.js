const pool = require('./config/db');

async function run() {
    try {
        console.log('STARTING_MIGRATION');
        const [rows] = await pool.query('SHOW TABLES');
        console.log('TABLES_FOUND:', JSON.stringify(rows));

        const [columns] = await pool.query('SHOW COLUMNS FROM job_items LIKE "discount"');
        if (columns.length === 0) {
            await pool.query('ALTER TABLE job_items ADD COLUMN discount DECIMAL(10,2) DEFAULT 0 AFTER rate');
            console.log('MIGRATION_SUCCESS');
        } else {
            console.log('MIGRATION_ALREADY_DONE');
        }
        process.exit(0);
    } catch (e) {
        console.error('MIGRATION_ERROR:', e.message);
        process.exit(1);
    }
}

run();

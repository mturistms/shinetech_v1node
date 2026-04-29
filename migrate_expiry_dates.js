const db = require('./config/db');

async function migrate() {
    try {
        console.log('Starting migration...');

        // Add columns to vehicles
        const [vehiclesCols] = await db.query('SHOW COLUMNS FROM vehicles');
        const vColNames = vehiclesCols.map(c => c.Field);

        if (!vColNames.includes('insurance_expiry')) {
            await db.query('ALTER TABLE vehicles ADD COLUMN insurance_expiry DATE AFTER km_run');
            console.log('Added insurance_expiry to vehicles');
        }
        if (!vColNames.includes('pollution_expiry')) {
            await db.query('ALTER TABLE vehicles ADD COLUMN pollution_expiry DATE AFTER insurance_expiry');
            console.log('Added pollution_expiry to vehicles');
        }
        if (!vColNames.includes('registration_expiry')) {
            await db.query('ALTER TABLE vehicles ADD COLUMN registration_expiry DATE AFTER pollution_expiry');
            console.log('Added registration_expiry to vehicles');
        }

        // Add columns to job_cards
        const [jobCols] = await db.query('SHOW COLUMNS FROM job_cards');
        const jColNames = jobCols.map(c => c.Field);

        if (!jColNames.includes('due_reminder_date')) {
            await db.query('ALTER TABLE job_cards ADD COLUMN due_reminder_date DATE AFTER next_service_date');
            console.log('Added due_reminder_date to job_cards');
        }

        if (!jColNames.includes('is_gate_pass_generated')) {
            await db.query('ALTER TABLE job_cards ADD COLUMN is_gate_pass_generated BOOLEAN DEFAULT FALSE');
            console.log('Added is_gate_pass_generated to job_cards');
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

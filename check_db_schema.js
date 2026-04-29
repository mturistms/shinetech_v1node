const db = require('./config/db');

async function check() {
    try {
        const [columns] = await db.query('SHOW COLUMNS FROM job_cards');
        console.log('JOB_CARDS COLUMNS:');
        console.table(columns);

        const [vColumns] = await db.query('SHOW COLUMNS FROM vehicles');
        console.log('VEHICLES COLUMNS:');
        console.table(vColumns);

        const [cColumns] = await db.query('SHOW COLUMNS FROM customers');
        console.log('CUSTOMERS COLUMNS:');
        console.table(cColumns);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();

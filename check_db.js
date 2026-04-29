const db = require('./config/db');

async function checkTable() {
    try {
        const [rows] = await db.query('DESCRIBE job_cards');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTable();

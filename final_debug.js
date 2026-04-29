const db = require('./config/db');
const fs = require('fs');

async function run() {
    let output = '';
    try {
        const [jobColumns] = await db.query('SHOW COLUMNS FROM job_cards');
        output += 'JOB_CARDS:\n' + JSON.stringify(jobColumns, null, 2) + '\n';

        const [vehColumns] = await db.query('SHOW COLUMNS FROM vehicles');
        output += 'VEHICLES:\n' + JSON.stringify(vehColumns, null, 2) + '\n';

        const [custColumns] = await db.query('SHOW COLUMNS FROM customers');
        output += 'CUSTOMERS:\n' + JSON.stringify(custColumns, null, 2) + '\n';
    } catch (e) {
        output += 'ERROR: ' + e.message + '\n';
    } finally {
        fs.writeFileSync('schema_output.txt', output);
        process.exit(0);
    }
}
run();

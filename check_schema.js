const db = require('./config/db');

async function checkSchema() {
    try {
        const [items] = await db.query('DESCRIBE job_items');
        console.log('JOB_ITEMS_SCHEMA:', JSON.stringify(items, null, 2));

        const [inventory] = await db.query('DESCRIBE inventory_items');
        console.log('INVENTORY_ITEMS_SCHEMA:', JSON.stringify(inventory, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();

const db = require('./config/db');
console.log('Starting diag...');
async function run() {
    try {
        console.log('Querying staff...');
        const [staff] = await db.query('SELECT id, name, designation, status, is_deleted FROM staff');
        console.log('--- STAFF (' + staff.length + ') ---');
        staff.forEach(s => console.log(s.name + ' | ' + s.designation + ' | ' + s.status + ' | deleted:' + s.is_deleted));

        console.log('Querying categories...');
        const [categories] = await db.query('SELECT DISTINCT category FROM job_items');
        console.log('--- CATEGORIES ---');
        console.log(categories.map(c => c.category).join(', '));

        console.log('Querying mechanical items...');
        const [mechanic_items] = await db.query("SELECT item_name, category, mechanic_id, job_card_id FROM job_items WHERE category LIKE '%Mechanical%'");
        console.log('--- MECHANICAL ITEMS (' + mechanic_items.length + ') ---');
        mechanic_items.forEach(i => console.log(i.item_name + ' | ' + i.category + ' | mech_id:' + i.mechanic_id));

        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error('ERROR:', e);
        process.exit(1);
    }
}
run();

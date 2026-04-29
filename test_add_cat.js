const db = require('./config/db');
async function run() {
    try {
        await db.query('INSERT INTO categories (name, type, is_deleted) VALUES ("AntigravityTest", "both", FALSE) ON DUPLICATE KEY UPDATE is_deleted = FALSE');
        const [rows] = await db.query('SELECT * FROM categories WHERE is_deleted = FALSE');
        console.log('Categories Count:', rows.length);
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();

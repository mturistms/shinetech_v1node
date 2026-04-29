const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function fixMechanicIds() {
    console.log('Fixing Mechanic IDs in Job Cards...');
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        // 1. Get old mechanics
        const [mechanics] = await connection.query('SELECT * FROM mechanics');
        console.log(`Found ${mechanics.length} legacy mechanics.`);

        // 2. Get new staff
        const [staff] = await connection.query('SELECT * FROM staff');
        console.log(`Found ${staff.length} staff members.`);

        // 3. Map Old ID -> New ID
        let updateCount = 0;
        for (const m of mechanics) {
            const s = staff.find(st => st.name.toLowerCase() === m.name.toLowerCase());
            if (s) {
                if (m.id === s.id) {
                    console.log(`Mechanic ${m.name} has same ID (${m.id}). No update needed.`);
                } else {
                    console.log(`Mapping ${m.name}: Old ID ${m.id} -> New ID ${s.id}`);
                    // 4. Update Jobs
                    const [res] = await connection.query('UPDATE job_cards SET mechanic_id = ? WHERE mechanic_id = ?', [s.id, m.id]);
                    console.log(`  Updated ${res.affectedRows} jobs.`);
                    updateCount += res.affectedRows;
                }
            } else {
                console.log(`Warning: Legacy mechanic ${m.name} not found in Staff table.`);
            }
        }

        console.log(`Total job cards updated: ${updateCount}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

fixMechanicIds();

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function setupStaff() {
    console.log('Setting up Staff table...');
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected.');

        // 1. Create staff table
        console.log('Creating table `staff`...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id INT AUTO_INCREMENT PRIMARY KEY,
                photo VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                age INT,
                phone VARCHAR(20),
                designation VARCHAR(255) DEFAULT 'Employee',
                email VARCHAR(255),
                aadhar VARCHAR(50),
                address TEXT,
                native_place VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Table `staff` created/verified.');

        // 2. Migrate existing mechanics if empty
        const [staffRows] = await connection.query('SELECT COUNT(*) as count FROM staff');
        if (staffRows[0].count === 0) {
            console.log('Staff table empty. Checking for legacy mechanics...');
            // check if mechanics table exists
            try {
                const [mechRows] = await connection.query('SELECT * FROM mechanics');
                if (mechRows.length > 0) {
                    console.log(`Found ${mechRows.length} mechanics. Migrating...`);
                    for (const m of mechRows) {
                        try {
                            await connection.execute(
                                'INSERT INTO staff (name, phone, designation, status) VALUES (?, ?, ?, ?)',
                                [m.name, m.mobile, 'Employee', m.status || 'active']
                            );
                        } catch (e) {
                            console.error(`Failed to migrate mechanic ${m.name}:`, e.message);
                        }
                    }
                    console.log('Migration done.');
                }
            } catch (err) {
                console.log('Mechanics table likely does not exist or error accessing it. Skipping migration.');
            }
        } else {
            console.log('Staff table already has data. Skipping migration.');
        }

        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

setupStaff();

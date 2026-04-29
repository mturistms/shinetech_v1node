const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @route   GET api/workshop/deleted-records
 * @desc    Get all soft-deleted records across major tables
 */
router.get('/deleted-records', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const tables = ['job_cards', 'inventory_items', 'customers', 'staff', 'vendors', 'vehicles'];
        let results = {};

        for (const table of tables) {
            let sql = `SELECT * FROM ${table} WHERE is_deleted = TRUE`;

            // Add joins for better info if needed
            if (table === 'job_cards') {
                sql = `
                    SELECT j.*, v.plate_number, c.name as customer_name 
                    FROM job_cards j
                    JOIN vehicles v ON j.vehicle_id = v.id
                    JOIN customers c ON v.customer_id = c.id
                    WHERE j.is_deleted = TRUE
                `;
            } else if (table === 'vehicles') {
                sql = `
                    SELECT v.*, c.name as customer_name 
                    FROM vehicles v
                    JOIN customers c ON v.customer_id = c.id
                    WHERE v.is_deleted = TRUE
                `;
            }

            const [rows] = await db.query(sql);
            results[table] = rows;
        }

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   POST api/workshop/restore/:type/:id
 * @desc    Restore a soft-deleted record
 */
router.post('/restore/:type/:id', authenticate, authorize(['admin']), async (req, res) => {
    const { type, id } = req.params;
    const validTables = ['job_cards', 'inventory_items', 'customers', 'staff', 'vendors', 'vehicles', 'job_items'];

    if (!validTables.includes(type)) {
        return res.status(400).json({ error: 'Invalid record type' });
    }

    try {
        await db.execute(`UPDATE ${type} SET is_deleted = FALSE WHERE id = ?`, [id]);
        res.json({ message: 'Record restored successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/workshop/service-history
 * @desc    Global Service History View
 */
router.get('/service-history', authenticate, async (req, res) => {
    try {
        const { startDate, endDate, status, search } = req.query;
        let sql = `
            SELECT j.*, v.plate_number, v.model_name, v.brand_name, c.name as customer_name, c.mobile as customer_mobile
            FROM job_cards j
            JOIN vehicles v ON j.vehicle_id = v.id
            JOIN customers c ON v.customer_id = c.id
            WHERE j.is_deleted = FALSE
        `;
        let params = [];

        if (startDate && endDate) {
            sql += ` AND j.job_date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        if (status) {
            sql += ` AND j.status = ?`;
            params.push(status);
        }
        if (search) {
            sql += ` AND (v.plate_number LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)`;
            const searchVal = `%${search}%`;
            params.push(searchVal, searchVal, searchVal);
        }

        sql += ` ORDER BY j.job_date DESC`;

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;

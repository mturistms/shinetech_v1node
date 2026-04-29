const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// GET all vendors
router.get('/', authenticate, async (req, res) => {
    try {
        const sql = `
            SELECT v.*, COUNT(i.id) as part_count 
            FROM vendors v 
            LEFT JOIN inventory_items i ON v.id = i.vendor_id AND i.is_deleted = FALSE 
            WHERE v.is_deleted = FALSE
            GROUP BY v.id 
            ORDER BY v.name ASC
        `;
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching vendors' });
    }
});

// POST create vendor
router.post('/', authenticate, [
    body('name').trim().notEmpty().withMessage('Vendor Name is required'),
    body('phone').optional({ checkFalsy: true }).trim(),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, contact_person, phone, email, address, gst_number } = req.body;

    try {
        const [result] = await db.execute(
            'INSERT INTO vendors (name, contact_person, phone, email, address, gst_number) VALUES (?, ?, ?, ?, ?, ?)',
            [name, contact_person, phone, email, address, gst_number]
        );
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error adding vendor' });
    }
});

// PUT update vendor
router.put('/:id', authenticate, [
    param('id').isInt().toInt(),
    body('name').optional().trim().notEmpty(),
], async (req, res) => {
    const { id } = req.params;
    const { name, contact_person, phone, email, address, gst_number, status } = req.body;

    try {
        const fields = [];
        const values = [];
        if (name) { fields.push('name = ?'); values.push(name); }
        if (contact_person !== undefined) { fields.push('contact_person = ?'); values.push(contact_person); }
        if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
        if (email !== undefined) { fields.push('email = ?'); values.push(email); }
        if (address !== undefined) { fields.push('address = ?'); values.push(address); }
        if (gst_number !== undefined) { fields.push('gst_number = ?'); values.push(gst_number); }
        if (status !== undefined) { fields.push('status = ?'); values.push(status); }

        if (fields.length === 0) return res.json({ message: 'No changes' });

        values.push(id);
        await db.execute(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, values);
        res.json({ message: 'Vendor updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error updating vendor' });
    }
});

// GET vendor history (items supplied and their consumption)
router.get('/:id/history', authenticate, async (req, res) => {
    try {
        const sql = `
            SELECT i.name as part_name, i.part_number, i.stock,
                   ji.qty as consumed_qty, ji.amount as total_amount,
                   jc.id as job_id, jc.job_date, jc.status as job_status,
                   c.name as customer_name
            FROM inventory_items i
            LEFT JOIN job_items ji ON i.id = ji.inventory_id
            LEFT JOIN job_cards jc ON ji.job_id = jc.id
            LEFT JOIN vehicles v ON jc.vehicle_id = v.id
            LEFT JOIN customers c ON v.customer_id = c.id
            WHERE i.vendor_id = ? AND i.is_deleted = FALSE
            ORDER BY jc.job_date DESC
        `;
        const [rows] = await db.query(sql, [req.params.id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching vendor history' });
    }
});

// DELETE vendor
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
        // Check for dependencies (Inventory)
        const [inv] = await db.query('SELECT id FROM inventory_items WHERE vendor_id = ? LIMIT 1', [req.params.id]);
        if (inv.length > 0) {
            return res.status(400).json({ message: 'Cannot delete vendor with linked inventory items' });
        }

        await db.execute('DELETE FROM vendors WHERE id = ?', [req.params.id]);
        res.json({ message: 'Vendor deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error deleting vendor' });
    }
});

module.exports = router;

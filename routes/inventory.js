const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==========================================
// CATEGORIES
// ==========================================

// GET /api/inventory/categories
router.get('/categories', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories WHERE is_deleted = FALSE ORDER BY name ASC');
        console.log(`[GET /categories] Found ${rows.length} active categories`);
        res.json(rows);
    } catch (err) {
        console.error('[GET /categories] Error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// POST /api/inventory/categories
router.post('/categories', async (req, res) => {
    const { name, type } = req.body;
    console.log(`[POST /categories] Attempting to add: "${name}" type: ${type}`);
    try {
        // Use ON DUPLICATE KEY UPDATE to handle existing categories (including deleted ones)
        const [result] = await db.query(
            'INSERT INTO categories (name, type, is_deleted) VALUES (?, ?, FALSE) ON DUPLICATE KEY UPDATE type = VALUES(type), is_deleted = FALSE',
            [name, type || 'both']
        );

        const [rows] = await db.query('SELECT id FROM categories WHERE name = ?', [name]);
        const id = result.insertId || rows[0].id;
        console.log(`[POST /categories] Success: ID ${id}`);
        res.json({ id, name, type: type || 'both' });
    } catch (err) {
        console.error('[POST /categories] Error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// DELETE /api/inventory/categories/:id
router.delete('/categories/:id', async (req, res) => {
    try {
        await db.query('UPDATE categories SET is_deleted = TRUE WHERE id = ?', [req.params.id]);
        res.json({ msg: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// ==========================================
// UNIFIED MASTER ITEMS (SPARES & SERVICES)
// ==========================================

// GET /api/inventory/items
router.get('/items', async (req, res) => {
    const { type, category } = req.query;
    let sql = `
        SELECT i.*, v.name as vendor_name, c.name as category_display_name
        FROM master_items i 
        LEFT JOIN vendors v ON i.vendor_id = v.id 
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.is_deleted = FALSE
    `;
    const params = [];

    if (type && type !== 'both') {
        sql += ' AND (i.item_type = ? OR i.item_type = "both")';
        params.push(type);
    }

    if (category) {
        sql += ' AND (i.category_name = ? OR c.name = ?)';
        params.push(category, category);
    }

    sql += ' ORDER BY i.name ASC';

    try {
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// GET /api/inventory/spares (Legacy Wrapper)
router.get('/spares', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT i.*, v.name as vendor_name 
            FROM master_items i 
            LEFT JOIN vendors v ON i.vendor_id = v.id 
            WHERE i.is_deleted = FALSE AND (i.item_type = 'spare' OR i.item_type = 'both')
            ORDER BY i.created_at DESC
        `);
        res.json(rows.map(r => ({ ...r, category: r.category_name || r.category })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// GET /api/inventory/services (Legacy Wrapper)
router.get('/services', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT *, sale_price as cost FROM master_items 
            WHERE is_deleted = FALSE AND (item_type = 'service' OR item_type = 'both')
            ORDER BY name ASC
        `);
        res.json(rows.map(r => ({ ...r, category: r.category_name || r.category, cost: r.sale_price })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// POST /api/inventory/items
router.post('/items', async (req, res) => {
    const {
        name, item_type, category_id, category_name, part_number,
        stock, low_stock_threshold, purchase_price, sale_price,
        estimated_time_minutes, rack_number, vendor_id, unit, description
    } = req.body;

    try {
        const [result] = await db.query(
            `INSERT INTO master_items 
            (name, item_type, category_id, category_name, part_number, stock, low_stock_threshold, purchase_price, sale_price, estimated_time_minutes, rack_number, vendor_id, unit, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, item_type || 'spare', category_id || null, category_name || null, part_number || '',
                stock || 0, low_stock_threshold || 5, purchase_price || 0, sale_price || 0,
                estimated_time_minutes || 0, rack_number || null, vendor_id || null, unit || 'pcs', description || null
            ]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Legacy POST routes
router.post('/spares', async (req, res) => {
    const { name, part_number, stock, low_stock_threshold, sale_price, purchase_price, category, rack_number, vendor_id } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO master_items (name, item_type, part_number, stock, low_stock_threshold, sale_price, purchase_price, category_name, rack_number, vendor_id) VALUES (?, "spare", ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, part_number || '', stock || 0, low_stock_threshold || 5, sale_price || 0, purchase_price || 0, category || 'spare', rack_number || null, vendor_id || null]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

router.post('/services', async (req, res) => {
    const { name, cost, category, estimated_time_minutes } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO master_items (name, item_type, sale_price, category_name, estimated_time_minutes) VALUES (?, "service", ?, ?, ?)',
            [name, cost || 0, category || 'labour', estimated_time_minutes || 0]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// PUT /api/inventory/items/:id
router.put('/items/:id', async (req, res) => {
    const {
        name, item_type, category_id, category_name, part_number,
        stock, low_stock_threshold, purchase_price, sale_price,
        estimated_time_minutes, rack_number, vendor_id, unit, description
    } = req.body;

    try {
        await db.query(
            `UPDATE master_items SET 
            name=?, item_type=?, category_id=?, category_name=?, part_number=?, 
            stock=?, low_stock_threshold=?, purchase_price=?, sale_price=?, 
            estimated_time_minutes=?, rack_number=?, vendor_id=?, unit=?, description=? 
            WHERE id=?`,
            [
                name, item_type, category_id, category_name, part_number,
                stock, low_stock_threshold, purchase_price, sale_price,
                estimated_time_minutes, rack_number, vendor_id, unit, description, req.params.id
            ]
        );
        res.json({ msg: 'Updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Legacy PUT/DELETE routes
router.put('/spares/:id', async (req, res) => {
    const { name, part_number, stock, low_stock_threshold, sale_price, purchase_price, category, rack_number, vendor_id } = req.body;
    try {
        await db.query(
            'UPDATE master_items SET name=?, part_number=?, stock=?, low_stock_threshold=?, sale_price=?, purchase_price=?, category_name=?, rack_number=?, vendor_id=? WHERE id=?',
            [name, part_number, stock, low_stock_threshold, sale_price, purchase_price, category, rack_number, vendor_id, req.params.id]
        );
        res.json({ msg: 'Updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

router.delete('/spares/:id', async (req, res) => {
    try {
        await db.query('UPDATE master_items SET is_deleted = TRUE WHERE id = ?', [req.params.id]);
        res.json({ msg: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

router.delete('/services/:id', async (req, res) => {
    try {
        await db.query('UPDATE master_items SET is_deleted = TRUE WHERE id = ?', [req.params.id]);
        res.json({ msg: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;

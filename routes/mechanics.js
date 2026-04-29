const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// ============================================================================
// GET ALL MECHANICS
// ============================================================================

/**
 * @route   GET api/mechanics
 * @desc    Get all active mechanics
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, phone as mobile, status FROM staff WHERE status = "active" AND designation != "Manager"');
        res.json(rows);
    } catch (err) {
        console.error('Get mechanics error:', err.message);
        res.status(500).json({ error: 'Server Error', message: 'Failed to fetch mechanics' });
    }
});

// ============================================================================
// ADD MECHANIC
// ============================================================================

/**
 * @route   POST api/mechanics
 * @desc    Add new mechanic
 * @access  Private (Admin Only)
 */
router.post('/',
    authenticate,
    authorize(['admin']),
    [
        body('name').trim().notEmpty().escape().withMessage('Mechanic name is required'),
        body('mobile').optional().trim().matches(/^[0-9]{10}$/).withMessage('Mobile must be 10 digits')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, mobile } = req.body;
        try {
            const [result] = await db.execute(
                'INSERT INTO mechanics (name, mobile, status, created_at) VALUES (?, ?, "active", NOW())',
                [name, mobile || null]
            );
            res.status(201).json({
                message: 'Mechanic added successfully',
                id: result.insertId,
                name,
                mobile,
                status: 'active'
            });
        } catch (err) {
            console.error('Add mechanic error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to add mechanic' });
        }
    }
);

// ============================================================================
// UPDATE MECHANIC
// ============================================================================

/**
 * @route   PUT api/mechanics/:id
 * @desc    Update mechanic info or status
 * @access  Private (Admin Only)
 */
router.put('/:id',
    authenticate,
    authorize(['admin']),
    [
        param('id').isInt().toInt(),
        body('name').optional().trim().notEmpty().escape(),
        body('mobile').optional().trim().matches(/^[0-9]{10}$/),
        body('status').optional().isIn(['active', 'inactive']).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { name, mobile, status } = req.body;
        const mechanicId = req.params.id;

        try {
            const fields = [];
            const values = [];

            if (name !== undefined) { fields.push('name = ?'); values.push(name); }
            if (mobile !== undefined) { fields.push('mobile = ?'); values.push(mobile); }
            if (status !== undefined) { fields.push('status = ?'); values.push(status); }

            if (fields.length === 0) return res.status(400).json({ error: 'Bad Request', message: 'No fields to update' });

            values.push(mechanicId);

            const [result] = await db.execute(`UPDATE mechanics SET ${fields.join(', ')} WHERE id = ?`, values);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Not Found', message: 'Mechanic not found' });
            }

            res.json({ message: 'Mechanic updated successfully' });
        } catch (err) {
            console.error('Update mechanic error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to update mechanic' });
        }
    }
);

module.exports = router;

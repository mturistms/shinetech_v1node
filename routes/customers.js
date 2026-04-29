const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// ============================================================================
// GET ALL CUSTOMERS
// ============================================================================

/**
 * @route   GET api/customers
 * @desc    Get all customers with pagination and search
 * @access  Private
 */
router.get('/',
    authenticate,
    [
        query('page').optional().isInt({ min: 1 }).toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('search').optional().trim()
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const page = req.query.page || 1;
            const limit = req.query.limit || 50;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            let query = 'SELECT * FROM customers WHERE 1=1';
            let params = [];

            // Search filter (parameterized)
            if (search) {
                query += ' AND (name LIKE ? OR mobile LIKE ? OR email LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            // Execute query with parameterized values
            const [customers] = await db.query(query, params);

            // Get total count for pagination
            const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM customers');

            res.json({
                customers,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });

        } catch (err) {
            console.error('Get customers error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to fetch customers'
            });
        }
    }
);

// ============================================================================
// GET SINGLE CUSTOMER
// ============================================================================

/**
 * @route   GET api/customers/:id
 * @desc    Get customer by ID
 * @access  Private
 */
router.get('/:id',
    authenticate,
    [
        param('id').isInt().toInt().withMessage('Invalid customer ID')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const customerId = req.params.id;

            // Parameterized query - prevents SQL injection
            const [customers] = await db.query(
                'SELECT * FROM customers WHERE id = ?',
                [customerId]
            );

            if (customers.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Customer not found'
                });
            }

            res.json(customers[0]);

        } catch (err) {
            console.error('Get customer error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to fetch customer'
            });
        }
    }
);

// ============================================================================
// CREATE CUSTOMER
// ============================================================================

/**
 * @route   POST api/customers
 * @desc    Add new customer
 * @access  Private
 */
router.post('/',
    authenticate,
    [
        body('name')
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('Name must be 1-100 characters'),
        body('mobile')
            .optional({ checkFalsy: true })
            .trim()
            .custom(value => {
                if (!value) return true;
                return /^[0-9]{10}$/.test(value);
            })
            .withMessage('Mobile must be 10 digits'),
        body('email')
            .optional()
            .trim()
            .isEmail()
            .normalizeEmail()
            .withMessage('Invalid email address'),
        body('address')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Address must not exceed 500 characters'),
        body('alternate_number')
            .optional({ checkFalsy: true })
            .trim()
            .custom(value => {
                if (!value) return true;
                return /^[0-9]{10}$/.test(value);
            })
            .withMessage('Alternate number must be 10 digits')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.error('Customer Validation Errors:', JSON.stringify(errors.array(), null, 2));
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, mobile, address, email, alternate_number } = req.body;

            // Check for duplicate mobile number (if provided)
            if (mobile) {
                const [existing] = await db.query(
                    'SELECT id FROM customers WHERE mobile = ?',
                    [mobile]
                );

                if (existing.length > 0) {
                    return res.status(400).json({
                        error: 'Duplicate entry',
                        message: 'A customer with this mobile number already exists'
                    });
                }
            }

            // Insert customer (parameterized query)
            const [result] = await db.execute(
                'INSERT INTO customers (name, mobile, alternate_number, address, email, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [name, mobile || null, alternate_number || null, address || null, email || null]
            );

            res.status(201).json({
                message: 'Customer created successfully',
                customer: {
                    id: result.insertId,
                    name,
                    mobile,
                    alternate_number: alternate_number || null,
                    address: address || null,
                    email: email || null
                }
            });

        } catch (err) {
            console.error('Create customer error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to create customer'
            });
        }
    }
);

// ============================================================================
// UPDATE CUSTOMER
// ============================================================================

/**
 * @route   PUT api/customers/:id
 * @desc    Update customer
 * @access  Private
 */
router.put('/:id',
    authenticate,
    [
        param('id').isInt().toInt().withMessage('Invalid customer ID'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('Name must be 1-100 characters'),
        body('mobile')
            .optional()
            .trim()
            .matches(/^[0-9]{10}$/)
            .withMessage('Mobile must be 10 digits'),
        body('email')
            .optional()
            .trim()
            .isEmail()
            .normalizeEmail()
            .withMessage('Invalid email address'),
        body('address')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Address must not exceed 500 characters'),
        body('alternate_number')
            .optional({ checkFalsy: true })
            .trim()
            .custom(value => {
                if (!value) return true;
                return /^[0-9]{10}$/.test(value);
            })
            .withMessage('Alternate number must be 10 digits')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const customerId = req.params.id;

            // Check if customer exists
            const [existing] = await db.query(
                'SELECT id FROM customers WHERE id = ?',
                [customerId]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Customer not found'
                });
            }

            // Build dynamic update query
            const updates = [];
            const values = [];

            if (req.body.name !== undefined) {
                updates.push('name = ?');
                values.push(req.body.name);
            }
            if (req.body.mobile !== undefined) {
                if (req.body.mobile) {
                    // Check for duplicate mobile (excluding current customer)
                    const [duplicate] = await db.query(
                        'SELECT id FROM customers WHERE mobile = ? AND id != ?',
                        [req.body.mobile, customerId]
                    );
                    if (duplicate.length > 0) {
                        return res.status(400).json({
                            error: 'Duplicate entry',
                            message: 'Another customer with this mobile number already exists'
                        });
                    }
                }
                updates.push('mobile = ?');
                values.push(req.body.mobile || null);
            }
            if (req.body.email !== undefined) {
                updates.push('email = ?');
                values.push(req.body.email);
            }
            if (req.body.address !== undefined) {
                updates.push('address = ?');
                values.push(req.body.address);
            }
            if (req.body.alternate_number !== undefined) {
                updates.push('alternate_number = ?');
                values.push(req.body.alternate_number || null);
            }

            if (updates.length === 0) {
                return res.status(400).json({
                    error: 'No data',
                    message: 'No fields to update'
                });
            }

            updates.push('updated_at = NOW()');
            values.push(customerId);

            // Execute update (parameterized query)
            await db.execute(
                `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`,
                values
            );

            // Return updated customer
            const [updated] = await db.query(
                'SELECT * FROM customers WHERE id = ?',
                [customerId]
            );

            res.json({
                message: 'Customer updated successfully',
                customer: updated[0]
            });

        } catch (err) {
            console.error('Update customer error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to update customer'
            });
        }
    }
);

// ============================================================================
// DELETE CUSTOMER
// ============================================================================

/**
 * @route   DELETE api/customers/:id
 * @desc    Delete customer (only if no associated vehicles/jobs)
 * @access  Private - Admin only
 */
router.delete('/:id',
    authenticate,
    authorize(['admin']), // Only admins can delete
    [
        param('id').isInt().toInt().withMessage('Invalid customer ID')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const customerId = req.params.id;

            // Check if customer has vehicles/jobs
            const [[{ vehicleCount }]] = await db.query(
                'SELECT COUNT(*) as vehicleCount FROM vehicles WHERE customer_id = ?',
                [customerId]
            );

            if (vehicleCount > 0) {
                return res.status(400).json({
                    error: 'Cannot delete',
                    message: 'Customer has associated vehicles. Please delete vehicles first or archive the customer instead.'
                });
            }

            // Delete customer (parameterized query)
            const [result] = await db.execute(
                'DELETE FROM customers WHERE id = ?',
                [customerId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Customer not found'
                });
            }

            res.json({
                message: 'Customer deleted successfully'
            });

        } catch (err) {
            console.error('Delete customer error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to delete customer'
            });
        }
    }
);

// ============================================================================
// CRM ENDPOINTS
// ============================================================================

/**
 * @route   GET api/customers/crm/reminders
 * @desc    Get upcoming service reminders
 */
router.get('/crm/reminders',
    authenticate,
    async (req, res) => {
        try {
            const { status, search, startDate, endDate } = req.query;
            let sql = `
                SELECT j.id as job_id, j.next_service_date, j.service_reminder_status, 
                       v.plate_number, v.model_name, v.brand_name,
                       c.id as customer_id, c.name as customer_name, c.mobile as customer_mobile
                FROM job_cards j
                JOIN vehicles v ON j.vehicle_id = v.id
                JOIN customers c ON v.customer_id = c.id
                WHERE j.next_service_date IS NOT NULL AND j.is_deleted = FALSE
            `;
            let params = [];

            if (status) {
                sql += ' AND j.service_reminder_status = ?';
                params.push(status);
            }
            if (startDate && endDate) {
                sql += ' AND j.next_service_date BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }
            if (search) {
                sql += ' AND (c.name LIKE ? OR c.mobile LIKE ? OR v.plate_number LIKE ?)';
                const s = `%${search}%`;
                params.push(s, s, s);
            }

            sql += ' ORDER BY j.next_service_date ASC';
            const [rows] = await db.query(sql, params);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    }
);

/**
 * @route   GET api/customers/crm/dues
 * @desc    Get customers with outstanding balances
 */
router.get('/crm/dues',
    authenticate,
    async (req, res) => {
        try {
            const sql = `
                SELECT c.id, c.name, c.mobile, 
                       SUM(j.total_amount - j.paid_amount) as total_due,
                       COUNT(j.id) as pending_jobs
                FROM customers c
                JOIN vehicles v ON v.customer_id = c.id
                JOIN job_cards j ON j.vehicle_id = v.id
                WHERE j.total_amount > j.paid_amount AND j.is_deleted = FALSE
                GROUP BY c.id
                ORDER BY total_due DESC
            `;
            const [rows] = await db.query(sql);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    }
);

/**
 * @route   PATCH api/customers/crm/reminders/:jobId
 * @desc    Update service reminder status
 */
router.patch('/crm/reminders/:jobId',
    authenticate,
    async (req, res) => {
        try {
            const { status } = req.body;
            await db.execute(
                'UPDATE job_cards SET service_reminder_status = ? WHERE id = ?',
                [status, req.params.jobId]
            );
            res.json({ message: 'Status updated' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    }
);

module.exports = router;

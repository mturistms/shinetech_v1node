const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// ============================================================================
// GET ALL VEHICLES
// ============================================================================

/**
 * @route   GET api/vehicles
 * @desc    Get all vehicles with customer info and job history
 * @access  Private
 */
router.get('/',
    authenticate,
    [
        query('customerId').optional().isInt().toInt(),
        query('search').optional().trim()
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            let query = `
                SELECT v.*, c.name as customer_name, c.mobile as customer_mobile, 
                       c.alternate_number as customer_alternate_number,
                       c.address as customer_address, c.email as customer_email,
                       (SELECT id FROM job_cards WHERE vehicle_id = v.id ORDER BY created_at DESC LIMIT 1) as last_job_id,
                       (SELECT job_date FROM job_cards WHERE vehicle_id = v.id ORDER BY job_date DESC, created_at DESC LIMIT 1) as doa,
                       (SELECT exit_date FROM job_cards WHERE vehicle_id = v.id AND status = 'delivered' ORDER BY exit_date DESC, created_at DESC LIMIT 1) as doe
                FROM vehicles v 
                JOIN customers c ON v.customer_id = c.id
                WHERE 1=1
            `;
            let params = [];

            // Filter by customer
            if (req.query.customerId) {
                query += ' AND v.customer_id = ?';
                params.push(req.query.customerId);
            }

            // Search filter
            if (req.query.search) {
                query += ' AND (v.plate_number LIKE ? OR v.model_name LIKE ? OR v.chassis_number LIKE ?)';
                const searchParam = `%${req.query.search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            query += ' ORDER BY v.created_at DESC';

            const [vehicles] = await db.query(query, params);
            res.json(vehicles);

        } catch (err) {
            console.error('Get vehicles error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to fetch vehicles'
            });
        }
    }
);

// ============================================================================
// GET SINGLE VEHICLE
// ============================================================================

/**
 * @route   GET api/vehicles/:id
 * @desc    Get vehicle by ID
 * @access  Private
 */
router.get('/:id',
    authenticate,
    [
        param('id').isInt().toInt().withMessage('Invalid vehicle ID')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const vehicleId = req.params.id;

            const [vehicles] = await db.query(`
                SELECT v.*, c.name as customer_name, c.mobile as customer_mobile, 
                       c.alternate_number as customer_alternate_number,
                       c.address as customer_address, c.email as customer_email
                FROM vehicles v
                JOIN customers c ON v.customer_id = c.id
                WHERE v.id = ?
            `, [vehicleId]);

            if (vehicles.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Vehicle not found'
                });
            }

            res.json(vehicles[0]);

        } catch (err) {
            console.error('Get vehicle error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to fetch vehicle'
            });
        }
    }
);

// ============================================================================
// CREATE VEHICLE
// ============================================================================

/**
 * @route   POST api/vehicles
 * @desc    Add new vehicle
 * @access  Private
 */
router.post('/',
    authenticate,
    [
        body('customer_id')
            .isInt()
            .toInt()
            .withMessage('Valid customer ID is required'),
        body('plate_number')
            .trim()
            .isLength({ min: 1, max: 20 })
            .matches(/^[A-Z0-9-]+$/i)
            .withMessage('Invalid plate number format'),
        body('model_name')
            .optional()
            .trim()
            .isLength({ max: 100 }),
        body('chassis_number')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .isAlphanumeric()
            .withMessage('Chassis number must be alphanumeric'),
        body('brand_name')
            .optional()
            .trim()
            .isLength({ max: 100 }),
        body('km_run')
            .optional({ checkFalsy: true })
            .isInt({ min: 0 })
            .toInt()
            .withMessage('KM run must be a positive number')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.error('Vehicle Validation Errors:', JSON.stringify(errors.array(), null, 2));
                return res.status(400).json({ errors: errors.array() });
            }

            const { customer_id, model_name, plate_number, chassis_number, brand_name, km_run } = req.body;

            // Verify customer exists
            const [customer] = await db.query(
                'SELECT id FROM customers WHERE id = ?',
                [customer_id]
            );

            if (customer.length === 0) {
                return res.status(400).json({
                    error: 'Invalid customer',
                    message: 'Customer ID does not exist'
                });
            }

            // Check for duplicate plate number
            const [existing] = await db.query(
                'SELECT id FROM vehicles WHERE plate_number = ?',
                [plate_number]
            );

            if (existing.length > 0) {
                return res.status(400).json({
                    error: 'Duplicate entry',
                    message: 'A vehicle with this plate number already exists'
                });
            }

            // Insert vehicle (parameterized query)
            const [result] = await db.execute(
                'INSERT INTO vehicles (customer_id, model_name, plate_number, chassis_number, brand_name, km_run, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                [customer_id, model_name || null, plate_number, chassis_number || null, brand_name || null, km_run || null]
            );

            res.status(201).json({
                message: 'Vehicle created successfully',
                vehicle: {
                    id: result.insertId,
                    customer_id,
                    model_name: model_name || null,
                    plate_number,
                    chassis_number: chassis_number || null,
                    brand_name: brand_name || null,
                    km_run: km_run || null
                }
            });

        } catch (err) {
            console.error('Create vehicle error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to create vehicle'
            });
        }
    }
);

// ============================================================================
// UPDATE VEHICLE
// ============================================================================

/**
 * @route   PUT api/vehicles/:id
 * @desc    Update vehicle
 * @access  Private
 */
router.put('/:id',
    authenticate,
    [
        param('id').isInt().toInt().withMessage('Invalid vehicle ID'),
        body('plate_number')
            .optional()
            .trim()
            .isLength({ min: 1, max: 20 })
            .matches(/^[A-Z0-9-]+$/i),
        body('model_name').optional().trim().isLength({ max: 100 }),
        body('chassis_number')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .isAlphanumeric(),
        body('brand_name').optional().trim().isLength({ max: 100 }),
        body('km_run').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt()
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const vehicleId = req.params.id;

            // Check if vehicle exists
            const [existing] = await db.query(
                'SELECT id FROM vehicles WHERE id = ?',
                [vehicleId]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Vehicle not found'
                });
            }

            // Build dynamic update query
            const updates = [];
            const values = [];

            if (req.body.plate_number !== undefined) {
                // Check for duplicate (excluding current vehicle)
                const [duplicate] = await db.query(
                    'SELECT id FROM vehicles WHERE plate_number = ? AND id != ?',
                    [req.body.plate_number, vehicleId]
                );
                if (duplicate.length > 0) {
                    return res.status(400).json({
                        error: 'Duplicate entry',
                        message: 'Another vehicle with this plate number already exists'
                    });
                }
                updates.push('plate_number = ?');
                values.push(req.body.plate_number);
            }
            if (req.body.model_name !== undefined) {
                updates.push('model_name = ?');
                values.push(req.body.model_name);
            }
            if (req.body.chassis_number !== undefined) {
                updates.push('chassis_number = ?');
                values.push(req.body.chassis_number);
            }
            if (req.body.brand_name !== undefined) {
                updates.push('brand_name = ?');
                values.push(req.body.brand_name);
            }
            if (req.body.km_run !== undefined) {
                updates.push('km_run = ?');
                values.push(req.body.km_run);
            }

            if (updates.length === 0) {
                return res.status(400).json({
                    error: 'No data',
                    message: 'No fields to update'
                });
            }

            updates.push('updated_at = NOW()');
            values.push(vehicleId);

            // Execute update
            await db.execute(
                `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`,
                values
            );

            // Return updated vehicle
            const [updated] = await db.query(
                'SELECT * FROM vehicles WHERE id = ?',
                [vehicleId]
            );

            res.json({
                message: 'Vehicle updated successfully',
                vehicle: updated[0]
            });

        } catch (err) {
            console.error('Update vehicle error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to update vehicle'
            });
        }
    }
);

// ============================================================================
// GET VEHICLE HISTORY
// ============================================================================

/**
 * @route   GET api/vehicles/:id/history
 * @desc    Get vehicle history (all job cards and items)
 * @access  Private
 */
router.get('/:id/history',
    authenticate,
    [
        param('id').isInt().toInt().withMessage('Invalid vehicle ID')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const vehicleId = req.params.id;

            // Verify vehicle exists
            const [vehicle] = await db.query(
                'SELECT id FROM vehicles WHERE id = ?',
                [vehicleId]
            );

            if (vehicle.length === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Vehicle not found'
                });
            }

            // Get all job cards for this vehicle
            const [jobs] = await db.query(`
                SELECT j.*, m.name as mechanic_name 
                FROM job_cards j
                LEFT JOIN mechanics m ON j.mechanic_id = m.id
                WHERE j.vehicle_id = ?
                ORDER BY j.job_date DESC, j.created_at DESC
            `, [vehicleId]);

            // For each job, get its items
            for (let job of jobs) {
                const [items] = await db.query(
                    'SELECT * FROM job_items WHERE job_card_id = ? ORDER BY created_at ASC',
                    [job.id]
                );
                job.items = items;
            }

            res.json(jobs);

        } catch (err) {
            console.error('Get vehicle history error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to fetch vehicle history'
            });
        }
    }
);

// ============================================================================
// DELETE VEHICLE
// ============================================================================

/**
 * @route   DELETE api/vehicles/:id
 * @desc    Delete vehicle (only if no job cards)
 * @access  Private - Admin only
 */
router.delete('/:id',
    authenticate,
    authorize(['admin']),
    [
        param('id').isInt().toInt().withMessage('Invalid vehicle ID')
    ],
    async (req, res) => {
        try {
            // Validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const vehicleId = req.params.id;

            // Check if vehicle has job cards
            const [[{ jobCount }]] = await db.query(
                'SELECT COUNT(*) as jobCount FROM job_cards WHERE vehicle_id = ?',
                [vehicleId]
            );

            if (jobCount > 0) {
                return res.status(400).json({
                    error: 'Cannot delete',
                    message: 'Vehicle has associated job cards. Please delete job cards first.'
                });
            }

            // Delete vehicle
            const [result] = await db.execute(
                'DELETE FROM vehicles WHERE id = ?',
                [vehicleId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'Vehicle not found'
                });
            }

            res.json({
                message: 'Vehicle deleted successfully'
            });

        } catch (err) {
            console.error('Delete vehicle error:', err);
            res.status(500).json({
                error: 'Server error',
                message: 'Failed to delete vehicle'
            });
        }
    }
);

module.exports = router;

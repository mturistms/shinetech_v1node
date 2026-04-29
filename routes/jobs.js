const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// ============================================================================
// GET ALL JOBS
// ============================================================================
// ============================================================================
// ============================================================================

/**
 * @route   GET api/jobs
 * @desc    Get all jobs with vehicle and customer info
 * @access  Private
 */
router.get('/',
    authenticate,
    [
        query('vehicleId').optional().isInt().toInt(),
        query('status').optional().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { vehicleId, status } = req.query;
            let sql = `
                SELECT j.*, v.plate_number, v.model_name, v.brand_name, v.km_run, v.chassis_number, v.customer_id, 
                       v.insurance_expiry, v.pollution_expiry, v.registration_expiry,
                       c.name as customer_name, c.mobile as customer_mobile, c.alternate_number as customer_alt_mobile, c.address as customer_address, 
                       m.name as mechanic_name,
                       (SELECT COUNT(*) FROM job_items WHERE job_card_id = j.id) as item_count
                FROM job_cards j
                JOIN vehicles v ON j.vehicle_id = v.id
                JOIN customers c ON v.customer_id = c.id
                LEFT JOIN staff m ON j.mechanic_id = m.id
                WHERE j.is_deleted = FALSE
            `;

            let params = [];
            if (vehicleId) {
                sql += " AND j.vehicle_id = ?";
                params.push(vehicleId);
            }
            if (status) {
                sql += " AND j.status = ?";
                params.push(status);
            }

            sql += " ORDER BY j.job_date DESC, j.created_at DESC";
            const [rows] = await db.query(sql, params);
            res.json(rows);
        } catch (err) {
            console.error('Get jobs error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to fetch jobs' });
        }
    }
);

// ============================================================================
// CREATE JOB CARD
// ============================================================================

/**
 * @route   POST api/jobs
 * @desc    Create new job card
 * @access  Private
 */
router.post('/',
    authenticate,
    [
        body('vehicle_id').isInt().toInt().withMessage('Valid Vehicle ID is required'),
        body('mechanic_id').optional({ checkFalsy: true }).isInt().toInt().withMessage('Invalid Mechanic ID'),
        body('status').optional({ checkFalsy: true }).isIn(['pending', 'in-progress', 'completed', 'delivered']).withMessage('Invalid status value'),
        body('notes').optional({ checkFalsy: true }).trim(),
        body('expected_delivery').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid delivery date format').toDate(),
        body('estimated_amount').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
        body('advance_amount').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('Job Validation Errors:', JSON.stringify(errors.array(), null, 2));
            return res.status(400).json({ errors: errors.array() });
        }

        const { vehicle_id, mechanic_id, status, notes, expected_delivery, estimated_amount, advance_amount } = req.body;

        try {
            // Verify vehicle exists
            const [vehicle] = await db.query('SELECT id FROM vehicles WHERE id = ?', [vehicle_id]);
            if (vehicle.length === 0) {
                return res.status(404).json({ error: 'Not Found', message: 'Vehicle not found' });
            }

            // Check for existing active job cards for the same vehicle
            const [activeJobs] = await db.query(
                'SELECT id FROM job_cards WHERE vehicle_id = ? AND status IN ("pending", "in-progress")',
                [vehicle_id]
            );

            if (activeJobs.length > 0) {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'An active job card already exists for this vehicle. Please complete or close it first.',
                    existingJobId: activeJobs[0].id
                });
            }

            const [result] = await db.execute(
                'INSERT INTO job_cards (vehicle_id, mechanic_id, status, notes, expected_delivery, estimated_amount, advance_amount, paid_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [vehicle_id, mechanic_id || null, status || 'pending', notes || null, expected_delivery || null, estimated_amount || 0, advance_amount || 0, advance_amount || 0]
            );

            const newJobId = result.insertId;

            // Record Income if advance is paid
            if (advance_amount > 0) {
                await db.execute(
                    'INSERT INTO incomes (category, amount, description, payment_method, job_card_id, transaction_date) VALUES (?, ?, ?, ?, ?, CURRENT_DATE)',
                    ['job_payment', advance_amount, `Advance Payment for Job #${newJobId}`, 'cash', newJobId]
                );
            }

            res.status(201).json({ id: newJobId, ...req.body });
        } catch (err) {
            console.error('Create job error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to create job card' });
        }
    }
);

// ============================================================================
// GET SINGLE JOB
// ============================================================================

/**
 * @route   GET api/jobs/:id
 * @desc    Get job by ID
 */
router.get('/:id',
    authenticate,
    [
        param('id').isInt().toInt()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        try {
            const sql = `
                SELECT j.*, v.plate_number, v.model_name, v.brand_name, v.km_run, v.chassis_number, 
                       c.name as customer_name, c.mobile as customer_mobile, c.alternate_number as customer_alt_mobile, c.address as customer_address, 
                       m.name as mechanic_name,
                       (SELECT COUNT(*) FROM job_items WHERE job_card_id = j.id) as item_count
                FROM job_cards j
                JOIN vehicles v ON j.vehicle_id = v.id
                JOIN customers c ON v.customer_id = c.id
                LEFT JOIN staff m ON j.mechanic_id = m.id
                WHERE j.id = ? AND j.is_deleted = FALSE
            `;
            const [rows] = await db.query(sql, [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Job not found' });
            res.json(rows[0]);
        } catch (err) {
            console.error('Get job by ID error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to fetch job details' });
        }
    }
);

// ============================================================================
// UPDATE JOB
// ============================================================================

/**
 * @route   PUT api/jobs/:id
 * @desc    Update job details (costs, status)
 */
router.put('/:id',
    authenticate,
    [
        param('id').isInt().toInt(),
        body('mechanic_id').optional().isInt().toInt(),
        body('washing_cost').optional().isFloat({ min: 0 }).toFloat(),
        body('outside_work_cost').optional().isFloat({ min: 0 }).toFloat(),
        body('spare_parts_cost').optional().isFloat({ min: 0 }).toFloat(),
        body('labour_cost').optional().isFloat({ min: 0 }).toFloat(),
        body('discount').optional().isFloat({ min: 0 }).toFloat(),
        body('status').optional().isIn(['pending', 'in-progress', 'completed', 'delivered']),
        body('notes').optional().trim(),
        body('expected_delivery').optional({ checkFalsy: true }).isISO8601().toDate(),
        body('next_service_date').optional({ checkFalsy: true }).isISO8601().toDate(),
        body('estimated_amount').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
        body('advance_amount').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const {
            mechanic_id,
            washing_cost,
            outside_work_cost,
            spare_parts_cost,
            labour_cost,
            discount,
            status,
            notes,
            expected_delivery,
            next_service_date,
            estimated_amount,
            advance_amount
        } = req.body;

        try {
            // Fetch current record for comparison
            const [currentRows] = await db.query('SELECT advance_amount, paid_amount FROM job_cards WHERE id = ?', [req.params.id]);
            if (currentRows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Job not found' });

            const currentJob = currentRows[0];
            const oldAdvance = parseFloat(currentJob.advance_amount) || 0;
            const currentPaid = parseFloat(currentJob.paid_amount) || 0;

            // Build dynamic query securely
            const fields = [];
            const values = [];

            if (mechanic_id !== undefined) { fields.push('mechanic_id = ?'); values.push(mechanic_id); }
            if (washing_cost !== undefined) { fields.push('washing_cost = ?'); values.push(washing_cost); }
            if (outside_work_cost !== undefined) { fields.push('outside_work_cost = ?'); values.push(outside_work_cost); }
            if (spare_parts_cost !== undefined) { fields.push('spare_parts_cost = ?'); values.push(spare_parts_cost); }
            if (labour_cost !== undefined) { fields.push('labour_cost = ?'); values.push(labour_cost); }
            if (discount !== undefined) { fields.push('discount = ?'); values.push(discount); }
            if (status !== undefined) { fields.push('status = ?'); values.push(status); }
            if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
            if (expected_delivery !== undefined) { fields.push('expected_delivery = ?'); values.push(expected_delivery); }
            if (next_service_date !== undefined) { fields.push('next_service_date = ?'); values.push(next_service_date); }
            if (estimated_amount !== undefined) { fields.push('estimated_amount = ?'); values.push(estimated_amount); }

            if (advance_amount !== undefined) {
                const newAdvance = parseFloat(advance_amount) || 0;
                const diff = newAdvance - oldAdvance;
                fields.push('advance_amount = ?');
                values.push(newAdvance);

                // Keep paid_amount in sync with advance_amount adjustments
                fields.push('paid_amount = ?');
                values.push(currentPaid + diff);
            }

            if (fields.length === 0) return res.status(400).json({ error: 'Bad Request', message: 'No fields to update' });

            values.push(req.params.id);

            const [result] = await db.execute(`UPDATE job_cards SET ${fields.join(', ')} WHERE id = ?`, values);

            // Re-calculate total_amount to account for discount changes
            await updateJobTotal(req.params.id);

            // Fetch updated job
            const [rows] = await db.query('SELECT * FROM job_cards WHERE id = ?', [req.params.id]);
            res.json(rows[0]);

        } catch (err) {
            console.error('Update job error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to update job' });
        }
    }
);

// ============================================================================
// SETTLE PAYMENT
// ============================================================================

/**
 * @route   POST api/jobs/:id/pay
 * @desc    Settle bill and record income
 * @access  Private (Admin or Staff)
 */
router.post('/:id/pay',
    authenticate,
    authorize(['admin', 'user']),
    [
        param('id').isInt().toInt(),
        body('amount').isFloat({ min: 0.01 }).toFloat().withMessage('Valid amount is required'),
        body('payment_method').optional().isIn(['cash', 'online', 'card', 'gpay'])
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { amount, payment_method } = req.body;
        const jobId = req.params.id;

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if job exists
            const [jobs] = await connection.query('SELECT status FROM job_cards WHERE id = ?', [jobId]);
            if (jobs.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Not Found', message: 'Job not found' });
            }

            // Fetch job total and current paid amount
            const [totalRows] = await connection.query('SELECT total_amount, paid_amount FROM job_cards WHERE id = ?', [jobId]);
            const jobData = totalRows[0];
            const isFullPayment = (parseFloat(jobData.paid_amount) + amount) >= parseFloat(jobData.total_amount);

            // Update Job Card (only set delivered if full payment)
            let updateSql = 'UPDATE job_cards SET paid_amount = paid_amount + ?';
            let updateParams = [amount];

            if (isFullPayment) {
                updateSql += ', status = "delivered", exit_date = CURRENT_DATE';
            }

            updateSql += ' WHERE id = ?';
            updateParams.push(jobId);

            await connection.execute(updateSql, updateParams);

            // Record Income
            await connection.execute(
                'INSERT INTO incomes (category, amount, description, payment_method, job_card_id, transaction_date) VALUES (?, ?, ?, ?, ?, CURRENT_DATE)',
                ['job_payment', amount, `Payment for Job #${jobId}`, payment_method || 'cash', jobId]
            );

            await connection.commit();
            res.json({ message: 'Payment recorded successfully' });
        } catch (err) {
            await connection.rollback();
            console.error('Payment processing error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to record payment' });
        } finally {
            connection.release();
        }
    }
);

/**
 * @route   POST api/jobs/:id/generate-invoice
 * @desc    Mark invoice as generated
 */
router.post('/:id/generate-invoice', authenticate, async (req, res) => {
    try {
        await db.execute(
            'UPDATE job_cards SET is_invoice_generated = TRUE, invoice_generated_at = NOW() WHERE id = ?',
            [req.params.id]
        );
        res.json({ message: 'Invoice marked as generated' });
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   POST api/jobs/:id/generate-gate-pass
 * @desc    Mark gate pass as generated and update expiry dates
 */
router.post('/:id/generate-gate-pass', authenticate, async (req, res) => {
    const {
        next_service_date,
        insurance_expiry,
        pollution_expiry,
        registration_expiry,
        due_reminder_date
    } = req.body;
    const jobId = req.params.id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Update Job Card status and dates
        await connection.execute(
            `UPDATE job_cards SET 
                is_gate_pass_generated = TRUE, 
                gate_pass_generated_at = NOW(),
                status = 'delivered',
                exit_date = IFNULL(exit_date, CURRENT_DATE),
                next_service_date = ?,
                due_reminder_date = ?
             WHERE id = ?`,
            [next_service_date || null, due_reminder_date || null, jobId]
        );

        // 2. Update Vehicle expiry dates
        const [job] = await connection.query('SELECT vehicle_id FROM job_cards WHERE id = ?', [jobId]);
        if (job.length > 0) {
            const vehicleId = job[0].vehicle_id;
            const vUpdates = [];
            const vParams = [];

            if (insurance_expiry) { vUpdates.push('insurance_expiry = ?'); vParams.push(insurance_expiry); }
            if (pollution_expiry) { vUpdates.push('pollution_expiry = ?'); vParams.push(pollution_expiry); }
            if (registration_expiry) { vUpdates.push('registration_expiry = ?'); vParams.push(registration_expiry); }

            if (vUpdates.length > 0) {
                vParams.push(vehicleId);
                await connection.execute(
                    `UPDATE vehicles SET ${vUpdates.join(', ')} WHERE id = ?`,
                    vParams
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Gate pass generated and vehicle updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Gate pass error:', err.message);
        res.status(500).json({ error: 'Server Error', message: err.message });
    } finally {
        connection.release();
    }
});

// ============================================================================
// JOB ITEMS MANAGEMENT
// ============================================================================

/**
 * @route   GET api/jobs/:id/items
 * @desc    Get all items for a job
 */
router.get('/:id/items',
    authenticate,
    [
        param('id').isInt().toInt()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        try {
            // Join with staff to get mechanic name
            const sql = `
                SELECT ji.*, s.name as mechanic_name 
                FROM job_items ji 
                LEFT JOIN staff s ON ji.mechanic_id = s.id 
                WHERE ji.job_card_id = ? 
                ORDER BY ji.created_at ASC
            `;
            const [rows] = await db.query(sql, [req.params.id]);
            res.json(rows);
        } catch (err) {
            console.error('Get job items error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to fetch job items' });
        }
    }
);

/**
 * @route   POST api/jobs/:id/items
 * @desc    Add item to job
 */
router.post('/:id/items',
    authenticate,
    [
        param('id').isInt().toInt(),
        body('item_name').trim().notEmpty().withMessage('Item name is required'),
        body('qty').optional().isFloat({ min: 0.01 }).toFloat(),
        body('rate').optional().isFloat({ min: 0 }).toFloat(),
        body('mechanic_id').optional({ checkFalsy: true }).isInt().toInt(),
        body('inventory_id').optional({ checkFalsy: true }).isInt().toInt()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { item_name, qty, rate, discount, category, mechanic_id, inventory_id } = req.body;
        const jobId = req.params.id;

        try {
            // Verify job exists
            const [job] = await db.query('SELECT id, mechanic_id FROM job_cards WHERE id = ?', [jobId]);
            if (job.length === 0) {
                return res.status(404).json({ error: 'Not Found', message: 'Job not found' });
            }

            // Default to job's main mechanic if not specified
            const actualMechanicId = mechanic_id || job[0].mechanic_id;

            // If inventory_id is provided, deduct stock
            if (inventory_id) {
                await db.execute('UPDATE master_items SET stock = stock - ? WHERE id = ?', [qty, inventory_id]);
            }

            const [result] = await db.execute(
                'INSERT INTO job_items (job_card_id, item_name, qty, rate, discount, category, mechanic_id, inventory_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [jobId, item_name, qty || 1, rate || 0, discount || 0, category || 'spare', actualMechanicId, inventory_id || null]
            );

            await updateJobTotal(jobId);

            // Fetch mechanic name for response
            let mechName = null;
            if (actualMechanicId) {
                const [m] = await db.query('SELECT name FROM staff WHERE id = ?', [actualMechanicId]);
                if (m.length > 0) mechName = m[0].name;
            }

            res.status(201).json({
                id: result.insertId,
                item_name,
                qty: qty || 1,
                rate: rate || 0,
                discount: discount || 0,
                amount: (qty || 1) * (rate || 0) - (discount || 0),
                category,
                mechanic_id: actualMechanicId,
                mechanic_name: mechName
            });
        } catch (err) {
            console.error('Add job item error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to add item' });
        }
    }
);

/**
 * @route   DELETE api/jobs/items/:id
 * @desc    Delete item
 */
router.delete('/items/:id',
    authenticate,
    [
        param('id').isInt().toInt()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        try {
            // Get item details first
            const [itemRows] = await db.query('SELECT * FROM job_items WHERE id = ?', [req.params.id]);
            if (itemRows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Item not found' });

            const item = itemRows[0];

            // If it's an inventory item, return stock
            if (item.inventory_id) {
                await db.execute('UPDATE master_items SET stock = stock + ? WHERE id = ?', [item.qty, item.inventory_id]);
            }

            await db.execute('DELETE FROM job_items WHERE id = ?', [req.params.id]);
            await updateJobTotal(item.job_card_id);

            res.json({ message: 'Item removed and stock returned' });
        } catch (err) {
            console.error('Delete job item error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to delete item' });
        }
    }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update job totals automatically when items change
 */
async function updateJobTotal(jobId) {
    try {
        // Sum all items from job_items (Rate * Qty - Discount)
        const [sumRows] = await db.query('SELECT SUM((qty * rate) - discount) as total FROM job_items WHERE job_card_id = ?', [jobId]);
        const itemsTotal = parseFloat(sumRows[0].total) || 0;

        // Fetch job notes to parse complaint rates and invoice-level discount
        const [jobRows] = await db.query('SELECT notes, discount FROM job_cards WHERE id = ?', [jobId]);
        let notesTotal = 0;
        let invoiceDiscount = 0;

        if (jobRows.length > 0) {
            invoiceDiscount = parseFloat(jobRows[0].discount) || 0;
            if (jobRows[0].notes) {
                const lines = jobRows[0].notes.split('\n');
                lines.forEach(line => {
                    const parts = line.split(' | ');
                    if (parts.length >= 4) {
                        const rateStr = parts[3] ? parts[3].trim() : '';
                        const rate = parseFloat(rateStr);
                        if (!isNaN(rate)) {
                            notesTotal += rate;
                        }
                    }
                });
            }
        }

        const grandTotal = itemsTotal + notesTotal - invoiceDiscount;

        // Update job_cards table
        await db.execute('UPDATE job_cards SET total_amount = ?, spare_parts_cost = ? WHERE id = ?', [grandTotal, itemsTotal, jobId]);
    } catch (err) {
        console.error('Update job total error:', err.message);
    }
}

/**
 * @route   DELETE api/jobs/:id
 * @desc    Soft delete job card
 */
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const [result] = await db.execute('UPDATE job_cards SET is_deleted = TRUE WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Job not found' });
        res.json({ message: 'Job card deleted (soft-delete)' });
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;

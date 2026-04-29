const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');

// ============================================================================
// RECORD INCOME
// ============================================================================

/**
 * @route   POST api/finance/income
 * @desc    Add miscellaneous income
 * @access  Private
 */
router.post('/income',
    authenticate,
    [
        body('amount').isFloat({ min: 0.01 }).toFloat().withMessage('Valid positive amount is required'),
        body('category').trim().notEmpty().escape().withMessage('Category is required'),
        body('description').optional().trim().escape(),
        body('payment_method').optional().isIn(['cash', 'online', 'card']).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { category, amount, description, payment_method } = req.body;

        try {
            const [result] = await db.execute(
                'INSERT INTO incomes (category, amount, description, payment_method, transaction_date) VALUES (?, ?, ?, ?, CURRENT_DATE)',
                [category, amount, description || null, payment_method || 'cash']
            );
            res.status(201).json({
                message: 'Income recorded successfully',
                id: result.insertId,
                category,
                amount,
                description,
                payment_method: payment_method || 'cash'
            });
        } catch (err) {
            console.error('Record income error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to record income' });
        }
    }
);

// ============================================================================
// RECORD EXPENSE
// ============================================================================

/**
 * @route   POST api/finance/expense
 * @desc    Add expense
 * @access  Private
 */
router.post('/expense',
    authenticate,
    [
        body('amount').isFloat({ min: 0.01 }).toFloat().withMessage('Valid positive amount is required'),
        body('category').trim().notEmpty().escape().withMessage('Category is required'),
        body('description').optional().trim().escape(),
        body('payment_method').optional().isIn(['cash', 'online', 'card', 'bank']).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { category, amount, description, payment_method } = req.body;

        try {
            const [result] = await db.execute(
                'INSERT INTO expenses (category, amount, description, payment_method, expense_date) VALUES (?, ?, ?, ?, CURRENT_DATE)',
                [category, amount, description || null, payment_method || 'cash']
            );
            res.status(201).json({
                message: 'Expense recorded successfully',
                id: result.insertId,
                category,
                amount,
                description,
                payment_method: payment_method || 'cash'
            });
        } catch (err) {
            console.error('Record expense error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to record expense' });
        }
    }
);

// ============================================================================
// FINANCE SUMMARY
// ============================================================================

/**
 * @route   GET api/finance/summary
 * @desc    Get Daily Profit & Loss Summary
 * @access  Private (Admin Only)
 */
router.get('/summary',
    authenticate,
    authorize(['admin']),
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
    ],
    async (req, res) => {
        try {
            const limit = req.query.limit || 30;
            const [rows] = await db.query('SELECT * FROM daily_summary_view ORDER BY report_date DESC LIMIT ?', [limit]);
            res.json(rows);
        } catch (err) {
            console.error('Get finance summary error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to fetch financial summary' });
        }
    }
);

// ============================================================================
// BANK TRANSACTIONS
// ============================================================================

/**
 * @route   POST api/finance/bank
 * @desc    Record Bank Transaction (Deposit/Withdrawal)
 * @access  Private (Admin Only)
 */
router.post('/bank',
    authenticate,
    authorize(['admin']),
    [
        body('type').isIn(['deposit', 'withdrawal']).withMessage('Invalid transaction type'),
        body('amount').isFloat({ min: 0.01 }).toFloat().withMessage('Valid positive amount is required'),
        body('description').optional().trim().escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { type, amount, description } = req.body;

        try {
            const [result] = await db.execute(
                'INSERT INTO bank_transactions (type, amount, description, transaction_date) VALUES (?, ?, ?, CURRENT_DATE)',
                [type, amount, description || null]
            );
            res.status(201).json({
                message: 'Bank transaction recorded successfully',
                id: result.insertId,
                type,
                amount,
                description
            });
        } catch (err) {
            console.error('Record bank transaction error:', err.message);
            res.status(500).json({ error: 'Server Error', message: 'Failed to record bank transaction' });
        }
    }
);

/**
 * @route   GET api/finance/transactions
 * @desc    Get all transactions (incomes and expenses) for Daybook
 */
router.get('/transactions', authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let params = [];
        let incomeSql = `SELECT 'income' as type, id, category, amount, description, payment_method, transaction_date as date FROM incomes`;
        let expenseSql = `SELECT 'expense' as type, id, category, amount, description, payment_method, expense_date as date FROM expenses`;

        if (startDate && endDate) {
            incomeSql += ` WHERE transaction_date BETWEEN ? AND ?`;
            expenseSql += ` WHERE expense_date BETWEEN ? AND ?`;
            params = [startDate, endDate];
        }

        const [incomes] = await db.query(incomeSql, params);
        const [expenses] = await db.query(expenseSql, params);

        const transactions = [...incomes, ...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(transactions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   PUT api/finance/transactions/:type/:id
 * @desc    Update a transaction
 */
router.put('/transactions/:type/:id', authenticate, async (req, res) => {
    const { type, id } = req.params;
    const { category, amount, description, payment_method, date } = req.body;
    try {
        const table = type === 'income' ? 'incomes' : 'expenses';
        const dateCol = type === 'income' ? 'transaction_date' : 'expense_date';

        await db.execute(
            `UPDATE ${table} SET category=?, amount=?, description=?, payment_method=?, ${dateCol}=? WHERE id=?`,
            [category, amount, description, payment_method, date, id]
        );
        res.json({ message: 'Transaction updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   DELETE api/finance/transactions/:type/:id
 * @desc    Delete a transaction
 */
router.delete('/transactions/:type/:id', authenticate, authorize(['admin']), async (req, res) => {
    const { type, id } = req.params;
    try {
        const table = type === 'income' ? 'incomes' : 'expenses';
        await db.execute(`DELETE FROM ${table} WHERE id=?`, [id]);
        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// ============================================================================
// REPORTING ENDPOINTS
// ============================================================================

/**
 * @route   GET api/finance/reports/salary
 * @desc    Calculate worker salaries based on assigned tasks
 */
router.get('/reports/salary', authenticate, async (req, res) => {
    try {
        const { startDate, endDate, allTime } = req.query;

        // Use allTime flag or direct params
        const useDateFilter = allTime !== 'true' && startDate && endDate;

        const sql = `
            SELECT 
                s.id as staff_id, 
                s.name as staff_name,
                ji.category,
                SUM(COALESCE((ji.qty * ji.rate) - ji.discount, 0)) as total_value,
                COUNT(ji.id) as task_count
            FROM staff s
            LEFT JOIN job_items ji ON (
                ji.is_deleted = 0 AND (
                    s.id = ji.mechanic_id OR (
                        ji.mechanic_id IS NULL AND s.id = (SELECT jc_sub.mechanic_id FROM job_cards jc_sub WHERE jc_sub.id = ji.job_card_id)
                    )
                )
                AND (
                    TRIM(LOWER(ji.category)) IN (
                        'mechanical service', 'mechanical services', 'wiring', 'washing', 'painting', 'dending', 'denting', 
                        'detailing', 'leyth', 'scanning', 'general service', 'general services', 'labour charges', 
                        'outside work', 'labour', 'outside_work', 'labour_charges', 'service', 'services',
                        'service charges', 'fitting charges', 'other charges', 'engine work', 'body work',
                        'technical service', 'technical services', 'electrical work', 'wiring work'
                    ) 
                    OR ji.category IS NULL
                )
            )
            LEFT JOIN job_cards jc ON ji.job_card_id = jc.id AND jc.is_deleted = 0
                ${useDateFilter ? 'AND jc.job_date BETWEEN ? AND ?' : ''}
            WHERE s.is_deleted = 0 
            AND s.status = 'active'
            AND LOWER(s.designation) NOT IN ('manager', 'admin')
            GROUP BY s.id, s.name, ji.category
            ORDER BY s.name ASC
        `;
        const params = useDateFilter ? [startDate, endDate] : [];
        const [rows] = await db.query(sql, params);

        // Group by staff
        const report = rows.reduce((acc, row) => {
            if (!acc[row.staff_id]) {
                acc[row.staff_id] = {
                    id: row.staff_id,
                    name: row.staff_name,
                    tasks: [],
                    grand_total: 0
                };
            }
            if (row.category || row.task_count > 0) {
                acc[row.staff_id].tasks.push({
                    category: row.category || 'Other',
                    value: row.total_value,
                    count: row.task_count
                });
                acc[row.staff_id].grand_total += parseFloat(row.total_value);
            }
            return acc;
        }, {});

        res.json(Object.values(report));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/finance/reports/salary/:staffId
 * @desc    Get detailed task history for a specific worker
 */
router.get('/reports/salary/:staffId', authenticate, async (req, res) => {
    try {
        const { staffId } = req.params;
        const { startDate, endDate, allTime } = req.query;

        const useDateFilter = allTime !== 'true' && startDate && endDate;

        const sql = `
            SELECT 
                ji.id,
                ji.item_name,
                ji.category,
                ji.qty,
                ji.rate,
                ji.discount,
                ((ji.qty * ji.rate) - ji.discount) as amount,
                jc.job_date,
                jc.id as job_id,
                v.plate_number
            FROM job_items ji
            JOIN job_cards jc ON ji.job_card_id = jc.id
            JOIN vehicles v ON jc.vehicle_id = v.id
            WHERE COALESCE(ji.mechanic_id, jc.mechanic_id) = ? 
            AND ji.is_deleted = 0 
            AND jc.is_deleted = 0
            AND (
                TRIM(LOWER(ji.category)) IN (
                    'mechanical service', 'mechanical services', 'wiring', 'washing', 'painting', 'dending', 'denting', 
                    'detailing', 'leyth', 'scanning', 'general service', 'general services', 'labour charges', 
                    'outside work', 'labour', 'outside_work', 'labour_charges', 'service', 'services',
                    'service charges', 'fitting charges', 'other charges', 'engine work', 'body work',
                    'technical service', 'technical services', 'electrical work', 'wiring work'
                )
                OR ji.category IS NULL
            )
            ${useDateFilter ? 'AND jc.job_date BETWEEN ? AND ?' : ''}
            ORDER BY jc.job_date DESC
        `;
        const params = [staffId];
        if (useDateFilter) params.push(startDate, endDate);

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/finance/reports/profit-loss
 * @desc    P&L Summary
 */
router.get('/reports/profit-loss', authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const dateRange = startDate && endDate ? "BETWEEN ? AND ?" : "IS NOT NULL";
        const params = startDate && endDate ? [startDate, endDate, startDate, endDate] : [];

        const [incomeRows] = await db.query(`SELECT category, SUM(amount) as total FROM incomes WHERE transaction_date ${dateRange} GROUP BY category`, params.slice(0, 2));
        const [expenseRows] = await db.query(`SELECT category, SUM(amount) as total FROM expenses WHERE expense_date ${dateRange} GROUP BY category`, params.slice(2, 4));

        res.json({
            income: incomeRows,
            expenses: expenseRows,
            total_income: incomeRows.reduce((sum, r) => sum + parseFloat(r.total), 0),
            total_expenses: expenseRows.reduce((sum, r) => sum + parseFloat(r.total), 0)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/finance/reports/revenue-breakdown
 * @desc    Revenue from Spares vs Services
 */
router.get('/reports/revenue-breakdown', authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const sql = `
            SELECT category, SUM(qty * rate) as total 
            FROM job_items ji
            JOIN job_cards jc ON ji.job_card_id = jc.id
            ${startDate && endDate ? 'WHERE jc.job_date BETWEEN ? AND ?' : ''}
            GROUP BY category
        `;
        const [rows] = await db.query(sql, startDate && endDate ? [startDate, endDate] : []);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/finance/reports/invoices
 * @desc    Invoice-wise Report
 */
router.get('/reports/invoices', authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const sql = `
            SELECT 
                jc.id, jc.job_date, jc.total_amount, jc.paid_amount, jc.discount,
                v.plate_number, c.name as customer_name,
                (SELECT SUM(qty*rate) FROM job_items WHERE job_card_id = jc.id AND category='spare') as spares_total,
                (SELECT SUM(qty*rate) FROM job_items WHERE job_card_id = jc.id AND is_deleted = 0 AND (TRIM(LOWER(category)) IN ('mechanical service', 'wiring', 'washing', 'painting', 'dending', 'denting', 'detailing', 'leyth', 'scanning', 'general service', 'labour charges', 'outside work', 'labour', 'outside_work', 'labour_charges', 'service', 'service charges', 'fitting charges', 'other charges', 'engine work', 'body work') OR category IS NULL)) as service_total
            FROM job_cards jc
            JOIN vehicles v ON jc.vehicle_id = v.id
            JOIN customers c ON v.customer_id = c.id
            WHERE jc.is_invoice_generated = TRUE AND jc.is_deleted = FALSE
            ${startDate && endDate ? 'AND jc.job_date BETWEEN ? AND ?' : ''}
            ORDER BY jc.job_date DESC
        `;
        const [rows] = await db.query(sql, startDate && endDate ? [startDate, endDate] : []);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   GET api/finance/reports/spares-consumption
 * @desc    Tracking spares consumption
 */
router.get('/reports/spares-consumption', authenticate, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Include all material categories: spare, oil, accessories, others
        const sql = `
            SELECT 
                ji.item_name, 
                ji.category, 
                COALESCE(i.part_number, 'N/A') as part_number,
                SUM(ji.qty) as total_qty, 
                SUM(ji.qty * ji.rate) as total_value
            FROM job_items ji
            LEFT JOIN inventory_items i ON ji.inventory_id = i.id
            JOIN job_cards jc ON ji.job_card_id = jc.id
            WHERE ji.category IN ('spare', 'oil', 'accessories', 'others')
            ${startDate && endDate ? 'AND jc.job_date BETWEEN ? AND ?' : ''}
            GROUP BY ji.item_name, ji.category, i.part_number
            ORDER BY total_qty DESC
        `;
        const [rows] = await db.query(sql, startDate && endDate ? [startDate, endDate] : []);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;



const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

/**
 * @route   GET api/dashboard/stats
 * @desc    Get dashboard statistics (Today's Income/Expense, Active Jobs)
 * @access  Private
 */
router.get('/stats', authenticate, async (req, res) => {
    try {
        // 1. Under Servicing (pending, in_progress)
        const [underServicingRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status IN ('pending', 'in_progress')"
        );

        // 2. Ready for Delivery / Payment (status = 'completed')
        const [readyRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status = 'completed'"
        );

        // 3. Completed Service (status = 'delivered')
        const [completedRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status = 'delivered'"
        );

        // 4. Next Day Delivery (Expected within next 2 days, not delivered)
        const [nextDayRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status != 'delivered' AND expected_delivery BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)"
        );

        // 5. Upcoming Delivery (Expected more than 10 days away, not delivered)
        const [upcomingRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status != 'delivered' AND expected_delivery > DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY)"
        );

        // 6. Partially Paid (paid_amount > 0 but < total_amount, not delivered)
        const [partiallyPaidRows] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE paid_amount > 0 AND paid_amount < total_amount AND status != 'delivered'"
        );

        // 7. Chart Data (Last 7 Days)
        const [chartRows] = await db.query(`
            SELECT 
                DATE_FORMAT(date, '%e %b') as name,
                CAST(SUM(income) AS DECIMAL(10,2)) as income, 
                CAST(SUM(expense) AS DECIMAL(10,2)) as expense
            FROM (
                SELECT transaction_date as date, amount as income, 0 as expense FROM incomes
                WHERE transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
                UNION ALL
                SELECT expense_date as date, 0 as income, amount as expense FROM expenses
                WHERE expense_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
            ) as combined
            GROUP BY date
            ORDER BY date ASC
        `);

        // 8. Reminders - Service (Next Service Date within next 7 days or overdue)
        const [serviceReminders] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE status = 'delivered' AND next_service_date <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)"
        );

        // 9. Reminders - Insurance Expiry (within next 7 days)
        const [insuranceReminders] = await db.query(
            "SELECT COUNT(*) as count FROM vehicles WHERE insurance_expiry BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)"
        );

        // 10. Reminders - Pollution Expiry (within next 7 days)
        const [pollutionReminders] = await db.query(
            "SELECT COUNT(*) as count FROM vehicles WHERE pollution_expiry BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)"
        );

        // 11. Reminders - Registration Expiry (within next 2 months)
        const [regReminders] = await db.query(
            "SELECT COUNT(*) as count FROM vehicles WHERE registration_expiry BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 60 DAY)"
        );

        // 12. Due Payment Reminders (due_reminder_date is today or past, only if balance > 0)
        const [dueReminders] = await db.query(
            "SELECT COUNT(*) as count FROM job_cards WHERE paid_amount < total_amount AND due_reminder_date <= CURRENT_DATE"
        );

        res.json({
            underServicing: underServicingRows[0].count || 0,
            nextDayDelivery: nextDayRows[0].count || 0,
            upcomingDelivery: upcomingRows[0].count || 0,
            readyForCollection: readyRows[0].count || 0,
            paymentProcessing: readyRows[0].count || 0,
            partiallyPaid: partiallyPaidRows[0].count || 0,
            completedService: completedRows[0].count || 0,
            chartData: chartRows,
            reminders: {
                service: serviceReminders[0].count || 0,
                insurance: insuranceReminders[0].count || 0,
                pollution: pollutionReminders[0].count || 0,
                registration: regReminders[0].count || 0,
                duePayment: dueReminders[0].count || 0
            }
        });

    } catch (err) {
        console.error('Get dashboard stats error:', err.message);
        res.status(500).json({ error: 'Server Error', message: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;

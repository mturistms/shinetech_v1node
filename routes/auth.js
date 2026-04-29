const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates password strength
 */
const validatePasswordStrength = (password) => {
    const minLength = 8; // Reduced from 12 for usability, but still secure with bcrypt
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
        return `Password must be at least ${minLength} characters long`;
    }
    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        return 'Password must include uppercase, lowercase, numbers, and special characters';
    }
    return null;
};

/**
 * Track login attemp ts (in-memory, use Redis in production)
 */
const loginAttempts = new Map();

const checkLoginAttempts = (username) => {
    const attempts = loginAttempts.get(username) || { count: 0, lockUntil: null };

    if (attempts.lockUntil && attempts.lockUntil > Date.now()) {
        const waitMinutes = Math.ceil((attempts.lockUntil - Date.now()) / 1000 / 60);
        throw new Error(`Account temporarily locked. Try again in ${waitMinutes} minute(s).`);
    }

    // Clear lock if expired
    if (attempts.lockUntil && attempts.lockUntil < Date.now()) {
        loginAttempts.delete(username);
        return { count: 0, lockUntil: null };
    }

    return attempts;
};

const recordFailedLogin = (username) => {
    const attempts = loginAttempts.get(username) || { count: 0, lockUntil: null };
    attempts.count++;

    // Lock account after 5 failed attempts for 15 minutes
    if (attempts.count >= 5) {
        attempts.lockUntil = Date.now() + (15 * 60 * 1000);
    }

    loginAttempts.set(username, attempts);
};

const resetLoginAttempts = (username) => {
    loginAttempts.delete(username);
};

/**
 * Generate JWT tokens (access and refresh)
 */
const generateTokens = (user) => {
    const payload = {
        user: {
            id: user.id,
            username: user.username,
            role: user.role || 'user'
        }
    };

    const accessToken = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRY || '15m' }
    );

    const refreshToken = jwt.sign(
        { user: { id: user.id } },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );

    return { accessToken, refreshToken };
};

// ============================================================================
// ROUTES
// ============================================================================

/**
 * @route   POST api/auth/register
 * @desc    Register new user
 * @access  Public (should be restricted to admin in production)
 */
router.post('/register', [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
    body('email')
        .optional()
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Invalid email address'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),
    body('role')
        .optional()
        .isIn(['admin', 'user', 'mechanic'])
        .withMessage('Invalid role')
], async (req, res) => {
    try {
        // Validation check
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password, email, role } = req.body;

        // Additional password strength validation
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
            return res.status(400).json({
                error: 'Weak password',
                message: passwordError
            });
        }

        // Check if user already exists (parameterized query)
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)',
            [username, email || null]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                error: 'User exists',
                message: 'Username or email already registered'
            });
        }

        // Hash password with configured rounds
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user (parameterized query)
        const [result] = await db.execute(
            'INSERT INTO users (username, password_hash, email, role, created_at) VALUES (?, ?, ?, ?, NOW())',
            [username, passwordHash, email || null, role || 'user']
        );

        // Get newly created user
        const [newUser] = await db.execute(
            'SELECT id, username, email, role FROM users WHERE id = ?',
            [result.insertId]
        );

        // Generate tokens
        const tokens = generateTokens(newUser[0]);

        // Store refresh token in database
        await db.execute(
            'UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?',
            [tokens.refreshToken, newUser[0].id]
        );

        res.status(201).json({
            message: 'User registered successfully',
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: newUser[0].id,
                username: newUser[0].username,
                email: newUser[0].email,
                role: newUser[0].role
            }
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            error: 'Server error',
            message: 'Registration failed. Please try again.'
        });
    }
});

/**
 * @route   POST api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        // Validation check
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;

        // Check login attempts / account lockout
        try {
            checkLoginAttempts(username);
        } catch (error) {
            return res.status(429).json({
                error: 'Too many attempts',
                message: error.message
            });
        }

        // Get user (parameterized query)
        const [users] = await db.execute(
            'SELECT id, username, email, password_hash, role FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            recordFailedLogin(username);
            // Generic error message - don't reveal if user exists
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid username or password'
            });
        }

        const user = users[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            recordFailedLogin(username);
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid username or password'
            });
        }

        // Reset login attempts on successful login
        resetLoginAttempts(username);

        // Generate tokens
        const tokens = generateTokens(user);

        // Store refresh token in database
        await db.execute(
            'UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?',
            [tokens.refreshToken, user.id]
        );

        res.json({
            message: 'Login successful',
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            error: 'Server error',
            message: 'Login failed. Please try again.'
        });
    }
});

/**
 * @route   POST api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'No token',
                message: 'Refresh token required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Check if refresh token exists in database (prevents token reuse after logout)
        const [users] = await db.execute(
            'SELECT id, username, email, role FROM users WHERE id = ? AND refresh_token = ?',
            [decoded.user.id, refreshToken]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Refresh token not recognized or has been revoked'
            });
        }

        const user = users[0];

        // Generate new access token
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        };

        const accessToken = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '15m' }
        );

        res.json({
            token: accessToken,
            message: 'Token refreshed successfully'
        });

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Refresh token has expired. Please login again.'
            });
        }
        console.error('Token refresh error:', err);
        res.status(401).json({
            error: 'Invalid token',
            message: 'Token refresh failed'
        });
    }
});

/**
 * @route   POST api/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Public
 */
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            // Clear refresh token from database
            await db.execute(
                'UPDATE users SET refresh_token = NULL WHERE refresh_token = ?',
                [refreshToken]
            );
        }

        res.json({
            message: 'Logged out successfully'
        });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({
            error: 'Server error',
            message: 'Logout failed'
        });
    }
});

/**
 * @route   GET api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: 'User not found'
            });
        }

        res.json(users[0]);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to fetch user information'
        });
    }
});

module.exports = router;

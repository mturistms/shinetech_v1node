const jwt = require('jsonwebtoken');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                error: 'Access denied',
                message: 'No authentication token provided'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Please refresh your token or login again'
            });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token verification failed'
            });
        }
        return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid or malformed token'
        });
    }
};

/**
 * Authorization middleware
 * Checks if user has required role
 * @param {Array} allowedRoles - Array of roles that can access the route
 */
const authorize = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        // If no specific roles required, just check if authenticated
        if (allowedRoles.length === 0) {
            return next();
        }

        // Check if user has one of the allowed roles
        if (!req.user.role || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions to access this resource'
            });
        }

        next();
    };
};

module.exports = { authenticate, authorize };

// Also export as default for backward compatibility
module.exports.default = authenticate;

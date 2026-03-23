const logger = require('../utils/logger');

/**
 * Middleware to require specific user role(s).
 * Must be used AFTER requireAuth (req.user must be set).
 *
 * @param  {...string} roles - Allowed roles (e.g. 'instructor', 'student')
 * @returns {Function} Express middleware
 *
 * Usage:
 *   router.get('/courses', requireAuth, requireRole('instructor'), handler);
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        const userRole = req.user.role || 'student';

        if (!roles.includes(userRole)) {
            logger.warn({
                requestId: req.requestId,
                userId: req.userId,
                userRole,
                requiredRoles: roles,
                path: req.originalUrl
            }, 'Role authorization denied');

            return res.status(403).json({
                success: false,
                error: `This action requires one of the following roles: ${roles.join(', ')}`,
                code: 'ROLE_FORBIDDEN'
            });
        }

        next();
    };
}

module.exports = { requireRole };

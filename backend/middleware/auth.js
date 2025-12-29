const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to verify JWT token and attach user to request
 * @param {boolean} optional - If true, allows requests without token (sets req.user to null)
 */
const authenticate = (optional = false) => {
  return async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (optional) {
          req.user = null;
          return next();
        }
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify token
      let decoded;
      try {
        decoded = verifyToken(token, 'access');
      } catch (error) {
        if (optional) {
          req.user = null;
          return next();
        }
        return res.status(401).json({
          success: false,
          error: error.message || 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }
      
      // Fetch user from database
      const user = await User.findById(decoded.userId).select('-passwordHash');
      
      if (!user) {
        if (optional) {
          req.user = null;
          return next();
        }
        return res.status(401).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Attach user to request object
      req.user = user;
      req.userId = user._id.toString();
      
      next();
    } catch (error) {
      logger.error({
        requestId: req.requestId,
        error: error.message,
        stack: error.stack
      }, 'Authentication middleware error');
      
      if (optional) {
        req.user = null;
        return next();
      }
      
      return res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
};

/**
 * Middleware to require authentication (non-optional)
 */
const requireAuth = authenticate(false);

/**
 * Middleware for optional authentication (allows unauthenticated requests)
 */
const optionalAuth = authenticate(true);

/**
 * Middleware to check if user owns a resource
 * @param {Function} getResourceUserId - Function to get userId from resource (req) => userId
 */
const requireOwnership = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const resourceUserId = await getResourceUserId(req);
      
      if (!resourceUserId) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
          code: 'NOT_FOUND'
        });
      }
      
      if (resourceUserId.toString() !== req.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You do not have permission to access this resource.',
          code: 'FORBIDDEN'
        });
      }
      
      next();
    } catch (error) {
      logger.error({
        requestId: req.requestId,
        error: error.message,
        stack: error.stack
      }, 'Ownership check error');
      
      return res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTH_ERROR'
      });
    }
  };
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireOwnership
};











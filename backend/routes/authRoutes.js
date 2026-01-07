const express = require('express');
const cookieParser = require('cookie-parser');
const User = require('../models/User');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const crypto = require('crypto');

const router = express.Router();
router.use(cookieParser());

/**
 * POST /v1/auth/check-email
 * Check if email already exists (for signup validation)
 */
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    
    if (existingUser) {
      return res.json({
        success: true,
        data: {
          exists: true,
          message: 'Email already registered'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        exists: false,
        message: 'Email is available'
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Check email error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to check email',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/signup
 * Create a new user account
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.errors.join(', '),
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate name
    if (name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Name must be between 1 and 100 characters',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Check if user already exists (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      logger.warn({
        requestId: req.requestId,
        email: normalizedEmail
      }, 'Attempted signup with existing email');
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user (use normalized email)
    const user = new User({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      emailVerified: false // For MVP, skip email verification
    });
    
    // Save user - MongoDB unique index will also catch duplicates (race condition protection)
    try {
      await user.save();
    } catch (saveError) {
      // Handle duplicate key error (MongoDB unique index violation)
      if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
        logger.warn({
          requestId: req.requestId,
          email: normalizedEmail,
          error: saveError.message
        }, 'Duplicate email detected during save (race condition)');
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
          code: 'EMAIL_EXISTS'
        });
      }
      // Re-throw other errors
      throw saveError;
    }
    
    // Generate tokens (convert ObjectId to string)
    const accessToken = generateAccessToken({ userId: user._id.toString(), email: user.email });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), email: user.email });
    
    // Set refresh token in httpOnly cookie
    // For cross-origin requests, sameSite must be 'none' with secure=true
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    logger.info({
      requestId: req.requestId || 'unknown',
      userId: user._id,
      email: user.email
    }, 'User signed up');
    
    // Return user data (without sensitive fields)
    const userData = user.toJSON();
    
    res.status(201).json({
      success: true,
      data: {
        user: userData,
        accessToken
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Signup error');
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create account',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/login
 * Authenticate user and return tokens
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Find user with password hash
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    
    if (!user) {
      // Don't reveal if email exists (security best practice)
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Compare passwords
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Update last login
    await user.updateLastLogin();
    
    // Generate tokens (convert ObjectId to string)
    const accessToken = generateAccessToken({ userId: user._id.toString(), email: user.email });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), email: user.email });
    
    // Set refresh token in httpOnly cookie
    // For cross-origin requests, sameSite must be 'none' with secure=true
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    logger.info({
      requestId: req.requestId,
      userId: user._id,
      email: user.email
    }, 'User logged in');
    
    // Return user data (without sensitive fields)
    const userData = user.toJSON();
    
    res.json({
      success: true,
      data: {
        user: userData,
        accessToken
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Login error');
    
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    // Get refresh token from cookie or Authorization header
    const refreshToken = req.cookies.refreshToken || 
                       (req.headers.authorization?.startsWith('Bearer ') 
                         ? req.headers.authorization.substring(7) 
                         : null);
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = verifyToken(refreshToken, 'refresh');
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    // Verify user still exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Generate new access token (convert ObjectId to string)
    const accessToken = generateAccessToken({ userId: user._id.toString(), email: user.email });
    
    res.json({
      success: true,
      data: {
        accessToken
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Token refresh error');
    
    res.status(500).json({
      success: false,
      error: 'Token refresh failed',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/logout
 * Logout user (clear refresh token cookie)
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'User logged out');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Logout error');
    
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /v1/auth/me
 * Get current authenticated user info
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userData = req.user.toJSON();
    
    res.json({
      success: true,
      data: {
        user: userData
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Get user info error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/forgot-password
 * Request password reset (MVP: just generate token, no email sending)
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success (don't reveal if email exists)
    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry
      
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetExpires;
      await user.save();
      
      // TODO: Send email with reset link (not implemented for MVP)
      // For MVP, return token in response (REMOVE IN PRODUCTION!)
      logger.info({
        requestId: req.requestId,
        userId: user._id,
        resetToken // REMOVE IN PRODUCTION - only for MVP testing
      }, 'Password reset token generated');
      
      // MVP: Return token in response (remove in production!)
      return res.json({
        success: true,
        message: 'Password reset token generated',
        data: {
          resetToken, // MVP ONLY - remove in production
          resetLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/resetpassword?token=${resetToken}`
        }
      });
    }
    
    res.json({
      success: true,
      message: 'If email exists, password reset link has been sent'
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Forgot password error');
    
    res.status(500).json({
      success: false,
      error: 'Password reset request failed',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.errors.join(', '),
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordHash');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN'
      });
    }
    
    // Hash new password
    user.passwordHash = await hashPassword(password);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: user._id
    }, 'Password reset successful');
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Reset password error');
    
    res.status(500).json({
      success: false,
      error: 'Password reset failed',
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;



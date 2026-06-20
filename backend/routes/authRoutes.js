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
 * Helper function to generate a unique username
 */
async function generateUniqueUsername(baseName) {
  // Clean base name (remove non-alphanumeric, limit length)
  let cleanBase = baseName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
  if (!cleanBase) cleanBase = 'user';
  
  let username = cleanBase;
  let counter = 1;
  
  // Try to find unique username (max 100 attempts)
  while (counter <= 100) {
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (!existingUser) {
      return username;
    }
    // If exists, append number
    username = `${cleanBase}${counter}`;
    counter++;
  }
  
  // Fallback: use random string
  return `user${Date.now().toString(36)}`;
}

/**
 * POST /v1/auth/check-username
 * Check if username already exists (for signup validation)
 */
router.post('/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate username format (3-30 characters, alphanumeric + underscores)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Check if user already exists (case-insensitive)
    const normalizedUsername = username.toLowerCase();
    const existingUser = await User.findOne({ username: normalizedUsername });
    
    if (existingUser) {
      return res.json({
        success: true,
        data: {
          exists: true,
          message: 'Username already taken'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        exists: false,
        message: 'Username is available'
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      error: error.message,
      stack: error.stack
    }, 'Check username error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to check username',
      code: 'SERVER_ERROR'
    });
  }
});

// Email check route removed - email field no longer exists

/**
 * POST /v1/auth/signup
 * Create a new user account
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      password,
      name,
      username,
      autoGenerateUsername,
      role: requestedRole,
      instructorSignupSecret
    } = req.body;
    
    logger.info({
      requestId: req.requestId,
      hasPassword: !!password,
      hasName: !!name,
      hasUsername: !!username,
      autoGenerateUsername: autoGenerateUsername,
      bodyKeys: Object.keys(req.body)
    }, 'Signup request received');
    
    // Validation
    if (!password || !name) {
      logger.warn({
        requestId: req.requestId,
        hasPassword: !!password,
        hasName: !!name
      }, 'Signup validation failed: missing password or name');
      return res.status(400).json({
        success: false,
        error: 'Password and name are required',
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
    
    // Handle username: auto-generate if requested, otherwise validate provided username
    let finalUsername;
    if (autoGenerateUsername) {
      // Auto-generate username based on name
      finalUsername = await generateUniqueUsername(name);
    } else {
      if (!username) {
        return res.status(400).json({
          success: false,
          error: 'Username is required or enable auto-generate',
          code: 'VALIDATION_ERROR'
        });
      }
      
      // Validate username format (3-30 characters, alphanumeric + underscores)
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          success: false,
          error: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
          code: 'VALIDATION_ERROR'
        });
      }
      
      // Check if username already exists (case-insensitive)
      const normalizedUsername = username.toLowerCase();
      const existingUserByUsername = await User.findOne({ username: normalizedUsername });
      if (existingUserByUsername) {
        return res.status(409).json({
          success: false,
          error: 'Username already taken',
          code: 'USERNAME_EXISTS'
        });
      }
      
      finalUsername = username;
    }
    
    // Normalize username for storage (lowercase for uniqueness, but preserve original case in display)
    const normalizedUsername = finalUsername.toLowerCase();

    // Role: default student; instructor only with env-backed secret (no self-escalation)
    let role = 'student';
    if (requestedRole === 'instructor') {
      const expected = process.env.INSTRUCTOR_SIGNUP_SECRET;
      if (!expected || typeof expected !== 'string' || expected.length < 8) {
        return res.status(403).json({
          success: false,
          error: 'Instructor registration is not enabled',
          code: 'INSTRUCTOR_SIGNUP_DISABLED'
        });
      }
      if (!instructorSignupSecret || instructorSignupSecret !== expected) {
        return res.status(403).json({
          success: false,
          error: 'Invalid instructor registration credentials',
          code: 'INSTRUCTOR_SIGNUP_FORBIDDEN'
        });
      }
      role = 'instructor';
    } else if (requestedRole != null && requestedRole !== '' && requestedRole !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'role must be "student" or "instructor"',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Declare user variable outside try block
    let user;
    
    // Save user directly to MongoDB using insertOne - completely bypass Mongoose
    // This ensures NO email field can be added by Mongoose schema defaults or hooks
    try {
      logger.info({
        requestId: req.requestId,
        username: normalizedUsername,
        name: name.trim()
      }, 'Creating user document (direct MongoDB insert)');
      
      // Build document as plain JavaScript object - NO Mongoose involvement
      const userDoc = {
        username: normalizedUsername,
        passwordHash: passwordHash,
        name: name.trim(),
        role,
        // Legacy DBs may still have a unique index on `email`; use a synthetic unique value per user.
        email: `${normalizedUsername}@users.studyassist.invalid`,
        avatarUrl: null,
        emailVerificationToken: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        preferences: {
          defaultModel: 'llama-3.1-8b',
          explanationLength: 'balanced',
          theme: 'light',
          fontSize: 16,
          notifications: true
        },
        profile: {
          source: 'user',
          mobile: '',
          background: '',
          goals: [],
          strengths: [],
          gaps: [],
          timePerDayMins: 30,
          preferredStyle: 'mixed',
          skillLevel: 'Beginner',
          learningType: 'Visual',
          major: '',
          currentCourses: [],
          daysPerWeek: 3,
          minutesPerSession: 30,
          recentTopics: [],
          selfRating: '',
          primaryGoal: '',
          defaultMode: 'Studying',
          explanationLength: 'Balanced',
          examplesPreference: 'Many',
          language: 'English',
          onboardingCompleted: false
        },
        certificates: [],
        stats: {
          pointsTotal: 0,
          gemsTotal: 0,
          trophiesTotal: 0,
          sessionsCompleted: 0
        },
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      logger.info({
        requestId: req.requestId,
        documentKeys: Object.keys(userDoc)
      }, 'Document ready for insert');
      
      // Insert directly into MongoDB collection - bypass Mongoose completely
      const result = await User.collection.insertOne(userDoc);
      
      logger.info({
        requestId: req.requestId,
        insertedId: result.insertedId,
        username: normalizedUsername
      }, 'User inserted successfully via direct MongoDB insert');
      
      // Create a Mongoose user instance from the inserted document for token generation
      const savedUser = await User.findById(result.insertedId);
      if (!savedUser) {
        throw new Error('Failed to retrieve inserted user');
      }
      
      // Assign to outer scope variable (not const - use the let user declared above)
      user = savedUser;
      
      logger.info({
        requestId: req.requestId,
        userId: user._id,
        username: user.username,
        savedSuccessfully: true,
        insertedId: result.insertedId
      }, 'User saved successfully to database using insertOne');
    } catch (saveError) {
      // Handle duplicate key error (MongoDB unique index violation)
      if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
        // Check which field caused the duplicate
        if (saveError.keyPattern?.username) {
          logger.warn({
            requestId: req.requestId,
            username: normalizedUsername,
            error: saveError.message
          }, 'Duplicate username detected during save (race condition)');
          return res.status(409).json({
            success: false,
            error: 'Username already taken',
            code: 'USERNAME_EXISTS'
          });
        }
        if (saveError.keyPattern?.email) {
          // This shouldn't happen if email is not provided, but log full details
          logger.warn({
            requestId: req.requestId,
            error: saveError.message,
            keyPattern: saveError.keyPattern,
            keyValue: saveError.keyValue,
            errorCode: saveError.code,
            fullError: saveError
          }, 'Duplicate email detected during save (unexpected - email not provided in request)');
          // Since we're not providing email, this is likely a database/index issue
          // Return a more helpful error message
          return res.status(500).json({
            success: false,
            error: 'Account creation failed due to database constraint. Please try again or contact support.',
            code: 'DATABASE_ERROR',
            details: process.env.NODE_ENV === 'development' ? saveError.message : undefined
          });
        }
      }
      // Handle validation errors
      if (saveError.name === 'ValidationError') {
        const validationErrors = Object.values(saveError.errors).map(err => err.message).join(', ');
        logger.warn({
          requestId: req.requestId,
          validationErrors
        }, 'Validation error during user save');
        return res.status(400).json({
          success: false,
          error: validationErrors,
          code: 'VALIDATION_ERROR'
        });
      }
      // Re-throw other errors to be caught by outer catch
      throw saveError;
    }
    
    // Generate tokens (convert ObjectId to string)
    const accessToken = generateAccessToken({ userId: user._id.toString(), username: user.username });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), username: user.username });
    
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
      username: user.username
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
      stack: error.stack,
      errorCode: error.code,
      errorName: error.name,
      keyPattern: error.keyPattern
    }, 'Signup error');
    
    // Handle duplicate key error
    if (error.code === 11000 || error.name === 'MongoServerError') {
      if (error.keyPattern?.username) {
        return res.status(409).json({
          success: false,
          error: 'Username already taken',
          code: 'USERNAME_EXISTS'
        });
      }
      if (error.keyPattern?.email) {
        // This shouldn't happen if email is not provided, but log full details
        logger.error({
          requestId: req.requestId,
          error: error.message,
          keyPattern: error.keyPattern,
          keyValue: error.keyValue,
          errorCode: error.code,
          stack: error.stack
        }, 'Email duplicate error during signup (email not provided in request)');
        // Since we're not providing email, this is likely a database/index issue
        // Return a more helpful error message
        return res.status(500).json({
          success: false,
          error: 'Account creation failed due to database constraint. Please try again or contact support.',
          code: 'DATABASE_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message).join(', ');
      return res.status(400).json({
        success: false,
        error: validationErrors,
        code: 'VALIDATION_ERROR'
      });
    }
    
    // In development, include more error details
    const errorResponse = {
      success: false,
      error: 'Failed to create account',
      code: 'SERVER_ERROR'
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = error.message;
      errorResponse.stack = error.stack;
      errorResponse.errorName = error.name;
      errorResponse.errorCode = error.code;
    }
    
    res.status(500).json(errorResponse);
  }
});

/**
 * POST /v1/auth/login
 * Authenticate user and return tokens
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Find user with password hash by username (case-insensitive)
    const normalizedUsername = username.toLowerCase();
    const user = await User.findOne({ username: normalizedUsername }).select('+passwordHash');
    
    if (!user) {
      // Don't reveal if username exists (security best practice)
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Compare passwords
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Update last login
    await user.updateLastLogin();
    
    // Generate tokens (convert ObjectId to string)
    const accessToken = generateAccessToken({ userId: user._id.toString(), username: user.username });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), username: user.username });
    
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
      username: user.username
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
    const accessToken = generateAccessToken({ userId: user._id.toString(), username: user.username });
    
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
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Find user by username (case-insensitive — matches legacy mixed-case usernames)
    const trimmed = String(username).trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${escaped}$`, 'i') }
    }).select('+passwordResetToken +passwordResetExpires');
    
    // Always return success (don't reveal if username exists)
    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry
      
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetExpires;
      await user.save();
      
      // TODO: Send reset link via notification (not implemented for MVP)
      // For MVP, return token in response (REMOVE IN PRODUCTION!)
      logger.info({
        requestId: req.requestId,
        userId: user._id,
        resetToken // REMOVE IN PRODUCTION - only for MVP testing
      }, 'Password reset token generated');
      
      // Determine frontend URL based on environment
      let frontendUrl;
      if (process.env.NODE_ENV === 'production') {
        // In production, use CORS_ORIGINS (first origin) or default Firebase hosting URL
        if (process.env.CORS_ORIGINS) {
          const corsOrigins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
          frontendUrl = corsOrigins[0] || 'https://study-assist-prod.web.app';
        } else {
          // Fallback to default production URL
          const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'study-assist-prod';
          frontendUrl = `https://${projectId}.web.app`;
        }
      } else {
        frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const origin = req.get('Origin');
        if (origin && /^https?:\/\/[^/]+/i.test(origin)) {
          try {
            const u = new URL(origin);
            frontendUrl = `${u.protocol}//${u.host}`;
          } catch (_) { /* keep FRONTEND_URL */ }
        }
      }

      const resetLink = `${frontendUrl.replace(/\/$/, '')}/resetpassword?token=${encodeURIComponent(resetToken)}`;
      // Return the reset link directly in the response. No email provider is wired
      // up, so this mirrors the student (release/first-study) app's behavior and lets
      // instructors self-serve a reset link on the page.
      // SECURITY NOTE: this exposes the reset token to anyone who submits a valid
      // username (i.e. self-service account takeover). Acceptable for the controlled
      // study deployment with a small known participant set; MUST be replaced with
      // emailed reset links before any public launch.
      return res.json({
        success: true,
        message: 'Password reset token generated',
        data: {
          resetToken,
          resetLink
        }
      });
    }
    
    res.json({
      success: true,
      message: 'If username exists, password reset link has been sent'
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



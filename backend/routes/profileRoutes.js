const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, getAvatarUrl, deleteAvatarFile, extractFilenameFromUrl } = require('../utils/fileUpload');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /v1/profile
 * Get user's complete profile
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const userData = user.toJSON();
    
    res.json({
      success: true,
      data: {
        profile: {
          name: userData.name,
          email: userData.email,
          avatarUrl: userData.avatarUrl,
          ...userData.profile
        },
        preferences: userData.preferences,
        stats: userData.stats
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Get profile error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * PUT /v1/profile
 * Update user profile (all fields)
 */
router.put('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const {
      name,
      avatarUrl,
      background,
      goals,
      strengths,
      gaps,
      timePerDayMins,
      preferredStyle,
      skillLevel,
      learningType,
      major,
      currentCourses,
      daysPerWeek,
      minutesPerSession,
      recentTopics,
      selfRating,
      primaryGoal,
      defaultMode,
      explanationLength,
      examplesPreference,
      language
    } = req.body;
    
    // Update name if provided
    if (name !== undefined) {
      if (name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Name must be between 1 and 100 characters',
          code: 'VALIDATION_ERROR'
        });
      }
      user.name = name.trim();
    }
    
    // Update avatar URL if provided
    if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl || null;
    }
    
    // Update profile fields
    if (background !== undefined) user.profile.background = background;
    if (goals !== undefined) user.profile.goals = Array.isArray(goals) ? goals : [];
    if (strengths !== undefined) user.profile.strengths = Array.isArray(strengths) ? strengths : [];
    if (gaps !== undefined) user.profile.gaps = Array.isArray(gaps) ? gaps : [];
    if (timePerDayMins !== undefined) {
      if (timePerDayMins < 10 || timePerDayMins > 480) {
        return res.status(400).json({
          success: false,
          error: 'timePerDayMins must be between 10 and 480',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.timePerDayMins = timePerDayMins;
    }
    if (preferredStyle !== undefined) {
      if (!['examples-first', 'theory-first', 'mixed'].includes(preferredStyle)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid preferredStyle',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.preferredStyle = preferredStyle;
    }
    if (skillLevel !== undefined) {
      if (!['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(skillLevel)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid skillLevel',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.skillLevel = skillLevel;
    }
    if (learningType !== undefined) {
      if (!['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'].includes(learningType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid learningType',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.learningType = learningType;
    }
    if (major !== undefined) user.profile.major = major;
    if (currentCourses !== undefined) {
      user.profile.currentCourses = Array.isArray(currentCourses) ? currentCourses : [];
    }
    if (daysPerWeek !== undefined) {
      if (daysPerWeek < 1 || daysPerWeek > 7) {
        return res.status(400).json({
          success: false,
          error: 'daysPerWeek must be between 1 and 7',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.daysPerWeek = daysPerWeek;
    }
    if (minutesPerSession !== undefined) {
      if (minutesPerSession < 5) {
        return res.status(400).json({
          success: false,
          error: 'minutesPerSession must be at least 5',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.minutesPerSession = minutesPerSession;
    }
    if (recentTopics !== undefined) {
      user.profile.recentTopics = Array.isArray(recentTopics) ? recentTopics : [];
    }
    if (selfRating !== undefined) user.profile.selfRating = selfRating;
    if (primaryGoal !== undefined) user.profile.primaryGoal = primaryGoal;
    if (defaultMode !== undefined) {
      if (!['Studying', 'Revision'].includes(defaultMode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid defaultMode',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.defaultMode = defaultMode;
    }
    if (explanationLength !== undefined) {
      if (!['Concise', 'Balanced', 'Detailed'].includes(explanationLength)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid explanationLength',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.explanationLength = explanationLength;
    }
    if (examplesPreference !== undefined) {
      if (!['None', 'Few', 'Many'].includes(examplesPreference)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid examplesPreference',
          code: 'VALIDATION_ERROR'
        });
      }
      user.profile.examplesPreference = examplesPreference;
    }
    if (language !== undefined) user.profile.language = language;
    
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'Profile updated');
    
    const userData = user.toJSON();
    
    res.json({
      success: true,
      data: {
        profile: {
          name: userData.name,
          email: userData.email,
          avatarUrl: userData.avatarUrl,
          ...userData.profile
        }
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Update profile error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * PATCH /v1/profile/preferences
 * Update only user preferences
 */
router.patch('/preferences', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const {
      defaultModel,
      explanationLength,
      theme,
      fontSize,
      notifications
    } = req.body;
    
    // Update preferences
    if (defaultModel !== undefined) {
      if (!['llama-3.1-8b', 'llama-3.1-70b', 'mixtral-8x7b'].includes(defaultModel)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid defaultModel',
          code: 'VALIDATION_ERROR'
        });
      }
      user.preferences.defaultModel = defaultModel;
    }
    if (explanationLength !== undefined) {
      if (!['concise', 'balanced', 'detailed'].includes(explanationLength)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid explanationLength',
          code: 'VALIDATION_ERROR'
        });
      }
      user.preferences.explanationLength = explanationLength;
    }
    if (theme !== undefined) {
      if (!['light', 'dark', 'auto'].includes(theme)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid theme',
          code: 'VALIDATION_ERROR'
        });
      }
      user.preferences.theme = theme;
    }
    if (fontSize !== undefined) {
      if (fontSize < 10 || fontSize > 50) {
        return res.status(400).json({
          success: false,
          error: 'fontSize must be between 10 and 50',
          code: 'VALIDATION_ERROR'
        });
      }
      user.preferences.fontSize = fontSize;
    }
    if (notifications !== undefined) {
      user.preferences.notifications = Boolean(notifications);
    }
    
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'Preferences updated');
    
    res.json({
      success: true,
      data: {
        preferences: user.preferences
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Update preferences error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/profile/avatar
 * Upload avatar image
 */
router.post('/avatar', requireAuth, uploadAvatar, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Delete old avatar if exists
    if (user.avatarUrl) {
      const oldFilename = extractFilenameFromUrl(user.avatarUrl);
      if (oldFilename) {
        try {
          await deleteAvatarFile(oldFilename);
        } catch (error) {
          // Log but don't fail if old file deletion fails
          logger.warn({
            requestId: req.requestId,
            userId: req.userId,
            error: error.message
          }, 'Failed to delete old avatar');
        }
      }
    }
    
    // Update user avatar URL
    const avatarUrl = getAvatarUrl(req.file.filename);
    user.avatarUrl = avatarUrl;
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      avatarUrl
    }, 'Avatar uploaded');
    
    res.json({
      success: true,
      data: {
        avatarUrl
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Avatar upload error');
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5MB',
        code: 'FILE_TOO_LARGE'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upload avatar',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/profile/onboarding/complete
 * Mark onboarding as complete
 */
router.post('/onboarding/complete', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Mark onboarding as complete (you can add an onboardingComplete field to User model if needed)
    // For now, we'll just return success since profile is already updated
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'Onboarding completed');
    
    res.json({
      success: true,
      message: 'Onboarding completed'
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Complete onboarding error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to complete onboarding'
    });
  }
});

module.exports = router;


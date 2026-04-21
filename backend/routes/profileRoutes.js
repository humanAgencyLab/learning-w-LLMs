const express = require('express');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const User = require('../models/User');
const Session = require('../models/Session');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, getAvatarUrl, deleteAvatarFile, extractFilenameFromUrl } = require('../utils/fileUpload');
const { generateCertificatePDF, getCertificatePath } = require('../services/certificateService');
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
    
    // Calculate additional stats from sessions and certificates
    let modulesCompleted = 0;
    let topicsCompleted = 0;
    
    try {
      const sessions = await Session.find({ userId: req.userId }).lean();
      
      // Count modules completed (modules with status 'passed')
      if (sessions && sessions.length > 0) {
        sessions.forEach(session => {
          if (session.plan && Array.isArray(session.plan)) {
            const passedModules = session.plan.filter(module => module && module.status === 'passed');
            modulesCompleted += passedModules.length;
          }
        });
      }
      
      // Count topics completed using certificates (each certificate = one completed topic)
      topicsCompleted = (user.certificates && Array.isArray(user.certificates)) ? user.certificates.length : 0;
      
      logger.info({
        requestId: req.requestId,
        userId: req.userId,
        sessionsCount: sessions ? sessions.length : 0,
        modulesCompleted,
        topicsCompleted,
        certificatesCount: user.certificates ? user.certificates.length : 0,
        gemsTotal: userData.stats?.gemsTotal || 0
      }, 'Calculated user stats');
    } catch (statsError) {
      logger.error({
        requestId: req.requestId,
        userId: req.userId,
        error: statsError.message,
        stack: statsError.stack
      }, 'Failed to calculate additional stats, using defaults');
      // Use defaults (0) if calculation fails
      modulesCompleted = 0;
      topicsCompleted = (user.certificates && Array.isArray(user.certificates)) ? user.certificates.length : 0;
    }
    
    // Ensure mobile is included in the response
    const profileResponse = {
      name: userData.name,
      avatarUrl: userData.avatarUrl,
      ...userData.profile
    };
    
    // Enhanced stats with calculated metrics
    const enhancedStats = {
      ...userData.stats,
      modulesCompleted,
      topicsCompleted
    };
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      profileFields: Object.keys(profileResponse),
      hasMobile: 'mobile' in profileResponse,
      modulesCompleted,
      topicsCompleted,
      gemsTotal: userData.stats?.gemsTotal || 0
    }, 'Get profile');
    
    res.json({
      success: true,
      data: {
        profile: profileResponse,
        preferences: userData.preferences,
        stats: enhancedStats
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
      mobile,
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
      language,
      onboardingCompleted,
      programmingExposure,
      motivationType,
      selfConfidence,
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
    if (mobile !== undefined) {
      user.profile.mobile = mobile.trim() || '';
    }
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

    if (programmingExposure !== undefined) {
      if (!['none', 'some', 'lots', 'unknown'].includes(programmingExposure)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid programmingExposure',
          code: 'VALIDATION_ERROR',
        });
      }
      user.profile.programmingExposure = programmingExposure;
    }
    if (motivationType !== undefined) {
      if (!['grade', 'curiosity', 'career', 'requirement', 'unknown'].includes(motivationType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid motivationType',
          code: 'VALIDATION_ERROR',
        });
      }
      user.profile.motivationType = motivationType;
    }
    if (selfConfidence !== undefined) {
      if (selfConfidence === null) {
        user.profile.selfConfidence = null;
      } else {
        const n = Number(selfConfidence);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return res.status(400).json({
            success: false,
            error: 'selfConfidence must be 1–5 or null',
            code: 'VALIDATION_ERROR',
          });
        }
        user.profile.selfConfidence = n;
      }
    }

    // Update onboardingCompleted (inside profile object)
    if (onboardingCompleted !== undefined) {
      user.profile.onboardingCompleted = onboardingCompleted === true;
    }
    
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      updatedFields: {
        name: name !== undefined,
        mobile: mobile !== undefined,
        major: major !== undefined,
        skillLevel: skillLevel !== undefined,
        learningType: learningType !== undefined,
        daysPerWeek: daysPerWeek !== undefined,
        minutesPerSession: minutesPerSession !== undefined,
        currentCourses: currentCourses !== undefined
      }
    }, 'Profile updated');
    
    const userData = user.toJSON();
    
    res.json({
      success: true,
      data: {
        profile: {
          name: userData.name,
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
 * PATCH /v1/profile/password
 * Change user password
 */
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Validate password strength
    const { validatePasswordStrength } = require('../utils/password');
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.errors.join(', '),
        code: 'VALIDATION_ERROR'
      });
    }
    
    const user = await User.findById(req.userId).select('+passwordHash');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Verify current password
    const { comparePassword, hashPassword } = require('../utils/password');
    const isPasswordValid = await comparePassword(currentPassword, user.passwordHash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }
    
    // Update password
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'Password changed');
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Change password error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
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

/**
 * POST /v1/profile/certificates/generate
 * Generate a certificate for completed course
 */
router.post('/certificates/generate', requireAuth, async (req, res) => {
  try {
    const { sessionId, topic } = req.body;
    
    if (!sessionId || !topic) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and topic are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Verify session exists and belongs to user
    const session = await Session.findOne({ 
      _id: sessionId, 
      userId: req.userId 
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied',
        code: 'SESSION_NOT_FOUND'
      });
    }
    
    // Verify all modules are completed
    const allModulesPassed = session.plan.every(m => m.status === 'passed');
    if (!allModulesPassed) {
      return res.status(400).json({
        success: false,
        error: 'All modules must be completed to generate certificate',
        code: 'INCOMPLETE_COURSE'
      });
    }
    
    // Check if certificate already exists for this session
    const user = await User.findById(req.userId);
    const existingCertificate = user.certificates.find(c => c.sessionId === sessionId);
    
    if (existingCertificate) {
      return res.json({
        success: true,
        data: {
          certificateId: existingCertificate.certificateId,
          downloadUrl: `/v1/profile/certificates/${existingCertificate.certificateId}/download`,
          message: 'Certificate already exists'
        }
      });
    }
    
    // Generate certificate PDF
    const { filePath, certificateId } = await generateCertificatePDF({
      userName: user.name,
      topic: topic || session.topic,
      issuedAt: new Date()
    });
    
    // Store certificate in user document
    const relativePath = path.relative(path.join(__dirname, '../uploads'), filePath);
    user.certificates.push({
      certificateId,
      topic: topic || session.topic,
      sessionId: sessionId.toString(),
      filePath: relativePath,
      issuedAt: new Date()
    });
    
    await user.save();
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      certificateId,
      sessionId,
      topic: topic || session.topic
    }, 'Certificate generated');
    
    res.json({
      success: true,
      data: {
        certificateId,
        downloadUrl: `/v1/profile/certificates/${certificateId}/download`
      }
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Generate certificate error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate certificate',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /v1/profile/certificates/test
 * Generate a test certificate for testing purposes (doesn't save to database)
 */
router.post('/certificates/test', requireAuth, async (req, res) => {
  let filePath = null;
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId
    }, 'Starting test certificate generation');
    
    // Generate test certificate with dummy data - don't save to database
    const result = await generateCertificatePDF({
      userName: user.name || 'Test User',
      topic: 'Swift Programming', // Use a realistic topic name
      issuedAt: new Date()
    });
    
    filePath = result.filePath;
    
    // Read the file and send it directly
    const fileBuffer = await fsPromises.readFile(filePath);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Test_Certificate_${Date.now()}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Send the PDF file
    res.send(fileBuffer);
    
    // Clean up the temporary file after sending
    fsPromises.unlink(filePath).catch(err => {
      logger.warn({ error: err.message, filePath }, 'Failed to delete temporary test certificate file');
    });
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      filePath
    }, 'Test certificate generated and sent successfully');
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack,
      filePath
    }, 'Test certificate generation error');
    
    // Clean up file if it was created but error occurred
    if (filePath) {
      fsPromises.unlink(filePath).catch(err => {
        logger.warn({ error: err.message, filePath }, 'Failed to delete error certificate file');
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate test certificate',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /v1/profile/certificates
 * Get all certificates for user
 */
router.get('/certificates', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const certificates = user.certificates.map(cert => ({
      certificateId: cert.certificateId,
      topic: cert.topic,
      sessionId: cert.sessionId,
      issuedAt: cert.issuedAt,
      downloadUrl: `/v1/profile/certificates/${cert.certificateId}/download`
    }));
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      certificateCount: certificates.length
    }, 'Get certificates');
    
    res.json({
      success: true,
      data: certificates
    });
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    }, 'Get certificates error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to get certificates',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /v1/profile/certificates/:certificateId/download
 * Download certificate PDF
 */
router.get('/certificates/:certificateId/download', requireAuth, async (req, res) => {
  try {
    const { certificateId } = req.params;
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Find certificate
    const certificate = user.certificates.find(c => c.certificateId === certificateId);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found',
        code: 'CERTIFICATE_NOT_FOUND'
      });
    }
    
    // Get full file path
    const fullPath = path.join(__dirname, '../uploads', certificate.filePath);
    
    // Check if file exists
    try {
      await fsPromises.access(fullPath);
    } catch (error) {
      logger.error({
        requestId: req.requestId,
        userId: req.userId,
        certificateId,
        filePath: fullPath
      }, 'Certificate file not found');
      
      return res.status(404).json({
        success: false,
        error: 'Certificate file not found',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // Set headers for PDF download
    const fileName = `Certificate_${certificate.topic.replace(/\s+/g, '_')}_${certificate.issuedAt.toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
    
    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      certificateId
    }, 'Certificate downloaded');
  } catch (error) {
    logger.error({
      requestId: req.requestId,
      userId: req.userId,
      certificateId: req.params.certificateId,
      error: error.message,
      stack: error.stack
    }, 'Download certificate error');
    
    res.status(500).json({
      success: false,
      error: 'Failed to download certificate',
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;


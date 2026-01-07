const express = require('express');
const router = express.Router();
const pino = require('pino');
const { getUserPerformance } = require('../services/performanceService');
const { requireAuth } = require('../middleware/auth');
const Session = require('../models/Session');
const QuizAttempt = require('../models/QuizAttempt');

// Initialize Pino logger (no transport in production - pino-pretty is dev-only)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

// Middleware to add request ID to logger
const addRequestId = (req, res, next) => {
  req.logger = logger.child({ requestId: req.requestId });
  next();
};

/**
 * GET /v1/performance
 * Get comprehensive performance data for the authenticated user
 */
router.get('/v1/performance', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.logger.info({ userId: req.userId }, 'Performance data request');
    
    const performanceData = await getUserPerformance(req.userId);
    
    const duration = Date.now() - startTime;
    
    req.logger.info({
      userId: req.userId,
      duration,
      metricsCount: Object.keys(performanceData).length
    }, 'Performance data retrieved successfully');
    
    res.json({
      success: true,
      data: performanceData,
      duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    req.logger.error({
      userId: req.userId,
      error: error.message,
      stack: error.stack,
      duration
    }, 'Error retrieving performance data');
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance data',
      code: 'PERFORMANCE_FETCH_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /v1/performance/export
 * Export performance data as CSV
 */
router.get('/v1/performance/export', requireAuth, addRequestId, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validate userId exists
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    req.logger.info({ userId: req.userId }, 'Performance data export request');
    
    const performanceData = await getUserPerformance(req.userId);
    const sessions = await Session.find({ userId: req.userId }).sort({ createdAt: -1 });
    
    // Build CSV content
    let csv = 'Performance Data Export\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;
    
    // Summary metrics
    csv += 'SUMMARY METRICS\n';
    csv += `Total Minutes Spent,${performanceData.minutesSpent}\n`;
    csv += `Accuracy Rate,${performanceData.accuracyRate}%\n`;
    csv += `Quiz Average Score,${performanceData.quizScores.average}%\n`;
    csv += `Quiz Pass Rate,${performanceData.quizScores.passRate}%\n`;
    csv += `Modules Completed,${performanceData.moduleCompletion.completed}/${performanceData.moduleCompletion.total}\n`;
    csv += `Module Completion Rate,${performanceData.moduleCompletion.completionRate}%\n`;
    csv += `Sessions Completed,${performanceData.sessionStats.completed}/${performanceData.sessionStats.total}\n`;
    csv += `Activity Streak,${performanceData.activityStreak.currentStreak} days\n\n`;
    
    // Session details
    csv += 'SESSION DETAILS\n';
    csv += 'Session ID,Topic,Phase,Points,Status,Created At,Updated At\n';
    sessions.forEach(session => {
      csv += `${session._id},${session.topic || 'N/A'},${session.phase || 'N/A'},${session.points || 0},${session.phase === 'completed' ? 'Completed' : 'In Progress'},${session.createdAt || 'N/A'},${session.updatedAt || 'N/A'}\n`;
    });
    
    csv += '\n';
    
    // Quiz attempts
    csv += 'QUIZ ATTEMPTS\n';
    csv += 'Module ID,Attempt Number,Score,Passed,Status,Date\n';
    sessions.forEach(session => {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        session.quizAttempts.forEach(attempt => {
          if (attempt.status === 'submitted') {
            const attemptDate = attempt.submittedAt || attempt.createdAt || session.createdAt;
            const formattedDate = attemptDate ? new Date(attemptDate).toISOString() : 'N/A';
            csv += `${attempt.moduleId || 'N/A'},${attempt.attemptNo || 1},${attempt.scorePct || 0}%,${attempt.passed ? 'Yes' : 'No'},${attempt.status},${formattedDate}\n`;
          }
        });
      }
    });
    
    csv += '\n';
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="performance-export-${Date.now()}.csv"`);
    
    const duration = Date.now() - startTime;
    req.logger.info({
      userId: req.userId,
      duration,
      csvLength: csv.length
    }, 'Performance data exported successfully');
    
    res.send(csv);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    req.logger.error({
      userId: req.userId,
      error: error.message,
      stack: error.stack,
      duration
    }, 'Error exporting performance data');
    
    res.status(500).json({
      success: false,
      error: 'Failed to export performance data',
      code: 'EXPORT_ERROR',
      message: error.message
    });
  }
});

module.exports = router;


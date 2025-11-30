const Session = require('../models/Session');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Calculate total minutes spent across all sessions
 * Uses a more accurate method: only counts time for completed sessions or uses message timestamps
 */
async function calculateTotalMinutesSpent(userId) {
  try {
    const sessions = await Session.find({ userId }).select('createdAt updatedAt phase messages');
    
    let totalMinutes = 0;
    sessions.forEach(session => {
      if (!session.createdAt) return;
      
      // For completed sessions, use the time between first and last message
      if (session.phase === 'completed' && session.messages && session.messages.length >= 2) {
        const firstMessage = session.messages[0];
        const lastMessage = session.messages[session.messages.length - 1];
        
        if (firstMessage.timestamp && lastMessage.timestamp) {
          const durationMs = new Date(lastMessage.timestamp) - new Date(firstMessage.timestamp);
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          // Cap at reasonable maximum (8 hours per session)
          totalMinutes += Math.min(durationMinutes, 480);
        } else {
          // Fallback: use createdAt to updatedAt, but cap at 8 hours
          const durationMs = new Date(session.updatedAt) - new Date(session.createdAt);
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          totalMinutes += Math.min(durationMinutes, 480);
        }
      } else if (session.messages && session.messages.length >= 2) {
        // For active sessions, use message timestamps
        const firstMessage = session.messages[0];
        const lastMessage = session.messages[session.messages.length - 1];
        
        if (firstMessage.timestamp && lastMessage.timestamp) {
          const durationMs = new Date(lastMessage.timestamp) - new Date(firstMessage.timestamp);
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          totalMinutes += Math.min(durationMinutes, 480);
        }
      } else {
        // For sessions with no messages or single message, use a conservative estimate
        // Only count if session was recently updated (within last 7 days)
        const daysSinceUpdate = (Date.now() - new Date(session.updatedAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate <= 7) {
          // Estimate 30 minutes for new sessions
          totalMinutes += 30;
        }
      }
    });
    
    return totalMinutes;
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating total minutes spent');
    return 0;
  }
}

/**
 * Calculate quiz scores and statistics
 */
async function calculateQuizScores(userId) {
  try {
    // Get all sessions for user
    const sessions = await Session.find({ userId });
    
    // Primary source: Get quiz attempts from Session.quizAttempts
    const sessionQuizAttempts = [];
    sessions.forEach(session => {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        session.quizAttempts.forEach(attempt => {
          if (attempt.status === 'submitted' && attempt.scorePct !== undefined) {
            sessionQuizAttempts.push({
              score: attempt.scorePct / 100, // Convert to 0-1 range
              passed: attempt.passed,
              timeSpent: 0, // Not tracked in Session model
              createdAt: attempt.createdAt || attempt.submittedAt || session.updatedAt
            });
          }
        });
      }
    });
    
    // Secondary source: Try to get from QuizAttempt collection (may be empty if using Session model)
    let quizAttempts = [];
    try {
      const sessionIds = sessions.map(s => s._id);
      quizAttempts = await QuizAttempt.find({ 
        sessionId: { $in: sessionIds } 
      });
    } catch (err) {
      // QuizAttempt may reference different model, ignore if fails
      logger.debug({ userId, error: err.message }, 'QuizAttempt collection query failed, using Session data only');
    }
    
    // Combine both sources
    const allAttempts = [
      ...quizAttempts.map(qa => ({
        score: qa.score || 0,
        passed: qa.passed || false,
        timeSpent: qa.timeSpent || 0,
        createdAt: qa.createdAt
      })),
      ...sessionQuizAttempts
    ];
    
    if (allAttempts.length === 0) {
      return {
        averageScore: 0,
        totalQuizzes: 0,
        passedQuizzes: 0,
        passRate: 0,
        recentScores: [],
        averageTime: 0
      };
    }
    
    const scores = allAttempts.map(a => a.score).filter(s => s !== null && s !== undefined);
    const passedCount = allAttempts.filter(a => a.passed === true).length;
    const times = allAttempts.map(a => a.timeSpent).filter(t => t > 0);
    
    // Get recent scores (last 10)
    const recentScores = allAttempts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(a => ({
        score: Math.round(a.score * 100), // Convert to percentage
        passed: a.passed,
        date: a.createdAt
      }));
    
    return {
      averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0,
      totalQuizzes: allAttempts.length,
      passedQuizzes: passedCount,
      passRate: Math.round((passedCount / allAttempts.length) * 100),
      recentScores,
      averageTime: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating quiz scores');
    return {
      averageScore: 0,
      totalQuizzes: 0,
      passedQuizzes: 0,
      passRate: 0,
      recentScores: [],
      averageTime: 0
    };
  }
}

/**
 * Calculate module completion statistics
 */
async function calculateModuleCompletion(userId) {
  try {
    const sessions = await Session.find({ userId });
    
    let totalModules = 0;
    let completedModules = 0;
    let totalMilestones = 0;
    let completedMilestones = 0;
    
    sessions.forEach(session => {
      if (session.plan && Array.isArray(session.plan)) {
        session.plan.forEach(module => {
          totalModules++;
          if (module.status === 'passed') {
            completedModules++;
          }
          
          // Count milestones
          if (module.milestones && Array.isArray(module.milestones)) {
            totalMilestones += module.milestones.length;
          }
          if (module.completedMilestones && Array.isArray(module.completedMilestones)) {
            completedMilestones += module.completedMilestones.length;
          }
        });
      }
    });
    
    return {
      totalModules,
      completedModules,
      completionRate: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0,
      totalMilestones,
      completedMilestones,
      milestoneCompletionRate: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating module completion');
    return {
      totalModules: 0,
      completedModules: 0,
      completionRate: 0,
      totalMilestones: 0,
      completedMilestones: 0,
      milestoneCompletionRate: 0
    };
  }
}

/**
 * Calculate study plan scores
 */
async function calculateStudyPlanScores(userId) {
  try {
    const sessions = await Session.find({ userId });
    
    const scores = sessions
      .filter(s => s.points !== undefined && s.points !== null)
      .map(s => s.points);
    
    if (scores.length === 0) {
      return {
        averageScore: 0,
        totalSessions: 0,
        recentScores: []
      };
    }
    
    // Get recent session scores
    const recentScores = sessions
      .filter(s => s.points !== undefined && s.points !== null)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(s => ({
        sessionId: s._id,
        title: s.chatTitle || s.topic || 'Untitled Session',
        score: s.points,
        date: s.updatedAt
      }));
    
    return {
      averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      totalSessions: scores.length,
      recentScores
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating study plan scores');
    return {
      averageScore: 0,
      totalSessions: 0,
      recentScores: []
    };
  }
}

/**
 * Calculate revision scores (sessions with mode 'reviewing' or 'testing')
 */
async function calculateRevisionScores(userId) {
  try {
    const sessions = await Session.find({ 
      userId,
      mode: { $in: ['reviewing', 'testing'] }
    });
    
    // Primary source: Get from Session.quizAttempts
    const sessionQuizAttempts = [];
    sessions.forEach(session => {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        session.quizAttempts.forEach(attempt => {
          if (attempt.status === 'submitted' && attempt.scorePct !== undefined) {
            sessionQuizAttempts.push({
              score: attempt.scorePct / 100
            });
          }
        });
      }
    });
    
    // Secondary source: Try QuizAttempt collection
    let quizAttempts = [];
    try {
      const sessionIds = sessions.map(s => s._id);
      quizAttempts = await QuizAttempt.find({ 
        sessionId: { $in: sessionIds } 
      });
    } catch (err) {
      logger.debug({ userId, error: err.message }, 'QuizAttempt collection query failed for revisions');
    }
    
    const allScores = [
      ...quizAttempts.map(qa => qa.score || 0).filter(s => s > 0),
      ...sessionQuizAttempts.map(a => a.score)
    ];
    
    if (allScores.length === 0) {
      return {
        averageScore: 0,
        totalRevisions: 0
      };
    }
    
    return {
      averageScore: Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100),
      totalRevisions: allScores.length
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating revision scores');
    return {
      averageScore: 0,
      totalRevisions: 0
    };
  }
}

/**
 * Calculate accuracy rate (overall quiz performance)
 */
async function calculateAccuracyRate(userId) {
  try {
    const quizStats = await calculateQuizScores(userId);
    return {
      accuracyRate: quizStats.averageScore,
      totalQuestions: quizStats.totalQuizzes * 4, // Assuming ~4 questions per quiz
      correctAnswers: Math.round((quizStats.averageScore / 100) * (quizStats.totalQuizzes * 4))
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating accuracy rate');
    return {
      accuracyRate: 0,
      totalQuestions: 0,
      correctAnswers: 0
    };
  }
}

/**
 * Calculate activity streak (consecutive days with sessions)
 */
async function calculateActivityStreak(userId) {
  try {
    const sessions = await Session.find({ userId })
      .sort({ createdAt: -1 })
      .select('createdAt');
    
    if (sessions.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
    }
    
    // Get unique dates
    const dates = new Set();
    sessions.forEach(session => {
      if (session.createdAt) {
        const date = new Date(session.createdAt);
        date.setHours(0, 0, 0, 0);
        dates.add(date.getTime());
      }
    });
    
    const sortedDates = Array.from(dates).sort((a, b) => b - a);
    
    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    
    let checkDate = todayTime;
    for (const dateTime of sortedDates) {
      if (dateTime === checkDate) {
        currentStreak++;
        checkDate -= 24 * 60 * 60 * 1000; // Subtract one day
      } else if (dateTime < checkDate) {
        break;
      }
    }
    
    // Calculate longest streak
    let longestStreak = 1;
    let tempStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const diff = (sortedDates[i - 1] - sortedDates[i]) / (24 * 60 * 60 * 1000);
      if (diff === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }
    
    return {
      currentStreak,
      longestStreak,
      lastActivityDate: sortedDates[0] ? new Date(sortedDates[0]) : null
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating activity streak');
    return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  }
}

/**
 * Calculate topic distribution
 */
async function calculateTopicDistribution(userId) {
  try {
    const sessions = await Session.find({ userId }).select('topic createdAt');
    
    const topicCounts = {};
    sessions.forEach(session => {
      const topic = session.topic || 'General Learning';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
    
    const topics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 topics
    
    return topics;
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating topic distribution');
    return [];
  }
}

/**
 * Calculate percentile rankings and platform averages
 */
async function calculateComparativeData(userId, userMetrics) {
  try {
    // Get all users' stats for comparison
    const allUsers = await User.find({}).select('stats profile');
    
    // Calculate platform averages
    const allSessions = await Session.find({});
    const allQuizAttempts = await Session.find({}).select('quizAttempts');
    
    // Platform quiz average
    let totalQuizScores = 0;
    let totalQuizCount = 0;
    allQuizAttempts.forEach(session => {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        session.quizAttempts.forEach(attempt => {
          if (attempt.status === 'submitted' && attempt.scorePct !== undefined) {
            totalQuizScores += attempt.scorePct;
            totalQuizCount++;
          }
        });
      }
    });
    const platformQuizAverage = totalQuizCount > 0 ? Math.round(totalQuizScores / totalQuizCount) : 0;
    
    // Platform points average
    const allPoints = allSessions
      .map(s => s.points || 0)
      .filter(p => p > 0);
    const platformPointsAverage = allPoints.length > 0 
      ? Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length)
      : 0;
    
    // Platform sessions completed average
    const platformSessionsCompleted = allUsers.length > 0
      ? Math.round(allUsers.reduce((sum, u) => sum + (u.stats?.sessionsCompleted || 0), 0) / allUsers.length)
      : 0;
    
    // Calculate platform time spent average
    const allUserMinutes = [];
    for (const user of allUsers) {
      const userMinutes = await calculateTotalMinutesSpent(user._id.toString());
      if (userMinutes > 0) {
        allUserMinutes.push(userMinutes);
      }
    }
    const platformTimeSpentAverage = allUserMinutes.length > 0
      ? Math.round(allUserMinutes.reduce((a, b) => a + b, 0) / allUserMinutes.length)
      : 0;
    
    // Calculate platform module completion average
    const allUserModuleCompletions = [];
    for (const user of allUsers) {
      const moduleCompletion = await calculateModuleCompletion(user._id.toString());
      if (moduleCompletion.totalModules > 0) {
        allUserModuleCompletions.push(moduleCompletion.completionRate);
      }
    }
    const platformModuleCompletionAverage = allUserModuleCompletions.length > 0
      ? Math.round(allUserModuleCompletions.reduce((a, b) => a + b, 0) / allUserModuleCompletions.length)
      : 0;
    
    // Calculate platform accuracy average
    const allUserAccuracies = [];
    for (const user of allUsers) {
      const accuracy = await calculateAccuracyRate(user._id.toString());
      if (accuracy.accuracyRate > 0) {
        allUserAccuracies.push(accuracy.accuracyRate);
      }
    }
    const platformAccuracyAverage = allUserAccuracies.length > 0
      ? Math.round(allUserAccuracies.reduce((a, b) => a + b, 0) / allUserAccuracies.length)
      : 0;
    
    // Calculate user's percentile for points
    const userPoints = userMetrics.userStats?.pointsTotal || 0;
    const usersAbove = allUsers.filter(u => (u.stats?.pointsTotal || 0) > userPoints).length;
    const pointsPercentile = allUsers.length > 0 
      ? Math.round(((allUsers.length - usersAbove) / allUsers.length) * 100)
      : 50;
    
    // Calculate user's percentile for sessions completed
    const userSessionsCompleted = userMetrics.sessionStats?.completed || 0;
    const usersAboveSessions = allUsers.filter(u => (u.stats?.sessionsCompleted || 0) > userSessionsCompleted).length;
    const sessionsPercentile = allUsers.length > 0
      ? Math.round(((allUsers.length - usersAboveSessions) / allUsers.length) * 100)
      : 50;
    
    // Calculate user's percentile for quiz score
    const userQuizScore = userMetrics.quizScores?.average || 0;
    const usersAboveQuiz = allUsers.filter(u => {
      // This is simplified - in production, you'd calculate each user's quiz average
      return false; // Placeholder
    }).length;
    const quizScorePercentile = userQuizScore >= platformQuizAverage ? 60 : 40;
    
    // Calculate user's percentile for time spent
    const userTimeSpent = userMetrics.minutesSpent || 0;
    const usersAboveTime = allUserMinutes.filter(m => m > userTimeSpent).length;
    const timeSpentPercentile = allUserMinutes.length > 0
      ? Math.round(((allUserMinutes.length - usersAboveTime) / allUserMinutes.length) * 100)
      : 50;
    
    // Calculate user's percentile for module completion
    const userModuleCompletion = userMetrics.moduleCompletion?.completionRate || 0;
    const usersAboveModules = allUserModuleCompletions.filter(m => m > userModuleCompletion).length;
    const moduleCompletionPercentile = allUserModuleCompletions.length > 0
      ? Math.round(((allUserModuleCompletions.length - usersAboveModules) / allUserModuleCompletions.length) * 100)
      : 50;
    
    // Calculate user's percentile for accuracy
    const userAccuracy = userMetrics.accuracyRate || 0;
    const usersAboveAccuracy = allUserAccuracies.filter(a => a > userAccuracy).length;
    const accuracyPercentile = allUserAccuracies.length > 0
      ? Math.round(((allUserAccuracies.length - usersAboveAccuracy) / allUserAccuracies.length) * 100)
      : 50;
    
    // Get benchmark badge
    const getBenchmarkBadge = (percentile) => {
      if (percentile >= 90) return { level: 'Excellent', color: '#10b981' };
      if (percentile >= 75) return { level: 'Great', color: '#4e81ee' };
      if (percentile >= 50) return { level: 'Good', color: '#f59e0b' };
      return { level: 'Average', color: '#6b7280' };
    };
    
    return {
      platformAverages: {
        quizScore: platformQuizAverage,
        points: platformPointsAverage,
        sessionsCompleted: platformSessionsCompleted,
        timeSpent: platformTimeSpentAverage,
        moduleCompletion: platformModuleCompletionAverage,
        accuracy: platformAccuracyAverage
      },
      percentiles: {
        points: pointsPercentile,
        sessions: sessionsPercentile,
        quizScore: quizScorePercentile,
        timeSpent: timeSpentPercentile,
        moduleCompletion: moduleCompletionPercentile,
        accuracy: accuracyPercentile
      },
      benchmarks: {
        points: getBenchmarkBadge(pointsPercentile),
        sessions: getBenchmarkBadge(sessionsPercentile),
        quizScore: getBenchmarkBadge(quizScorePercentile),
        timeSpent: getBenchmarkBadge(timeSpentPercentile),
        moduleCompletion: getBenchmarkBadge(moduleCompletionPercentile),
        accuracy: getBenchmarkBadge(accuracyPercentile)
      },
      comparison: {
        quizScore: {
          user: userMetrics.quizScores?.average || 0,
          platform: platformQuizAverage,
          difference: (userMetrics.quizScores?.average || 0) - platformQuizAverage
        },
        points: {
          user: userMetrics.userStats?.pointsTotal || 0,
          platform: platformPointsAverage,
          difference: (userMetrics.userStats?.pointsTotal || 0) - platformPointsAverage
        },
        sessionsCompleted: {
          user: userMetrics.sessionStats?.completed || 0,
          platform: platformSessionsCompleted,
          difference: (userMetrics.sessionStats?.completed || 0) - platformSessionsCompleted
        },
        timeSpent: {
          user: userMetrics.minutesSpent || 0,
          platform: platformTimeSpentAverage,
          difference: (userMetrics.minutesSpent || 0) - platformTimeSpentAverage
        },
        moduleCompletion: {
          user: userMetrics.moduleCompletion?.completionRate || 0,
          platform: platformModuleCompletionAverage,
          difference: (userMetrics.moduleCompletion?.completionRate || 0) - platformModuleCompletionAverage
        },
        accuracy: {
          user: userMetrics.accuracyRate || 0,
          platform: platformAccuracyAverage,
          difference: (userMetrics.accuracyRate || 0) - platformAccuracyAverage
        }
      }
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating comparative data');
    return {
      platformAverages: { quizScore: 0, points: 0, sessionsCompleted: 0, timeSpent: 0, moduleCompletion: 0, accuracy: 0 },
      percentiles: { points: 50, sessions: 50, quizScore: 50, timeSpent: 50, moduleCompletion: 50, accuracy: 50 },
      benchmarks: {
        points: { level: 'Average', color: '#6b7280' },
        sessions: { level: 'Average', color: '#6b7280' },
        quizScore: { level: 'Average', color: '#6b7280' },
        timeSpent: { level: 'Average', color: '#6b7280' },
        moduleCompletion: { level: 'Average', color: '#6b7280' },
        accuracy: { level: 'Average', color: '#6b7280' }
      },
      comparison: {
        quizScore: { user: 0, platform: 0, difference: 0 },
        points: { user: 0, platform: 0, difference: 0 },
        sessionsCompleted: { user: 0, platform: 0, difference: 0 },
        timeSpent: { user: 0, platform: 0, difference: 0 },
        moduleCompletion: { user: 0, platform: 0, difference: 0 },
        accuracy: { user: 0, platform: 0, difference: 0 }
      }
    };
  }
}

/**
 * Calculate time-based trends (weekly/monthly performance)
 */
async function calculateTimeBasedTrends(userId) {
  try {
    const sessions = await Session.find({ userId })
      .sort({ createdAt: 1 })
      .select('createdAt updatedAt points phase quizAttempts');
    
    if (sessions.length === 0) {
      return { weekly: [], monthly: [] };
    }
    
    // Group by week
    const weeklyData = {};
    const monthlyData = {};
    
    sessions.forEach(session => {
      if (!session.createdAt) return;
      
      const date = new Date(session.createdAt);
      const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Weekly aggregation
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekKey,
          sessions: 0,
          completed: 0,
          avgScore: 0,
          totalScore: 0,
          scoreCount: 0
        };
      }
      weeklyData[weekKey].sessions++;
      if (session.phase === 'completed') {
        weeklyData[weekKey].completed++;
      }
      if (session.points) {
        weeklyData[weekKey].totalScore += session.points;
        weeklyData[weekKey].scoreCount++;
      }
      
      // Monthly aggregation
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          sessions: 0,
          completed: 0,
          avgScore: 0,
          totalScore: 0,
          scoreCount: 0
        };
      }
      monthlyData[monthKey].sessions++;
      if (session.phase === 'completed') {
        monthlyData[monthKey].completed++;
      }
      if (session.points) {
        monthlyData[monthKey].totalScore += session.points;
        monthlyData[monthKey].scoreCount++;
      }
    });
    
    // Calculate averages and format
    const weekly = Object.values(weeklyData)
      .map(w => ({
        ...w,
        avgScore: w.scoreCount > 0 ? Math.round(w.totalScore / w.scoreCount) : 0,
        completionRate: w.sessions > 0 ? Math.round((w.completed / w.sessions) * 100) : 0
      }))
      .slice(-12); // Last 12 weeks
    
    const monthly = Object.values(monthlyData)
      .map(m => ({
        ...m,
        avgScore: m.scoreCount > 0 ? Math.round(m.totalScore / m.scoreCount) : 0,
        completionRate: m.sessions > 0 ? Math.round((m.completed / m.sessions) * 100) : 0
      }))
      .slice(-6); // Last 6 months
    
    return { weekly, monthly };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating time-based trends');
    return { weekly: [], monthly: [] };
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Calculate phase funnel analytics
 */
async function calculatePhaseFunnel(userId) {
  try {
    const sessions = await Session.find({ userId }).select('phase createdAt updatedAt');
    
    const phaseCounts = {
      pre: 0,
      assessing: 0,
      planning: 0,
      learning: 0,
      quizzing: 0,
      feedback: 0,
      completed: 0
    };
    
    const phaseTimeSpent = {
      pre: 0,
      assessing: 0,
      planning: 0,
      learning: 0,
      quizzing: 0,
      feedback: 0,
      completed: 0
    };
    
    sessions.forEach(session => {
      if (session.phase) {
        phaseCounts[session.phase] = (phaseCounts[session.phase] || 0) + 1;
      }
    });
    
    // Calculate drop-off rates
    const totalSessions = sessions.length;
    const funnel = [
      { phase: 'pre', count: phaseCounts.pre || 0, percentage: 100 },
      { phase: 'assessing', count: phaseCounts.assessing || 0, percentage: totalSessions > 0 ? Math.round((phaseCounts.assessing / totalSessions) * 100) : 0 },
      { phase: 'learning', count: phaseCounts.learning || 0, percentage: totalSessions > 0 ? Math.round((phaseCounts.learning / totalSessions) * 100) : 0 },
      { phase: 'quizzing', count: phaseCounts.quizzing || 0, percentage: totalSessions > 0 ? Math.round((phaseCounts.quizzing / totalSessions) * 100) : 0 },
      { phase: 'completed', count: phaseCounts.completed || 0, percentage: totalSessions > 0 ? Math.round((phaseCounts.completed / totalSessions) * 100) : 0 }
    ];
    
    return {
      funnel,
      dropOffPoints: calculateDropOffPoints(funnel),
      totalSessions
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating phase funnel');
    return { funnel: [], dropOffPoints: [], totalSessions: 0 };
  }
}

function calculateDropOffPoints(funnel) {
  const dropOffs = [];
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1];
    const curr = funnel[i];
    const dropOff = prev.percentage - curr.percentage;
    if (dropOff > 0) {
      dropOffs.push({
        from: prev.phase,
        to: curr.phase,
        dropOff: Math.round(dropOff)
      });
    }
  }
  return dropOffs;
}

/**
 * Calculate assessment metrics
 */
async function calculateAssessmentMetrics(userId) {
  try {
    const sessions = await Session.find({ userId })
      .select('phase messages createdAt updatedAt');
    
    let assessmentSessions = 0;
    let totalAssessmentTime = 0;
    let totalAssessmentTurns = 0;
    
    sessions.forEach(session => {
      if (session.phase === 'assessing' || session.phase === 'planning') {
        assessmentSessions++;
        
        // Calculate time from pre to planning completion
        if (session.createdAt && session.updatedAt) {
          const timeMs = new Date(session.updatedAt) - new Date(session.createdAt);
          totalAssessmentTime += timeMs;
        }
        
        // Count messages during assessment phase
        if (session.messages && Array.isArray(session.messages)) {
          const assessmentMessages = session.messages.filter(m => 
            m.metadata?.phaseAtSend === 'assessing' || 
            m.metadata?.phaseAtSend === 'planning'
          );
          totalAssessmentTurns += Math.ceil(assessmentMessages.length / 2); // User + Assistant pairs
        }
      }
    });
    
    return {
      totalAssessments: assessmentSessions,
      avgAssessmentTime: assessmentSessions > 0 ? Math.round(totalAssessmentTime / assessmentSessions / 1000 / 60) : 0, // in minutes
      avgAssessmentTurns: assessmentSessions > 0 ? Math.round(totalAssessmentTurns / assessmentSessions) : 0
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating assessment metrics');
    return { totalAssessments: 0, avgAssessmentTime: 0, avgAssessmentTurns: 0 };
  }
}

/**
 * Calculate quiz retry rate
 */
async function calculateQuizRetryRate(userId) {
  try {
    const sessions = await Session.find({ userId }).select('quizAttempts');
    
    let totalQuizzes = 0;
    let totalAttempts = 0;
    const quizAttemptMap = new Map(); // moduleId -> attempts
    
    sessions.forEach(session => {
      if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
        session.quizAttempts.forEach(attempt => {
          if (attempt.status === 'submitted') {
            const moduleId = attempt.moduleId;
            if (!quizAttemptMap.has(moduleId)) {
              quizAttemptMap.set(moduleId, []);
            }
            quizAttemptMap.get(moduleId).push(attempt.attemptNo);
            totalQuizzes++;
            totalAttempts += attempt.attemptNo || 1;
          }
        });
      }
    });
    
    const retryStats = Array.from(quizAttemptMap.values()).map(attempts => ({
      attempts: attempts.length,
      maxAttempts: Math.max(...attempts)
    }));
    
    const avgAttemptsPerQuiz = totalQuizzes > 0 ? (totalAttempts / totalQuizzes).toFixed(2) : 0;
    const firstAttemptPassRate = retryStats.filter(s => s.maxAttempts === 1).length / (totalQuizzes || 1) * 100;
    
    return {
      totalQuizzes,
      totalAttempts,
      avgAttemptsPerQuiz: parseFloat(avgAttemptsPerQuiz),
      firstAttemptPassRate: Math.round(firstAttemptPassRate),
      retryRate: Math.round((1 - firstAttemptPassRate / 100) * 100)
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating quiz retry rate');
    return { totalQuizzes: 0, totalAttempts: 0, avgAttemptsPerQuiz: 0, firstAttemptPassRate: 0, retryRate: 0 };
  }
}

/**
 * Calculate learning mode comparison (studying vs reviewing vs testing)
 */
async function calculateLearningModeComparison(userId) {
  try {
    const sessions = await Session.find({ userId }).select('mode points quizAttempts phase');
    
    const modeStats = {
      studying: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0 },
      reviewing: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0 },
      testing: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0 }
    };
    
    sessions.forEach(session => {
      const mode = session.mode || 'studying';
      if (modeStats[mode]) {
        modeStats[mode].sessions++;
        if (session.points) {
          modeStats[mode].totalPoints += session.points;
        }
        
        // Count quizzes for this mode
        if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
          session.quizAttempts.forEach(attempt => {
            if (attempt.status === 'submitted') {
              modeStats[mode].quizzes++;
              if (attempt.passed) {
                modeStats[mode].passedQuizzes++;
              }
            }
          });
        }
      }
    });
    
    // Calculate averages
    Object.keys(modeStats).forEach(mode => {
      const stats = modeStats[mode];
      stats.avgScore = stats.sessions > 0 ? Math.round(stats.totalPoints / stats.sessions) : 0;
      stats.passRate = stats.quizzes > 0 ? Math.round((stats.passedQuizzes / stats.quizzes) * 100) : 0;
    });
    
    return modeStats;
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating learning mode comparison');
    return {
      studying: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 },
      reviewing: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 },
      testing: { sessions: 0, totalPoints: 0, avgScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 }
    };
  }
}

/**
 * Calculate performance by difficulty level
 */
async function calculateDifficultyPerformance(userId) {
  try {
    const sessions = await Session.find({ userId }).select('plan quizAttempts');
    
    const difficultyStats = {
      intro: { modules: 0, completed: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0 },
      core: { modules: 0, completed: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0 },
      apply: { modules: 0, completed: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0 },
      challenge: { modules: 0, completed: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0 }
    };
    
    sessions.forEach(session => {
      if (session.plan && Array.isArray(session.plan)) {
        session.plan.forEach(module => {
          const difficulty = module.difficulty || 'core';
          if (difficultyStats[difficulty]) {
            difficultyStats[difficulty].modules++;
            if (module.status === 'passed') {
              difficultyStats[difficulty].completed++;
            }
            
            // Find quiz attempts for this module
            if (session.quizAttempts && Array.isArray(session.quizAttempts)) {
              session.quizAttempts.forEach(attempt => {
                if (attempt.moduleId === module.id && attempt.status === 'submitted') {
                  difficultyStats[difficulty].quizzes++;
                  if (attempt.scorePct) {
                    difficultyStats[difficulty].avgQuizScore += attempt.scorePct;
                  }
                  if (attempt.passed) {
                    difficultyStats[difficulty].passedQuizzes++;
                  }
                }
              });
            }
          }
        });
      }
    });
    
    // Calculate averages and completion rates
    Object.keys(difficultyStats).forEach(difficulty => {
      const stats = difficultyStats[difficulty];
      stats.completionRate = stats.modules > 0 ? Math.round((stats.completed / stats.modules) * 100) : 0;
      stats.avgQuizScore = stats.quizzes > 0 ? Math.round(stats.avgQuizScore / stats.quizzes) : 0;
      stats.passRate = stats.quizzes > 0 ? Math.round((stats.passedQuizzes / stats.quizzes) * 100) : 0;
    });
    
    return difficultyStats;
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating difficulty performance');
    return {
      intro: { modules: 0, completed: 0, completionRate: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 },
      core: { modules: 0, completed: 0, completionRate: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 },
      apply: { modules: 0, completed: 0, completionRate: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 },
      challenge: { modules: 0, completed: 0, completionRate: 0, avgQuizScore: 0, quizzes: 0, passedQuizzes: 0, passRate: 0 }
    };
  }
}

/**
 * Calculate learning efficiency metrics
 */
async function calculateLearningEfficiency(userId) {
  try {
    const sessions = await Session.find({ userId }).select('points messages createdAt updatedAt');
    
    let totalPoints = 0;
    let totalMinutes = 0;
    let totalModules = 0;
    let completedSessions = 0;
    
    sessions.forEach(session => {
      if (session.points) {
        totalPoints += session.points;
      }
      
      // Calculate session duration
      if (session.messages && session.messages.length >= 2) {
        const firstMessage = session.messages[0];
        const lastMessage = session.messages[session.messages.length - 1];
        
        if (firstMessage.timestamp && lastMessage.timestamp) {
          const durationMs = new Date(lastMessage.timestamp) - new Date(firstMessage.timestamp);
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          totalMinutes += Math.min(durationMinutes, 480); // Cap at 8 hours
        }
      }
      
      // Count modules
      if (session.plan && Array.isArray(session.plan)) {
        totalModules += session.plan.filter(m => m.status === 'passed').length;
      }
      
      if (session.phase === 'completed') {
        completedSessions++;
      }
    });
    
    return {
      pointsPerMinute: totalMinutes > 0 ? (totalPoints / totalMinutes).toFixed(2) : 0,
      modulesPerHour: totalMinutes > 0 ? ((totalModules / totalMinutes) * 60).toFixed(2) : 0,
      avgPointsPerSession: completedSessions > 0 ? Math.round(totalPoints / completedSessions) : 0,
      efficiencyScore: totalMinutes > 0 ? Math.round((totalPoints / totalMinutes) * 10) : 0 // Score out of 10
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating learning efficiency');
    return {
      pointsPerMinute: 0,
      modulesPerHour: 0,
      avgPointsPerSession: 0,
      efficiencyScore: 0
    };
  }
}

/**
 * Calculate time spent per phase
 */
async function calculatePhaseTimeBreakdown(userId) {
  try {
    const sessions = await Session.find({ userId }).select('phase messages createdAt updatedAt');
    
    const phaseTime = {
      pre: 0,
      assessing: 0,
      planning: 0,
      learning: 0,
      quizzing: 0,
      feedback: 0,
      completed: 0
    };
    
    // Group messages by phase to estimate time spent
    sessions.forEach(session => {
      if (!session.messages || !Array.isArray(session.messages) || session.messages.length < 2) {
        return;
      }
      
      // Group messages by phase
      const messagesByPhase = {};
      session.messages.forEach(msg => {
        const phase = msg.metadata?.phaseAtSend || session.phase || 'pre';
        if (!messagesByPhase[phase]) {
          messagesByPhase[phase] = [];
        }
        messagesByPhase[phase].push(msg);
      });
      
      // Calculate time for each phase
      Object.keys(messagesByPhase).forEach(phase => {
        const phaseMessages = messagesByPhase[phase];
        if (phaseMessages.length >= 2) {
          const firstMsg = phaseMessages[0];
          const lastMsg = phaseMessages[phaseMessages.length - 1];
          
          if (firstMsg.timestamp && lastMsg.timestamp) {
            const durationMs = new Date(lastMsg.timestamp) - new Date(firstMsg.timestamp);
            const durationMinutes = Math.floor(durationMs / (1000 * 60));
            phaseTime[phase] = (phaseTime[phase] || 0) + Math.min(durationMinutes, 480);
          }
        } else if (phaseMessages.length === 1) {
          // Estimate 5 minutes for single message phases
          phaseTime[phase] = (phaseTime[phase] || 0) + 5;
        }
      });
    });
    
    // Calculate percentages
    const totalTime = Object.values(phaseTime).reduce((sum, time) => sum + time, 0);
    const phaseBreakdown = Object.keys(phaseTime).map(phase => ({
      phase,
      minutes: phaseTime[phase],
      percentage: totalTime > 0 ? Math.round((phaseTime[phase] / totalTime) * 100) : 0
    })).filter(p => p.minutes > 0);
    
    return {
      breakdown: phaseBreakdown,
      totalMinutes: totalTime
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating phase time breakdown');
    return { breakdown: [], totalMinutes: 0 };
  }
}

/**
 * Calculate session duration analytics
 */
async function calculateSessionDurationAnalytics(userId) {
  try {
    const sessions = await Session.find({ userId }).select('messages createdAt updatedAt phase');
    
    const durations = [];
    let totalDuration = 0;
    
    sessions.forEach(session => {
      let duration = 0;
      
      if (session.messages && session.messages.length >= 2) {
        const firstMessage = session.messages[0];
        const lastMessage = session.messages[session.messages.length - 1];
        
        if (firstMessage.timestamp && lastMessage.timestamp) {
          const durationMs = new Date(lastMessage.timestamp) - new Date(firstMessage.timestamp);
          duration = Math.floor(durationMs / (1000 * 60)); // in minutes
          duration = Math.min(duration, 480); // Cap at 8 hours
        }
      }
      
      if (duration > 0) {
        durations.push(duration);
        totalDuration += duration;
      }
    });
    
    if (durations.length === 0) {
      return {
        average: 0,
        shortest: 0,
        longest: 0,
        median: 0,
        distribution: []
      };
    }
    
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    
    // Create distribution (0-15min, 15-30min, 30-60min, 60+ min)
    const distribution = [
      { range: '0-15 min', count: durations.filter(d => d <= 15).length },
      { range: '15-30 min', count: durations.filter(d => d > 15 && d <= 30).length },
      { range: '30-60 min', count: durations.filter(d => d > 30 && d <= 60).length },
      { range: '60+ min', count: durations.filter(d => d > 60).length }
    ];
    
    return {
      average: Math.round(totalDuration / durations.length),
      shortest: durations[0],
      longest: durations[durations.length - 1],
      median: median,
      distribution
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error calculating session duration analytics');
    return {
      average: 0,
      shortest: 0,
      longest: 0,
      median: 0,
      distribution: []
    };
  }
}

/**
 * Get comprehensive performance data for a user
 */
async function getUserPerformance(userId) {
  try {
    const [
      totalMinutes,
      quizScores,
      moduleCompletion,
      studyPlanScores,
      revisionScores,
      accuracyRate,
      user,
      activityStreak,
      topicDistribution,
      timeTrends,
      phaseFunnel,
      assessmentMetrics,
      quizRetryRate,
      learningModeComparison,
      difficultyPerformance,
      learningEfficiency,
      phaseTimeBreakdown,
      sessionDurationAnalytics
    ] = await Promise.all([
      calculateTotalMinutesSpent(userId),
      calculateQuizScores(userId),
      calculateModuleCompletion(userId),
      calculateStudyPlanScores(userId),
      calculateRevisionScores(userId),
      calculateAccuracyRate(userId),
      User.findById(userId),
      calculateActivityStreak(userId),
      calculateTopicDistribution(userId),
      calculateTimeBasedTrends(userId),
      calculatePhaseFunnel(userId),
      calculateAssessmentMetrics(userId),
      calculateQuizRetryRate(userId),
      calculateLearningModeComparison(userId),
      calculateDifficultyPerformance(userId),
      calculateLearningEfficiency(userId),
      calculatePhaseTimeBreakdown(userId),
      calculateSessionDurationAnalytics(userId)
    ]);
    
    // Get total sessions
    const totalSessions = await Session.countDocuments({ userId });
    const completedSessions = await Session.countDocuments({ 
      userId,
      phase: 'completed' 
    });
    
    // Build base metrics
    const baseMetrics = {
      // Core metrics
      minutesSpent: totalMinutes,
      quizScores: {
        average: quizScores.averageScore,
        passRate: quizScores.passRate,
        totalQuizzes: quizScores.totalQuizzes,
        passedQuizzes: quizScores.passedQuizzes,
        averageTime: quizScores.averageTime,
        recentScores: quizScores.recentScores
      },
      moduleCompletion: {
        total: moduleCompletion.totalModules,
        completed: moduleCompletion.completedModules,
        completionRate: moduleCompletion.completionRate,
        milestones: {
          total: moduleCompletion.totalMilestones,
          completed: moduleCompletion.completedMilestones,
          completionRate: moduleCompletion.milestoneCompletionRate
        }
      },
      studyPlanScores: {
        average: studyPlanScores.averageScore,
        totalSessions: studyPlanScores.totalSessions,
        recentScores: studyPlanScores.recentScores
      },
      revisionScores: {
        average: revisionScores.averageScore,
        totalRevisions: revisionScores.totalRevisions
      },
      accuracyRate: accuracyRate.accuracyRate,
      sessionStats: {
        total: totalSessions,
        completed: completedSessions,
        completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
      },
      userStats: user?.stats || {
        pointsTotal: 0,
        gemsTotal: 0,
        sessionsCompleted: 0,
        trophiesTotal: 0
      },
      activityStreak,
      topicDistribution
    };
    
    // Calculate comparative data
    const comparativeData = await calculateComparativeData(userId, baseMetrics);
    
    return {
      ...baseMetrics,
      comparative: comparativeData,
      timeTrends,
      phaseFunnel,
      assessmentMetrics,
      quizRetryRate,
      learningModeComparison,
      difficultyPerformance,
      learningEfficiency,
      phaseTimeBreakdown,
      sessionDurationAnalytics
    };
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Error getting user performance');
    throw error;
  }
}

module.exports = {
  getUserPerformance,
  calculateTotalMinutesSpent,
  calculateQuizScores,
  calculateModuleCompletion,
  calculateStudyPlanScores,
  calculateRevisionScores,
  calculateAccuracyRate,
  calculateActivityStreak,
  calculateTopicDistribution,
  calculateComparativeData,
  calculateTimeBasedTrends,
  calculatePhaseFunnel,
  calculateAssessmentMetrics,
  calculateQuizRetryRate,
  calculateLearningModeComparison,
  calculateDifficultyPerformance,
  calculateLearningEfficiency,
  calculatePhaseTimeBreakdown,
  calculateSessionDurationAnalytics
};


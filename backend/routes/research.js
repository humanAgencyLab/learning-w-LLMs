const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const { ResearchTokenManager, ResearchDataCollector } = require('../middleware/researchOptimizer');

const tokenManager = new ResearchTokenManager();
const dataCollector = new ResearchDataCollector();

// Start research session
router.post('/start-session', async (req, res) => {
  try {
    const { prolificId, topic } = req.body;
    
    // Check if we can start a new session
    const canStart = tokenManager.canStartSession();
    if (!canStart.allowed) {
      return res.status(429).json({ 
        error: 'Study capacity reached or daily limit exceeded',
        reason: canStart.reason 
      });
    }
    
    // Create new session
    const session = new StudySession({
      prolificId,
      topic,
      studyPhase: 'pre_assessment',
      startTime: new Date(),
      researchData: {
        prolificId,
        startTime: new Date(),
        topic
      }
    });
    
    await session.save();
    
    res.json({
      sessionId: session._id,
      message: 'Research session started',
      studyProgress: tokenManager.getStudyProgress()
    });
    
  } catch (error) {
    console.error('Error starting research session:', error);
    res.status(500).json({ error: 'Failed to start research session' });
  }
});

// Record research event
router.post('/record-event', async (req, res) => {
  try {
    const { sessionId, eventType, data } = req.body;
    
    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Record event in session
    if (!session.researchData.events) {
      session.researchData.events = [];
    }
    
    session.researchData.events.push({
      type: eventType,
      data,
      timestamp: new Date()
    });
    
    await session.save();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error recording research event:', error);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// Complete research session
router.post('/complete-session', async (req, res) => {
  try {
    const { sessionId, finalData } = req.body;
    
    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update session with completion data
    session.researchData.endTime = new Date();
    session.researchData.status = 'completed';
    session.researchData.finalData = finalData;
    
    // Calculate session duration
    const duration = session.researchData.endTime - session.researchData.startTime;
    session.researchData.duration = duration;
    
    await session.save();
    
    // Record in data collector
    dataCollector.collectSessionData(sessionId, {
      sessionId,
      prolificId: session.researchData.prolificId,
      topic: session.researchData.topic,
      startTime: session.researchData.startTime,
      endTime: session.researchData.endTime,
      duration,
      status: 'completed',
      ...finalData
    });
    
    // Update token manager
    tokenManager.participantCount++;
    
    res.json({
      success: true,
      message: 'Research session completed',
      studyProgress: tokenManager.getStudyProgress()
    });
    
  } catch (error) {
    console.error('Error completing research session:', error);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Get study progress
router.get('/study-progress', (req, res) => {
  res.json(tokenManager.getStudyProgress());
});

// Export research data
router.get('/export-data', (req, res) => {
  try {
    const researchData = dataCollector.exportResearchData();
    
    res.json({
      success: true,
      data: researchData,
      exportTime: new Date()
    });
    
  } catch (error) {
    console.error('Error exporting research data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Get study statistics
router.get('/study-stats', async (req, res) => {
  try {
    const sessions = await StudySession.find({ 'researchData.prolificId': { $exists: true } });
    
    const stats = {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(s => s.researchData.status === 'completed').length,
      averageDuration: sessions.reduce((sum, s) => {
        if (s.researchData.duration) {
          return sum + s.researchData.duration;
        }
        return sum;
      }, 0) / sessions.length,
      topicDistribution: sessions.reduce((acc, s) => {
        const topic = s.researchData.topic || 'unknown';
        acc[topic] = (acc[topic] || 0) + 1;
        return acc;
      }, {}),
      completionRate: (sessions.filter(s => s.researchData.status === 'completed').length / sessions.length) * 100
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Error getting study stats:', error);
    res.status(500).json({ error: 'Failed to get study statistics' });
  }
});

module.exports = router;

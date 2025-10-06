// Research study token optimization
const { getCachedResponse, cacheResponse } = require('./conversationCache');

class ResearchTokenManager {
  constructor() {
    this.dailyLimit = 50000;
    this.usedToday = 0;
    this.participantCount = 0;
    this.maxParticipants = 200;
    this.sessionTokens = new Map(); // Track tokens per session
  }
  
  // Estimate tokens needed for study
  estimateStudyTokens() {
    const tokensPerParticipant = 2000; // Optimized estimate
    const totalNeeded = this.maxParticipants * tokensPerParticipant;
    const daysNeeded = Math.ceil(totalNeeded / this.dailyLimit);
    
    return {
      totalNeeded,
      daysNeeded,
      participantsPerDay: Math.floor(this.dailyLimit / tokensPerParticipant)
    };
  }
  
  // Check if we can start a new participant session
  canStartSession() {
    if (this.participantCount >= this.maxParticipants) {
      return { allowed: false, reason: 'Study capacity reached' };
    }
    
    const estimatedTokens = 2000;
    if (this.usedToday + estimatedTokens > this.dailyLimit) {
      return { allowed: false, reason: 'Daily token limit reached' };
    }
    
    return { allowed: true, reason: 'OK' };
  }
  
  // Record token usage for a session
  recordSessionTokens(sessionId, tokens) {
    this.sessionTokens.set(sessionId, tokens);
    this.usedToday += tokens;
  }
  
  // Get study progress
  getStudyProgress() {
    return {
      participantsCompleted: this.participantCount,
      totalParticipants: this.maxParticipants,
      tokensUsedToday: this.usedToday,
      tokensRemainingToday: this.dailyLimit - this.usedToday,
      completionRate: (this.participantCount / this.maxParticipants) * 100
    };
  }
  
  // Reset daily counters (call at midnight)
  resetDailyCounters() {
    this.usedToday = 0;
    this.sessionTokens.clear();
  }
}

// Research-specific response templates
const researchTemplates = {
  welcome: "Welcome to our learning study! We'll help you learn [TOPIC] using an AI tutor. This should take about 45 minutes.",
  
  assessment: {
    piano: "Let's start with a quick assessment. What's your experience with piano? (beginner/intermediate/advanced)",
    python: "Let's start with a quick assessment. What's your programming background? (none/some/experienced)",
    guitar: "Let's start with a quick assessment. What's your guitar experience? (never played/some/experienced)"
  },
  
  planOverview: (topic, modules) => {
    return `Great! Here's your personalized learning plan for ${topic}:\n\n${modules.map((m, i) => `${i+1}. ${m.title}`).join('\n')}\n\nLet's begin with the first module!`;
  },
  
  moduleComplete: "Excellent! You've completed this module. Let's take a quick quiz to check your understanding.",
  
  studyComplete: "Congratulations! You've completed the learning session. Please take a moment to fill out our brief feedback survey."
};

// Research data collection
class ResearchDataCollector {
  constructor() {
    this.sessionData = new Map();
  }
  
  // Collect session metrics
  collectSessionData(sessionId, data) {
    this.sessionData.set(sessionId, {
      ...data,
      timestamp: new Date(),
      duration: data.endTime - data.startTime
    });
  }
  
  // Export data for analysis
  exportResearchData() {
    const data = Array.from(this.sessionData.values());
    return {
      totalSessions: data.length,
      averageDuration: data.reduce((sum, d) => sum + d.duration, 0) / data.length,
      completionRates: this.calculateCompletionRates(data),
      learningOutcomes: this.calculateLearningOutcomes(data),
      rawData: data
    };
  }
  
  calculateCompletionRates(data) {
    const completed = data.filter(d => d.status === 'completed').length;
    return (completed / data.length) * 100;
  }
  
  calculateLearningOutcomes(data) {
    // Calculate pre/post assessment improvements
    return data.map(d => ({
      sessionId: d.sessionId,
      preScore: d.preAssessmentScore,
      postScore: d.postAssessmentScore,
      improvement: d.postAssessmentScore - d.preAssessmentScore
    }));
  }
}

module.exports = {
  ResearchTokenManager,
  researchTemplates,
  ResearchDataCollector
};

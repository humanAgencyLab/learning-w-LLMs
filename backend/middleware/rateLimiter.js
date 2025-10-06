// Rate limiting and queue management for token conservation
const rateLimit = require('express-rate-limit');
const Queue = require('bull');
const Redis = require('ioredis');

// Redis connection for queue
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create queue for API requests
const apiQueue = new Queue('api requests', {
  redis: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Token budget management
class TokenBudgetManager {
  constructor(dailyLimit = 50000, hourlyLimit = 5000) {
    this.dailyLimit = dailyLimit;
    this.hourlyLimit = hourlyLimit;
    this.dailyUsed = 0;
    this.hourlyUsed = 0;
    this.lastReset = Date.now();
  }
  
  canMakeRequest(estimatedTokens) {
    this.resetIfNeeded();
    return (this.dailyUsed + estimatedTokens <= this.dailyLimit) && 
           (this.hourlyUsed + estimatedTokens <= this.hourlyLimit);
  }
  
  recordUsage(tokens) {
    this.dailyUsed += tokens;
    this.hourlyUsed += tokens;
  }
  
  resetIfNeeded() {
    const now = Date.now();
    const hoursSinceReset = (now - this.lastReset) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 1) {
      this.hourlyUsed = 0;
      this.lastReset = now;
    }
    
    if (hoursSinceReset >= 24) {
      this.dailyUsed = 0;
    }
  }
  
  getStatus() {
    this.resetIfNeeded();
    return {
      dailyUsed: this.dailyUsed,
      dailyRemaining: this.dailyLimit - this.dailyUsed,
      hourlyUsed: this.hourlyUsed,
      hourlyRemaining: this.hourlyLimit - this.hourlyUsed
    };
  }
}

const tokenBudget = new TokenBudgetManager();

// Rate limiting middleware
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different limits for different user types
const userRateLimits = {
  free: createRateLimit(60 * 1000, 5, 'Too many requests, please wait'),
  premium: createRateLimit(60 * 1000, 20, 'Premium rate limit exceeded'),
  admin: createRateLimit(60 * 1000, 100, 'Admin rate limit exceeded')
};

// Queue processing
apiQueue.process('groq-request', async (job) => {
  const { sessionId, message, sessionData } = job.data;
  
  // Check token budget
  const estimatedTokens = 1500; // Based on optimized prompt
  if (!tokenBudget.canMakeRequest(estimatedTokens)) {
    throw new Error('Token budget exceeded');
  }
  
  // Make API call
  // ... API call logic here ...
  
  // Record usage
  tokenBudget.recordUsage(estimatedTokens);
  
  return { success: true, tokensUsed: estimatedTokens };
});

module.exports = {
  tokenBudget,
  userRateLimits,
  apiQueue,
  TokenBudgetManager
};

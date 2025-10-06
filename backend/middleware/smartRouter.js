// Smart routing to minimize token usage
const { getTemplateResponse } = require('./tokenOptimizer');
const { getCachedResponse, cacheResponse } = require('./conversationCache');
const { tokenBudget } = require('./rateLimiter');

class SmartRouter {
  constructor() {
    this.templateThreshold = 0.8; // 80% of requests use templates
    this.cacheThreshold = 0.6;    // 60% of requests use cache
  }
  
  async routeRequest(sessionData, userMessage) {
    const { topic, phase } = sessionData;
    
    // 1. Check cache first (fastest, 0 tokens)
    const cached = getCachedResponse(topic, phase, userMessage);
    if (cached) {
      return { response: cached, source: 'cache', tokens: 0 };
    }
    
    // 2. Try template response (very fast, ~50 tokens)
    const template = getTemplateResponse(topic, phase, userMessage, sessionData);
    if (template) {
      cacheResponse(topic, phase, userMessage, template.response);
      return { response: template.response, source: 'template', tokens: 50 };
    }
    
    // 3. Check if we can afford AI call
    const estimatedTokens = 1500;
    if (!tokenBudget.canMakeRequest(estimatedTokens)) {
      return { 
        response: "AI service is temporarily busy. Please try again in a few minutes.",
        source: 'fallback',
        tokens: 0
      };
    }
    
    // 4. Make AI call (expensive, ~1500 tokens)
    const aiResponse = await this.makeAICall(sessionData, userMessage);
    cacheResponse(topic, phase, userMessage, aiResponse);
    tokenBudget.recordUsage(estimatedTokens);
    
    return { response: aiResponse, source: 'ai', tokens: estimatedTokens };
  }
  
  async makeAICall(sessionData, userMessage) {
    // This would call the Groq API
    // Implementation depends on your API setup
    return "AI response placeholder";
  }
  
  getUsageStats() {
    return tokenBudget.getStatus();
  }
}

module.exports = { SmartRouter };

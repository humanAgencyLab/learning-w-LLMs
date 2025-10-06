// Token optimization middleware
const { getCachedResponse, cacheResponse } = require('./conversationCache');
const { responseTemplates } = require('../prompts/responseTemplates');

// Optimize conversation history for API calls
const optimizeConversationHistory = (messages, maxTokens = 2000) => {
  if (messages.length <= 3) return messages;
  
  // Keep last 3 messages + first message (context)
  const optimized = [
    messages[0], // First message for context
    ...messages.slice(-3) // Last 3 messages
  ];
  
  // If still too long, summarize middle messages
  if (JSON.stringify(optimized).length > maxTokens) {
    const summary = {
      role: 'system',
      content: `[Previous conversation: ${messages.length - 4} messages about learning progress]`
    };
    return [messages[0], summary, ...messages.slice(-2)];
  }
  
  return optimized;
};

// Use templates for common responses
const getTemplateResponse = (topic, phase, userMessage, sessionData) => {
  const templates = responseTemplates[phase];
  if (!templates || !templates[topic]) return null;
  
  const level = sessionData.priorKnowledge || 'beginner';
  const template = templates[topic][level];
  
  if (template) {
    return {
      response: template,
      useTemplate: true,
      tokens: 50 // Much lower than API call
    };
  }
  
  return null;
};

// Batch similar requests
const batchSimilarRequests = (requests) => {
  const batches = {};
  
  requests.forEach(req => {
    const key = `${req.topic}_${req.phase}_${req.messageType}`;
    if (!batches[key]) batches[key] = [];
    batches[key].push(req);
  });
  
  return Object.values(batches);
};

module.exports = {
  optimizeConversationHistory,
  getTemplateResponse,
  batchSimilarRequests
};

// Conversation caching to reduce token usage
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

// Cache common responses by topic and phase
const getCacheKey = (topic, phase, userMessage) => {
  const normalizedMessage = userMessage.toLowerCase().trim();
  return `${topic}_${phase}_${normalizedMessage}`;
};

// Check if we have a cached response for similar queries
const getCachedResponse = (topic, phase, userMessage) => {
  const key = getCacheKey(topic, phase, userMessage);
  return cache.get(key);
};

// Cache successful responses
const cacheResponse = (topic, phase, userMessage, response) => {
  const key = getCacheKey(topic, phase, userMessage);
  cache.set(key, response, 3600); // 1 hour
};

// Common assessment questions cache
const commonAssessmentQuestions = {
  'piano': [
    "What's your experience with piano? (beginner/intermediate/advanced)",
    "What do you want to achieve? (play for fun/perform/learn theory)",
    "Do you prefer hands-on practice or theory first?"
  ],
  'python': [
    "What's your programming background? (none/some/experienced)",
    "What do you want to build? (web apps/data analysis/automation)",
    "Do you learn better with projects or step-by-step tutorials?"
  ],
  'guitar': [
    "What's your guitar experience? (never played/some/experienced)",
    "What style interests you? (acoustic/electric/classical)",
    "Do you want to play songs or learn theory first?"
  ]
};

module.exports = {
  getCachedResponse,
  cacheResponse,
  commonAssessmentQuestions
};

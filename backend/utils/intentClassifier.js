// Intent Classifier for /v1/chat messages
// Classifies user messages as learning, general, or admin

/**
 * Classifies user message intent using deterministic heuristics
 * Returns: 'learning' | 'general' | 'admin'
 */
const classifyIntent = (userMessage, sessionPhase) => {
  const message = userMessage.toLowerCase().trim();
  
  // Admin keywords (high priority)
  const adminKeywords = [
    'help', 'help me', 'what can you do', 'how to use', 'commands', 'menu',
    'settings', 'configure', 'preferences', 'logout', 'log out', 'exit',
    'start over', 'reset', 'new chat', 'clear', 'cancel session',
    'change profile', 'update profile', 'my profile', 'show profile'
  ];
  
  // General/off-topic keywords
  const generalKeywords = [
    'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    'how are you', 'what\'s up', 'how\'s it going', 'tell me a joke',
    'joke', 'funny', 'weather', 'news', 'what time', 'thank you', 'thanks',
    'sorry', 'my bad', 'oops', 'haha', 'lol', 'cool', 'nice', 'okay', 'ok'
  ];
  
  // Continue/navigate keywords (should be learning intent when in appropriate phase)
  const continueKeywords = [
    'continue', 'next', 'go on', 'proceed', 'let\'s continue', 'move on',
    'keep going', 'yes', 'sure', 'ok', 'okay', 'ready', 'let\'s go',
    'start', 'begin', 'teach me', 'show me', 'explain'
  ];
  
  // Check admin first (highest priority)
  if (adminKeywords.some(keyword => message.includes(keyword))) {
    return 'admin';
  }
  
  // Check general/off-topic
  if (generalKeywords.some(keyword => message.includes(keyword))) {
    return 'general';
  }
  
  // Check continue keywords - these are learning intent if in appropriate phase
  if (continueKeywords.some(keyword => message.includes(keyword))) {
    if (['learning', 'feedback'].includes(sessionPhase)) {
      return 'learning';
    }
    return 'general';
  }
  
  // Default: learning intent (topic-related, progression acceptable)
  // Messages that are content-related, questions about the topic, progress-related
  const learningIndicators = [
    'what', 'why', 'how', 'explain', 'understand', 'learn', 'study', 'practice',
    'example', 'show', 'demonstrate', 'teach', 'understand', 'concept',
    'algorithm', 'function', 'method', 'class', 'object', 'array', 'variable'
  ];
  
  // If message contains learning indicators, it's learning intent
  if (learningIndicators.some(indicator => message.includes(indicator))) {
    return 'learning';
  }
  
  // Default fallback: if in learning/feedback phase, assume learning
  if (['learning', 'feedback'].includes(sessionPhase)) {
    return 'learning';
  }
  
  // Otherwise, return general for ambiguous messages
  return 'general';
};

/**
 * Determines if LLM classification is needed for ambiguous cases
 * Returns: true if ambiguous, false if clear from heuristics
 */
const needsLLMClassification = (intent, message) => {
  // If intent is learning but message is very short and generic, might need LLM
  if (intent === 'learning' && message.split(' ').length < 3) {
    return true;
  }
  return false;
};

/**
 * Classify using LLM as fallback for ambiguous cases
 */
const classifyIntentWithLLM = async (message, groqClient) => {
  try {
    const response = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'Classify user message intent. Reply with ONLY one word: learning, general, or admin.'
        },
        {
          role: 'user',
          content: `Classify this message: "${message}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 10,
      response_format: { type: "json_object" }
    });
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    
    if (['learning', 'general', 'admin'].includes(result)) {
      return result;
    }
    
    return 'general'; // Safe fallback
  } catch (error) {
    console.warn('LLM classification failed, using general as fallback:', error);
    return 'general';
  }
};

module.exports = {
  classifyIntent,
  needsLLMClassification,
  classifyIntentWithLLM
};


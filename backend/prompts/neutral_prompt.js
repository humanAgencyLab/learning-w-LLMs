// Neutral Prompt - For general/admin messages that don't require teaching
// This is used for off-topic chat, greetings, jokes, admin requests, etc.

const handleNeutralMessage = (session, userMessage, intent, sessionPhase) => {
  // Admin messages
  if (intent === 'admin') {
    const message = userMessage.toLowerCase();
    
    if (message.includes('help')) {
      return {
        message: "I can help you learn programming concepts. Available commands:\n" +
                 "• Ask questions about any topic\n" +
                 "• Say 'quiz me' to test your knowledge\n" +
                 "• Say 'continue' to keep learning\n\n" +
                 "What would you like to learn today?",
        metadata: { type: 'admin_help' }
      };
    }
    
    if (message.includes('settings') || message.includes('configure') || message.includes('preferences')) {
      return {
        message: "Settings are managed through your profile. Contact support for profile updates.",
        metadata: { type: 'admin_settings' }
      };
    }
    
    if (message.includes('reset') || message.includes('start over') || message.includes('new chat')) {
      return {
        message: "To start a new topic, please create a new session from the dashboard.",
        metadata: { type: 'admin_reset' }
      };
    }
    
    return {
      message: "How can I help you with learning? Ask me a question about any programming topic!",
      metadata: { type: 'admin_default' }
    };
  }
  
  // General messages (greetings, jokes, off-topic)
  if (intent === 'general') {
    // During learning phase, provide a gentle bridge back to the topic
    if (sessionPhase === 'learning' && session.meta?.outstandingCheck) {
      return {
        message: `I'd be happy to chat about that later! First, ${session.meta.outstandingCheck}`,
        metadata: { type: 'general_with_check' }
      };
    }
    
    if (sessionPhase === 'learning') {
      return {
        message: `I'm here to help you learn ${session.topic}. If you want to continue, just ask a question or say "continue".`,
        metadata: { type: 'general_bridge' }
      };
    }
    
    // Default greeting for general messages outside learning phase
    return {
      message: "I'm here to help you learn! What topic would you like to explore?",
      metadata: { type: 'general_greeting' }
    };
  }
  
  // Fallback
  return {
    message: "I'm here to help you learn. What would you like to know?",
    metadata: { type: 'neutral_fallback' }
  };
};

module.exports = { handleNeutralMessage };


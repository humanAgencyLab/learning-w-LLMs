// LLM-based Intent Analyzer for Pre-Phase
// The LLM analyzes user messages and decides what action to take

const buildIntentAnalysisPrompt = (userMessage, sessionState) => {
  const { phase, messages, profile, meta } = sessionState;
  
  // Build conversation context (last 3 messages)
  const recentMessages = messages.slice(-3);
  const messageContext = recentMessages.length > 0
    ? recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n')
    : 'No previous messages';
  
  // Build profile context
  const profileContext = profile ? `
USER PROFILE CONTEXT:
- Name: ${profile.name || 'Student'}
- Skill Level: ${profile.skillLevel || 'Not specified'}
- Major/Background: ${profile.major || profile.background || 'Not specified'}
- Goals: ${profile.goals?.join(', ') || 'Not specified'}
- Learning Style: ${profile.preferredStyle || 'Not specified'}
` : 'No profile information available';
  
  // Build outstanding question context
  const outstandingCheck = meta?.outstandingCheck;
  const outstandingQuestionContext = outstandingCheck ? `
⚠️ OUTSTANDING QUESTION CONTEXT:
There is an outstanding question from the AI that the user may be responding to:
"${outstandingCheck}"

IMPORTANT: Check if the user's current message is responding to this outstanding question.
- If the user is answering or responding to the outstanding question → isFollowUpToOutstanding: true
- If the user is asking for help related to the outstanding question (e.g., "help me with installation" when outstanding question was about installation) → isFollowUpToOutstanding: true
- If the user is providing information related to the outstanding question → isFollowUpToOutstanding: true
- If the user's message is unrelated to the outstanding question → isFollowUpToOutstanding: false

Examples:
- Outstanding: "Have you installed Python?"
  - User: "No, I need help installing" → isFollowUpToOutstanding: true
  - User: "help me with installation" → isFollowUpToOutstanding: true
  - User: "yes I installed it" → isFollowUpToOutstanding: true
  - User: "What is Python?" → isFollowUpToOutstanding: false (unrelated)
  
- Outstanding: "What is the main advantage of using Python?"
  - User: "Python is easy to write" → isFollowUpToOutstanding: true
  - User: "I think it's readable" → isFollowUpToOutstanding: true
  - User: "I want to learn Java" → isFollowUpToOutstanding: false (unrelated)
` : '';

  return `You are an intelligent learning assistant analyzing user messages to determine the appropriate action.

CURRENT SESSION STATE:
- Phase: ${phase}
- Previous Messages: ${messageContext}
${profileContext}
${outstandingQuestionContext}

USER'S CURRENT MESSAGE: "${userMessage}"

YOUR TASK:
Analyze the user's message and determine:
1. What is their intent? (learning, greeting, general question, or unclear)
2. If learning intent, what topic do they want to learn?
3. What action should be taken?
4. Is the user responding to an outstanding question? (isFollowUpToOutstanding: true/false)

ANALYSIS RULES:
- LEARNING INTENT: User explicitly or implicitly wants to learn something new, study a topic, or get help with learning
  Examples: "I want to learn Python", "help me with data structures", "teach me piano", "I need to understand React", "piano", "data structure"
  - If learning intent detected → Action: "trigger_assessment"
  - Extract the topic from their message (even if vague, infer from context)
  
- GREETING: Simple greetings or casual conversation starters
  Examples: "Hello", "Hi", "Hey", "How are you"
  - If greeting → Action: "respond_naturally" with a friendly greeting
  
- GENERAL QUESTION: Questions about the system, capabilities, or unrelated topics
  Examples: "What can you do?", "How does this work?", "Tell me about yourself"
  - If general question → Action: "respond_helpfully" with a brief, helpful answer
  
- UNCLEAR: Message is ambiguous or unclear
  Examples: "ok", "maybe", "I don't know", very short messages
  - If unclear → Action: "ask_clarify" with a friendly question to understand their intent

IMPORTANT GUIDELINES:
- Be intelligent about context - "help me with data structure" is clearly learning intent, even if no explicit "learn" keyword
- Topic names alone (like "piano", "Python", "data structures") are learning intents
- Use the profile context to understand their background and infer intent
- If in doubt whether it's learning or general, lean towards learning intent
- NEVER ask clarification questions if the intent is clearly learning - just trigger assessment

RESPONSE FORMAT (JSON only):
{
  "intent": "learning" | "greeting" | "general" | "unclear",
  "action": "trigger_assessment" | "respond_naturally" | "respond_helpfully" | "ask_clarify",
  "topic": "extracted or inferred learning topic" (required if intent is "learning", empty string otherwise),
  "confidence": "high" | "medium" | "low",
  "isFollowUpToOutstanding": true/false (true if user is responding to outstanding question, false otherwise),
  "response": "If action is respond_naturally, respond_helpfully, or ask_clarify, provide a natural 1-2 sentence response here. Otherwise empty string."
}

Return ONLY valid JSON. No markdown, no code fences, no explanations outside the JSON.`;
};

module.exports = { buildIntentAnalysisPrompt };


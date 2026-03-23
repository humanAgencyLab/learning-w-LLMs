const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateIntent } = require('./validators/intentValidator');

const SYSTEM_PROMPT = `You are an intelligent learning assistant that classifies user intent.
Analyze the user message and return ONLY valid JSON with these fields:
- intent: one of "learning", "greeting", "general", "unclear"
- action: one of "trigger_assessment", "respond_naturally"
- topic: the learning topic extracted (string, non-empty if intent is "learning")
- confidence: "high" | "medium" | "low"
- response: a short, friendly response message (required for greeting/general/unclear intents)
- isFollowUpToOutstanding: boolean (true if message answers a previously asked question)

Rules:
- If the user states a topic they want to learn → intent="learning", action="trigger_assessment"
- Single words like "python", "javascript", "guitar" = learning (topic is that word)
- Phrases like "I want to learn X", "teach me X" = learning
- If the user says hello/hi/hey → intent="greeting", action="respond_naturally"
- If the message is ambiguous or off-topic → intent="unclear", action="respond_naturally"
- Never engage in chit-chat. Always steer toward learning.
- Return ONLY the JSON object.`;

function buildUserPrompt(userMessage, sessionContext) {
  const outstandingQ = sessionContext?.meta?.outstandingCheck;
  const recentMessages = (sessionContext?.messages || [])
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  return `USER MESSAGE: "${userMessage}"

RECENT CONTEXT:
${recentMessages || '(no prior messages)'}

${outstandingQ ? `OUTSTANDING QUESTION FROM ASSISTANT: "${outstandingQ}"` : ''}

Classify the intent and return JSON.`;
}

async function runIntentAgent({ session, userMessage }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) => {
      const errHint = prevErrors.length
        ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
        : '';
      return runAgent({
        taskName: 'intent',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(userMessage, session) + errHint,
        maxTokens: 300,
        temperature: 0.3,
      });
    },
    validateIntent,
    { agentName: 'IntentAgent' },
  );

  // Heuristic: message looks like a topic (run for both valid and !valid so we catch validation failures)
  const lower = (userMessage || '').toLowerCase().trim();

  const NON_TOPIC_RE = /^(hello|hi|hey|yo|sup|what|how|why|when|where|who|thanks|thank you|bye|goodbye|ok|okay|sure|yes|no|nah|nope|yep|yeah|help|please|sorry|good morning|good afternoon|good evening|good night)\b/i;
  if (NON_TOPIC_RE.test(lower) && !/learn|teach|study|about/i.test(lower)) {
    // Definitely not a topic – skip heuristic entirely
  } else {
    const matchLearn = /^i\s+(want\s+to\s+|wanna\s+|need\s+to\s+|'?d\s+like\s+to\s+)?learn\s+/i.test(lower);
    const matchTeach = /^teach\s+me\s+/i.test(lower);
    const matchStudy = /^(i\s+(want\s+to\s+|wanna\s+)?study|show\s+me|explain|help\s+me\s+(understand|learn|with))\s+/i.test(lower);
    const COMMON_TOPICS = [
      'python', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node',
      'java', 'kotlin', 'swift', 'rust', 'go', 'golang', 'ruby', 'php', 'sql',
      'html', 'css', 'c++', 'c#', 'c programming',
      'guitar', 'piano', 'violin', 'drums', 'music theory',
      'data structure', 'algorithm', 'machine learning', 'deep learning', 'ai',
      'web development', 'mobile development', 'devops', 'docker', 'kubernetes',
      'math', 'calculus', 'algebra', 'statistics', 'probability', 'linear algebra',
      'physics', 'chemistry', 'biology', 'economics', 'psychology',
      'photoshop', 'figma', 'design', 'ux', 'ui',
      'writing', 'essay', 'grammar', 'spanish', 'french', 'german', 'japanese',
      'cooking', 'baking', 'nutrition', 'fitness',
    ];
    const matchCommon = COMMON_TOPICS.some(t => lower.includes(t));
    const words = lower.split(/\s+/);
    const matchShort = words.length <= 3 && words.length >= 1 && !lower.includes('?') && !lower.includes('!') && !/^\d+$/.test(lower);

    const isTopicLike =
      lower.length > 1 &&
      lower.length < 120 &&
      (matchLearn || matchTeach || matchStudy || matchCommon || matchShort);

    if (isTopicLike) {
      return {
        type: 'intent',
        payload: {
          intent: 'learning',
          action: 'trigger_assessment',
          topic: userMessage.trim(),
          confidence: 'medium',
          response: '',
          isFollowUpToOutstanding: false,
        },
        uiMessage: '',
      };
    }
  }

  if (!valid) {
    return {
      type: 'intent',
      payload: {
        intent: 'unclear',
        action: 'respond_naturally',
        topic: '',
        confidence: 'low',
        response: "Hi! I'm here to help you learn. What would you like to learn about today?",
        isFollowUpToOutstanding: false,
      },
      uiMessage: "Hi! I'm here to help you learn. What would you like to learn about today?",
      debug: { fallback: true, errors },
    };
  }

  return {
    type: 'intent',
    payload: output,
    uiMessage: output.response || '',
  };
}

module.exports = { runIntentAgent };

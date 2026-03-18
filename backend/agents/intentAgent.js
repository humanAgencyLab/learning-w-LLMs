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

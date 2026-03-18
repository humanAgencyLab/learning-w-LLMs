const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_CONTEXT_TOKENS = 6000;
const KEEP_RECENT_TURNS = 8;

/**
 * Build a trimmed message array for LLM context.
 * If the session has a stored contextSummary AND total estimated tokens
 * exceed the budget, prepend the summary and keep only the last N turns.
 * Otherwise, return the full message history.
 *
 * This NEVER mutates session.messages.
 */
function buildContextForLLM(session, maxTokens = DEFAULT_MAX_CONTEXT_TOKENS) {
  const messages = session.messages || [];
  const summary = session.meta?.contextSummary;

  const estimatedTokens = messages.reduce(
    (sum, m) => sum + Math.ceil((m.content || '').length / APPROX_CHARS_PER_TOKEN),
    0,
  );

  if (estimatedTokens <= maxTokens || !summary) {
    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  const recentTurns = messages.slice(-KEEP_RECENT_TURNS);
  return [
    { role: 'system', content: `[Context summary of earlier conversation]\n${summary}` },
    ...recentTurns.map(m => ({ role: m.role, content: m.content })),
  ];
}

module.exports = { buildContextForLLM, KEEP_RECENT_TURNS, DEFAULT_MAX_CONTEXT_TOKENS };

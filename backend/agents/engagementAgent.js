const { runAgent } = require('./framework/baseAgent');

const SYSTEM_PROMPT = `You are a concise engagement assistant for a learning app.
Your job: optionally add a short, natural, non-repetitive motivation/appreciation/gamification line.

Return ONLY valid JSON with these fields:
- include: boolean
- prefix: string (0-140 chars) – shown before the main assistant message
- suffix: string (0-140 chars) – shown after the main assistant message

Rules (critical):
- Keep it to at most ONE short sentence total (either prefix OR suffix; not both unless both are very short).
- Do NOT restate the main message. Do NOT be verbose.
- Use the provided points/gems/progress ONLY if it naturally fits.
- Avoid repeating the same phrasing across turns. Prefer varied tone.
- If the user is confused/upset or asked for a direct answer, set include=false.
- No emojis except the 💎 gem symbol (allowed sparingly).
- No markdown headings, no bullet lists. Plain text only.`;

function buildUserPrompt({ session, baseMessage, context }) {
  const points = session?.points ?? 0;
  const gems = session?.gems ?? 0;
  const progressPct = session?.progressPct ?? 0;
  const phase = session?.phase || 'unknown';

  const recentAssistant = (session?.messages || [])
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => String(m.content || '').slice(0, 120))
    .join('\n- ');

  return `CONTEXT:
- phase: ${phase}
- action: ${context?.action || 'unknown'}
- milestoneCompleted: ${context?.milestoneCompleted ? 'true' : 'false'}
- moduleCompleted: ${context?.moduleCompleted ? 'true' : 'false'}
- points: ${points}/100
- gems: ${gems}
- progressPct: ${progressPct}

RECENT ASSISTANT (for anti-repetition):
- ${recentAssistant || '(none)'}

MAIN MESSAGE (do not restate):
${String(baseMessage || '').slice(0, 800)}

Generate optional engagement decoration.`;
}

async function runEngagementAgent({ session, baseMessage, context }) {
  try {
    const output = await runAgent({
      taskName: 'engagement',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({ session, baseMessage, context }),
      maxTokens: 220,
      temperature: 0.6,
    });

    const include = output?.include === true;
    const prefix = typeof output?.prefix === 'string' ? output.prefix.trim() : '';
    const suffix = typeof output?.suffix === 'string' ? output.suffix.trim() : '';

    // Safety clamps
    const clamp = (s) => (s.length > 140 ? s.slice(0, 140) : s);
    const safe = {
      include,
      prefix: clamp(prefix),
      suffix: clamp(suffix),
    };

    // Enforce "at most one sentence total" by preferring prefix.
    if (safe.include) {
      if (safe.prefix && safe.suffix) safe.suffix = '';
      if (!safe.prefix && !safe.suffix) safe.include = false;
    }

    return { type: 'engagement', payload: safe };
  } catch (err) {
    console.error('[EngagementAgent] Failed, returning empty', err.message);
    return { type: 'engagement', payload: { include: false, prefix: '', suffix: '' } };
  }
}

module.exports = { runEngagementAgent };


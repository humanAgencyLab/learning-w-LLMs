const { runAgent } = require('./framework/baseAgent');

const SYSTEM_PROMPT = `You are an intelligent learning conversation manager. Analyze the conversation state and decide the next action.

Return ONLY valid JSON with these fields:
- intent: "answering_question" | "asking_for_help" | "learning" | "requesting_quiz" | "general"
- action: "teach" | "assess" | "clarify" | "start_quiz" | "respond_naturally" | "provide_guidance"
- isFollowUpToOutstanding: boolean (true if user is answering a previously asked question)
- shouldAskQuestion: boolean
- questionToAsk: string (if shouldAskQuestion is true)
- shouldStartQuiz: boolean
- markMilestoneComplete: boolean
- moveToNextMilestone: boolean
- phaseChange: null | "learning" | "quizzing" | "feedback"
- response: a brief fallback response (used only if no teaching content is generated)

Rules:
- If there's an outstanding question and the user responds → action="assess", isFollowUpToOutstanding=true
- If the user asks for help/clarification → action="clarify"
- If all milestones are done → action="start_quiz", shouldStartQuiz=true
- Never skip milestone assessment; always verify understanding before moving forward
- ⚠️ Learning phase (course or approved plan): If phase is "learning" and there is NO outstanding question, you MUST use action="teach" (not "respond_naturally"). The student needs full milestone teaching + exactly one question — never only a short greeting or a bare question without teaching content.
- ⚠️ Do NOT use "respond_naturally" or "provide_guidance" when a milestone is waiting to be taught (no outstandingCheck). Use "teach" first.`;

function buildUserPrompt(session, userMessage) {
  const activeModule = session.plan?.find(m => m.id === session.activeModuleId);
  const milestoneIdx = session.meta?.currentMilestoneIndex ?? 0;
  const milestone = activeModule?.milestones?.[milestoneIdx];
  const outstanding = session.meta?.outstandingCheck;
  const isMilestoneInProgress = session.meta?.milestoneBeingTaught;

  const recentMessages = (session.messages || [])
    .slice(-6)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  return `SESSION STATE:
- Phase: ${session.phase}
- Module: ${activeModule?.title || 'none'} (milestone ${milestoneIdx + 1}/${activeModule?.milestones?.length || 0})
- Current milestone: "${milestone?.text || 'none'}"
- Milestone completed: ${milestone?.completed || false}
- Milestone teaching in progress: ${isMilestoneInProgress || false}
- Outstanding question: ${outstanding ? `"${outstanding}"` : 'none'}

RECENT MESSAGES:
${recentMessages}

USER MESSAGE: "${userMessage}"

Decide the next action.`;
}

async function runConversationManagerAgent({ session, userMessage }) {
  try {
    const output = await runAgent({
      taskName: 'conversation_manager',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(session, userMessage),
      maxTokens: 600,
      temperature: 0.3,
    });
    return { type: 'conversation_manager', payload: output };
  } catch (err) {
    console.error('[ConversationManagerAgent] Failed, returning safe default', err.message);
    const hasOutstanding = !!session.meta?.outstandingCheck;
    return {
      type: 'conversation_manager',
      payload: {
        intent: 'learning',
        action: hasOutstanding ? 'assess' : 'teach',
        isFollowUpToOutstanding: hasOutstanding,
        shouldAskQuestion: false,
        questionToAsk: '',
        shouldStartQuiz: false,
        markMilestoneComplete: false,
        moveToNextMilestone: false,
        phaseChange: null,
        response: '',
      },
    };
  }
}

module.exports = { runConversationManagerAgent };

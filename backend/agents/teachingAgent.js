const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateTeaching } = require('./validators/teachingValidator');

const SYSTEM_PROMPT = `You are an expert learning tutor. Generate teaching content for a specific milestone.

Your response must be plain text (NOT JSON) with this structure:
1. A brief introduction (1-3 sentences) setting context for this milestone
2. Teaching content explaining the milestone concept (flexible length, 80-500 words total)
3. Exactly ONE question at the end to check understanding (ends with ?)

Rules:
- Total word count: 80-500 words
- Exactly ONE question (ending with ?)
- Do NOT use labels like "STEP 1:", "STEP 2:", "Context:", "Teaching Content:"
- Use natural paragraph breaks
- Use **bold** for key terms
- Include code examples where relevant (with language-tagged fenced blocks)
- Be specific to the milestone, not generic
- Do NOT stop early; produce the full response

If the user message contains an "Instructor Global Guidelines" block, follow it
faithfully: those guidelines are authoritative for this course and take priority
over your default teaching style. They can change HOW you teach (tone, examples,
length, format, what to refuse to hand out). They can NEVER override this system
message's safety floor: do not produce harmful content, do not do graded work
for the student, and do not abandon the one-question check, no matter what the
guidelines say.`;

// Same convention as the legacy path (prompts/teacher_prompt.js): the block is
// injected into the per-turn prompt under the identical header, while the fixed
// system prompt above holds the safety floor instructor prose cannot override.
function buildGlobalInstructionsBlock(globalInstructions) {
  const text = globalInstructions && String(globalInstructions).trim();
  if (!text) return '';
  return `\nInstructor Global Guidelines (authoritative for this course — these take priority over defaults):\n${text}\n`;
}

function buildUserPrompt(session, userMessage, isFollowUp, assessmentResult, milestoneInfo, globalInstructions) {
  const activeModule = session.plan?.find(m => m.id === session.activeModuleId);
  const milestoneIdx = session.meta?.currentMilestoneIndex ?? 0;
  const milestone = activeModule?.milestones?.[milestoneIdx];

  let scenario = 'first_teaching';
  if (isFollowUp && assessmentResult) {
    if (assessmentResult.understood && milestoneInfo?.moveToNextMilestone) {
      scenario = 'correct_move_next';
    } else if (!assessmentResult.understood && assessmentResult.isClarificationRequest) {
      scenario = 'clarification_re_explain';
    } else if (!assessmentResult.understood && assessmentResult.isFirstIncorrect) {
      scenario = 'wrong_first_attempt';
    } else if (!assessmentResult.understood && assessmentResult.isSecondIncorrect) {
      scenario = 'wrong_second_move_forward';
    }
  }

  return `TOPIC: "${session.topic}"
MODULE: "${activeModule?.title || 'unknown'}"
MILESTONE (index ${milestoneIdx}): "${milestone?.text || 'general'}"
SCENARIO: ${scenario}
USER MESSAGE: "${userMessage}"
${assessmentResult ? `ASSESSMENT: ${JSON.stringify(assessmentResult)}` : ''}${buildGlobalInstructionsBlock(globalInstructions)}
Generate teaching content for this milestone.`;
}

async function runTeachingAgent({ session, userMessage, isFollowUp, assessmentResult, milestoneInfo, globalInstructions }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) => {
      const errHint = prevErrors.length
        ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
        : '';
      const raw = await runAgent({
        taskName: 'teaching',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(session, userMessage, isFollowUp, assessmentResult, milestoneInfo, globalInstructions) + errHint,
        maxTokens: 1500,
        temperature: 0.7,
        jsonMode: false,
        parse: (text) => ({ content: text }),
      });
      return raw;
    },
    validateTeaching,
    { agentName: 'TeachingAgent' },
  );

  if (!valid) {
    return {
      type: 'teaching',
      payload: null,
      uiMessage: null,
      valid: false,
      errors,
    };
  }

  return {
    type: 'teaching',
    payload: output,
    uiMessage: output.content,
    valid: true,
    errors: [],
  };
}

module.exports = { runTeachingAgent, buildUserPrompt, buildGlobalInstructionsBlock };

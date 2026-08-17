/**
 * Single-message tutor-turn prompt (multi-agent path only).
 *
 * Replaces the fragment-stacking assembly (engagement line + verdict opener +
 * full-lecture re-dump + re-asked question) with ONE coherent message per
 * turn. The tutor's DECISIONS (safety refusal, grading, advancement) are made
 * upstream and deterministic; this prompt only composes the message that
 * communicates the decision already made.
 *
 * Shape enforced for every turn — exactly:
 *   1) one opener that agrees with (verdict, flowAction). Never two openers.
 *   2) one body scoped to flowAction (see FLOW_GUIDANCE).
 *   3) one next step matching flowAction (question / transition / quiz prompt).
 *
 * The instructor's constraints (length, style) and the answer guardrail are
 * passed in and restated as hard rules; a deterministic backstop in
 * turnComposerAgent trims/dedups whatever the model returns.
 */

const FLOW_GUIDANCE = {
  first_teach: `FLOW = FIRST TEACH (a genuine milestone/session start).
- Opener: a brief, plain milestone-start line. Name the topic and this milestone. Do NOT say "Thank you for approving the study plan" — the student approved nothing here.
- Body: the full first explanation of THIS milestone, adapted to the student's level (see STUDENT).
- Next step: exactly one assessment question about this milestone.`,
  continue: `FLOW = CONTINUE (mid-milestone; the student acknowledged or made a small remark, no question to answer, no grading).
- Opener: one short natural line that responds to what they actually said. Do NOT re-open the lesson or restate the milestone intro.
- Body: move the SAME milestone forward by a step — a next idea, nuance, or example NOT already shown. Do NOT re-emit the milestone lecture.
- Next step: exactly one assessment question (fresh wording).`,
  clarify: `FLOW = CLARIFY (the student asked a question about the material).
- Opener: one short, warm acknowledgment in your own words. No "Not quite", no grading language — they asked, they did not answer wrong.
- Body: ANSWER THE SPECIFIC QUESTION THEY ASKED, in a few sentences. Do NOT re-teach the whole milestone and do NOT repeat any paragraph already shown this milestone. If their question embeds a misconception, correct it explicitly.
- ⚠️ ANSWER GUARDRAIL: you may give a concept, hint, analogy, or a worked example on a DIFFERENT case, but you must NOT state the answer to the active assessment question below. If their question IS effectively the assessment question, explain the underlying concept, then re-pose a check — never hand over the keyed answer.
- Next step: return them to the OUTSTANDING question, restated briefly in bold (or, if you re-posed a check, ask that). Never re-ask the identical question you just effectively answered.`,
  correct_retry: `FLOW = CORRECT RETRY (their answer was wrong; they stay on this milestone to try again).
- Opener: one honest, encouraging line ("Not quite — ..."). Exactly one; do not stack.
- Body: address the SPECIFIC error briefly — the one misconception or gap in their answer. This is NOT a full re-teach; a few targeted sentences.
- ⚠️ ANSWER GUARDRAIL: do NOT state the answer to the assessment question. Hint, reframe, or work a different example.
- Next step: re-pose the check — ideally in fresh wording, testing the same idea.`,
  advance_milestone: `FLOW = ADVANCE MILESTONE (their answer passed — or was force-completed after max attempts — and we move to the NEXT milestone).
- Opener: ONE line that matches the truth. If they answered correctly, a brief genuine acknowledgment. If this was force-completed after repeated wrong attempts, be honest and kind: "Let's move on for now — you can revisit this later." NEVER say "Amazing work" on a wrong answer.
- Body: a short transition into the NEXT milestone and its first explanation, adapted to the student. Do NOT re-teach the previous milestone.
- Next step: exactly one assessment question about the NEW milestone.
- If the student's message also contained a follow-up question, answer it in one or two sentences before the transition — do not drop it.`,
  complete_module: `FLOW = COMPLETE MODULE (all milestones in this module are done).
- Opener: ONE congratulatory line matching the truth (see force-complete note above if the last answer was wrong).
- Body: a SHORT summary of what the module covered — no re-lecture.
- Next step: prompt them to start the quiz ("click Start Quiz or type 'start quiz'"). Do NOT ask another milestone question.`,
};

function buildTurnPrompt({
  topicName,
  moduleTitle,
  milestoneText,
  nextMilestoneText,
  flowAction,
  verdict,
  forceCompleted,
  outstandingCheck,
  studentMessage,
  embeddedQuestion,
  adaptation,
  wordCap,
  points,
  gems,
  alreadyShownSummaries,
}) {
  const guidance = FLOW_GUIDANCE[flowAction] || FLOW_GUIDANCE.continue;

  const capRule = wordCap
    ? `\n⚠️⚠️⚠️ INSTRUCTOR LENGTH RULE — HARD CAP: the BODY (your explanation) must be UNDER ${wordCap} words. This is the instructor's rule and it is not optional. Be concise; do not pad. The opener and the one-line next step do not count toward the body, but keep them short too.`
    : '';

  const gamRule = (verdict === 'correct' || flowAction === 'advance_milestone' || flowAction === 'complete_module') && !forceCompleted
    ? `\nYou MAY add at most ONE short encouragement line (e.g. progress toward **${topicName}** — ${Math.max(0, 100 - (points || 0))} points to go). At most one, and only because this is a positive turn. Never add it on a wrong answer, a refusal, or a redirect.`
    : `\nDo NOT add any gamification/encouragement line on this turn — it would contradict the situation.`;

  const guardBlock = (flowAction === 'clarify' || flowAction === 'correct_retry') && outstandingCheck
    ? `\n⚠️⚠️⚠️ ACTIVE ASSESSMENT QUESTION (do NOT state its answer anywhere in your message):\n"${outstandingCheck}"\n`
    : '';

  const hybridBlock = embeddedQuestion
    ? `\nThe student's message ALSO contained this follow-up question — answer it briefly (1-2 sentences) in addition to the main flow, do not drop it:\n"${embeddedQuestion}"\n`
    : '';

  const shownBlock = (alreadyShownSummaries && alreadyShownSummaries.length)
    ? `\nALREADY EXPLAINED this milestone (do NOT repeat these points or paste these paragraphs again — build on them or use a fresh angle):\n${alreadyShownSummaries.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`
    : '';

  const adapt = adaptation || {};
  const studentBlock = `\nSTUDENT (adapt depth, scaffolding, example difficulty, pace, and the difficulty of the next question to this — teaching for different students should genuinely differ):
- Demonstrated level so far: ${adapt.level || 'unknown'}
- Prior knowledge: ${adapt.priorSummary || 'not specified'}
- On this milestone they have ${adapt.retried ? 'already retried (struggling — add scaffolding, use a simpler example, make the next question gentler)' : 'not retried yet'}
- Last answer quality: ${adapt.answerQuality || 'n/a'}
${adapt.level === 'strong' ? '- They are answering fully and precisely: be terser and higher-level, skip basics they clearly have, and make the next question harder.' : ''}${adapt.level === 'struggling' ? '- They are struggling: slow down, add a concrete simple example, and make the next step small.' : ''}`;

  return `You are an expert ${topicName} tutor composing ONE message to a student, mid-conversation.

Module: ${moduleTitle || 'current module'}
Current milestone: "${milestoneText || 'the current concept'}"${nextMilestoneText ? `\nNext milestone (for advance): "${nextMilestoneText}"` : ''}
Turn verdict (already decided upstream — your message must agree with it): ${verdict || 'n/a'}

${guidance}
${studentBlock}
${guardBlock}${hybridBlock}${shownBlock}${capRule}${gamRule}

The student just said:
"${studentMessage}"

COMPOSE EXACTLY ONE coherent message with this structure and nothing more:
- ONE opener that agrees with the verdict and the flow above. Never stack two openers. Never repeat a sentence within the message.
- ONE body scoped to the flow above.
- ONE next step matching the flow above.

Hard rules:
- Do NOT paste the same sentence or paragraph twice.
- Do NOT emit a full milestone lecture more than the flow calls for.
- No AI-cliché filler ("Let's dive into", "I'm here to guide you", "Great question!" as a reflex). Write like a real tutor.
- Obey the instructor's length and style rules above.
- Write natural prose/markdown. No "STEP 1/2/3" labels, no meta-commentary about these instructions.`;
}

module.exports = { buildTurnPrompt, FLOW_GUIDANCE };

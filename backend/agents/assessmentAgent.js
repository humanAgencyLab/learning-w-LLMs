const { runAgent } = require('./framework/baseAgent');
const { runWithValidation } = require('./framework/validator');
const { validateAssessment, repairAssessment } = require('./validators/assessmentValidator');

const SYSTEM_PROMPT = `You are an expert educational assessment AI. Evaluate whether a student's answer demonstrates understanding of a milestone.

Return ONLY valid JSON with these fields:
- responseType: "clarification_request" | "wrong_answer" | "correct_answer" | "incomplete_answer"
- understood: boolean (true if student demonstrated understanding)
- confidence: "high" | "medium" | "low"
- recommendation: "move_forward" | "clarify_again" | "move_forward_anyway"
- reasoning: brief explanation of your assessment (1-2 sentences)

RULE 0 - SUBSTANCE BEFORE KEYWORDS (apply before everything else):
Decide FIRST whether the response contains a substantive attempt at the question
— a claim, definition, example, code snippet, comparison, or piece of reasoning.
If it does, classify on that substance (correct_answer / incomplete_answer /
wrong_answer) EVEN IF the student also asks a follow-up question or hedges.
Only use clarification_request when there is NO substantive attempt at all.
A question mark, or words like "what is" / "how do I" / "explain", never by
themselves make a response a clarification request.

RULE 1 - CHECK CORRECTNESS, NOT PLAUSIBILITY (before any correct verdict):
A fluent, confident answer is NOT a correct answer. Before marking
correct_answer or incomplete_answer, explicitly verify the answer against what
the question actually asked for. For answers containing CODE, TRACE the code:
- Does it terminate correctly? An empty or always-true loop condition is an
  infinite loop and is WRONG no matter how clean the code looks.
- Is each clause in the right place? A test sitting in a for-loop INITIALIZER
  or update clause does not guard the loop; the condition slot is what runs
  each iteration.
- Check off-by-one bounds, inverted/wrong comparison operators, and missing
  reads/updates the question requires.
- If the student's PROSE claims something the CODE does not do ("the condition
  checks for non-negative" while the condition slot is empty), the code wins:
  the answer is wrong_answer, and say exactly where prose and code disagree.

RULE 2 - TRUNCATED OR UNFINISHED ANSWERS ARE NOT COMPLETE:
If the answer ends mid-sentence or mid-word, has unbalanced braces/parentheses
in its code, or is missing a part the question explicitly requested, it is NOT
done → wrong_answer (understood=false) with a defect asking them to finish the
missing part. incomplete_answer is ONLY for answers that are complete thoughts
— brief but correct — never for cut-off text.

RULE 3 - DO NOT OVER-CORRECT:
A valid answer that differs stylistically from the expected one (different
variable names, formatting, an equivalent construct, a different-but-valid
example) is still CORRECT. Only genuine correctness or completeness failures
may fail an answer. Judge the concept and the behavior of the code, not style.

Classification rules:
- Pure request for help with no attempt ("I don't know", "can you explain", "I'm confused") → clarification_request (understood=false)
- Incorrect, broken, or unfinished attempted answer → wrong_answer (understood=false)
- Correct answer → correct_answer (understood=true, recommendation=move_forward)
- Correct but brief (a complete thought, just short) → incomplete_answer (understood=true, recommendation=move_forward)
- Correct answer PLUS a follow-up question → correct_answer or incomplete_answer (understood=true), NEVER clarification_request
- Correct demonstration of the concept using a different but valid example than
  the question named → incomplete_answer (understood=true), not wrong_answer.
  Judge the concept, not whether the exact values from the question were reused.
- Judge correctness in the language and subject of the course topic given below.

When responseType is wrong_answer, also set:
- defect: ONE sentence naming the SPECIFIC defect and its exact clause/line/part
  (e.g. "the for-loop's condition slot is empty so it never terminates; the
  n>=0 test sits in the initializer where it runs only once"). Do NOT include
  the corrected solution. null for other responseTypes.

CRITICAL: clarification_request must NEVER increment retry count.
CRITICAL: correct_answer and incomplete_answer must ALWAYS set understood=true.`;

function buildUserPrompt(question, answer, milestone, retryCount, prevErrors, topicTitle) {
  const errHint = prevErrors?.length
    ? `\n\nPrevious attempt had errors: ${prevErrors.join('; ')}. Fix them.`
    : '';
  const topicLine = topicTitle
    ? `COURSE TOPIC (the subject and language to judge this answer in): "${topicTitle}"\n\n`
    : '';

  return `${topicLine}QUESTION ASKED: "${question}"

STUDENT'S ANSWER: "${answer}"

MILESTONE BEING ASSESSED: "${milestone?.text || 'general understanding'}"

RETRY COUNT: ${retryCount} (if ≥1, the student already answered incorrectly once)

Evaluate the student's answer.${errHint}`;
}

async function runAssessmentAgent({ question, answer, milestone, retryCount = 0, topicTitle = '' }) {
  const { output, valid, errors } = await runWithValidation(
    async (prevErrors) =>
      repairAssessment(await runAgent({
        taskName: 'assessment',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(question, answer, milestone, retryCount, prevErrors, topicTitle),
        maxTokens: 400,
        temperature: 0.3,
      })),
    validateAssessment,
    { agentName: 'AssessmentAgent' },
  );

  if (!valid) {
    // Fail OPEN, not closed. The old fallback was `wrong_answer`, which made
    // every timeout, parse slip, or schema miss cost the student a retry and
    // record a failed MilestoneAttempt — polluting the LOW PASS RATE analytic
    // with grader infrastructure failures. clarification_request is the
    // neutral outcome: it re-teaches without penalising anyone, and never
    // increments the retry count.
    return {
      type: 'assessment',
      payload: {
        responseType: 'clarification_request',
        understood: false,
        confidence: 'low',
        recommendation: 'clarify_again',
        reasoning: 'Assessment unavailable; re-teaching without penalising the student.',
      },
      valid: false,
      errors,
    };
  }

  return { type: 'assessment', payload: output, valid: true, errors: [] };
}

// --- dedicated code-correctness check (2026-08 grading fix) -----------------

/** Does the answer contain code worth tracing? Conservative cues. */
function looksLikeCode(answer) {
  const a = String(answer || '');
  return /```/.test(a)
    || /\b(?:for|while|if|switch)\s*\(/.test(a)
    || /[{};]\s*$/m.test(a)
    || /\b(?:scanf|printf|System\.out|console\.log|def |return |int |void )\b/.test(a)
    || /=>|\+\+|--|&&|\|\|/.test(a);
}

/**
 * Deterministic truncation cue: unbalanced braces/parens across the answer's
 * code-looking lines. High precision — prose parentheticals are balanced too,
 * so we count over the whole answer and only flag clear imbalance.
 */
function unbalancedCode(answer) {
  const a = String(answer || '');
  if (!looksLikeCode(a)) return false;
  let brace = 0; let paren = 0;
  for (const ch of a) {
    if (ch === '{') brace++; else if (ch === '}') brace--;
    else if (ch === '(') paren++; else if (ch === ')') paren--;
  }
  return brace !== 0 || paren !== 0;
}

const CODE_CHECK_SYSTEM_PROMPT = `You are a strict code-correctness checker for a programming tutor. You receive a QUESTION and a STUDENT ANSWER that contains code. The main grader believes the answer is correct — your ONLY job is to verify that by TRACING the code. You are the last line of defense against "well done" on broken code.

Trace explicitly:
1. Termination: does every loop terminate as the question requires? An EMPTY for-loop condition slot means the condition is always true — infinite loop.
2. Clause placement: initializer runs once; condition guards every iteration; update runs after each iteration. A test written in the initializer or update slot does NOT guard the loop.
3. Off-by-one bounds, inverted or wrong operators, missing required reads/updates/outputs.
4. Prose-vs-code contradiction: if the student's prose claims behavior the code does not implement, the code wins and the answer is broken.
5. Truncation: unbalanced braces/parentheses or code that stops mid-construct is incomplete.

DO NOT flag style: different variable names, formatting, comments, or an equivalent valid construct are all CORRECT. Only genuine correctness or completeness failures count.

Return ONLY valid JSON:
{"sound": boolean, "verdict": "correct" | "broken" | "incomplete", "defect": "<one sentence naming the specific defect and the exact clause/line — no corrected code>" | null}
sound=true with verdict "correct" when the code actually does what the question asked.`;

/**
 * Demotion-only gate: called AFTER the main grade, ONLY when the grader is
 * about to pass an answer containing code. It can turn a pass into a retry —
 * never the reverse — so a checker outage can never inflate a grade (fail
 * open: on error, the original pass stands and we log).
 */
async function runCodeCheck({ question, answer, milestone, topicTitle }) {
  try {
    const out = await runAgent({
      taskName: 'code_check',
      systemPrompt: CODE_CHECK_SYSTEM_PROMPT,
      userPrompt: `COURSE TOPIC: "${topicTitle || 'programming'}"\nMILESTONE: "${milestone?.text || ''}"\n\nQUESTION ASKED: "${question}"\n\nSTUDENT ANSWER (trace the code):\n${String(answer).slice(0, 2000)}`,
      maxTokens: 900,
      temperature: 0,
      reasoningEffort: 'medium',
      timeoutMs: 20000,
    });
    if (typeof out?.sound === 'boolean') {
      return { sound: out.sound, verdict: out.verdict || (out.sound ? 'correct' : 'broken'), defect: out.defect || null };
    }
    console.warn('[codeCheck] malformed checker output — keeping the original pass', { sample: JSON.stringify(out).slice(0, 120) });
    return { sound: true, verdict: 'correct', defect: null };
  } catch (e) {
    console.warn('[codeCheck] checker failed — keeping the original pass', { error: e.message });
    return { sound: true, verdict: 'correct', defect: null };
  }
}

module.exports = { runAssessmentAgent, runCodeCheck, looksLikeCode, unbalancedCode };

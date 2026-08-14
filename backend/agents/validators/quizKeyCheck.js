const { runAgent } = require('../framework/baseAgent');

/**
 * Exactly-one-correct key check for generated MCQs.
 *
 * Structural validation cannot catch a semantically broken item: Q2 of a live
 * quiz offered Hardware / Software / Personnel / "All of these" — four
 * defensible answers on a single-select item — and the model's key pointed at
 * one of them, so a student picking any other true option was graded wrong.
 * The grader itself is a strict index match and stays that way (by decision);
 * the fix is to reject such items BEFORE they reach a student.
 *
 * This pass asks a second, colder model call to mark, per question, every
 * option a well-prepared student could defend as correct. A question passes
 * only if that set is exactly { the keyed option }. Failures produce readable
 * errors that the generation retry loop feeds back to the generator.
 *
 * FAIL-OPEN on checker errors (timeout, malformed output): a quiz the checker
 * could not audit is delivered rather than blocking the student — the checker
 * is a quality gate, not an availability dependency. Callers get
 * { checked: false } so they can log the skip loudly.
 */

const CHECK_SYSTEM = `You are a strict quiz auditor. For each multiple-choice question you receive, decide which options a well-prepared student could defend as a correct answer to the question AS WRITTEN.

Judge each option on its own merits against the question text. Ignore which option the quiz author keyed as correct — you are auditing the key, not trusting it. An option is "defensible" if a knowledgeable student choosing it would be factually right about the question as asked (e.g. for "Which of the following is a type of AI cost?" every option that IS a type of AI cost is defensible).

Return ONLY valid JSON:
{"results":[{"id":"q1","defensibleIndices":[0]}, ...]}

defensibleIndices are 0-based option indices. Include every question you were given, in order.`;

function buildCheckPrompt(questions) {
  const lines = questions.map((q) => {
    const opts = (q.options || []).map((o, i) => `    ${i}: ${o}`).join('\n');
    return `id ${q.id}: ${q.text}\n${opts}`;
  });
  return `Audit these ${questions.length} questions:\n\n${lines.join('\n\n')}`;
}

/**
 * @param {Array<{id:string,text:string,options:string[],correctIndex:number}>} questions
 * @returns {Promise<{valid:boolean, checked:boolean, errors:string[]}>}
 */
async function checkQuizKeys(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { valid: true, checked: false, errors: [] };
  }
  let out;
  try {
    out = await runAgent({
      taskName: 'quiz',
      systemPrompt: CHECK_SYSTEM,
      userPrompt: buildCheckPrompt(questions),
      maxTokens: 900,
      temperature: 0,
    });
  } catch (err) {
    console.warn('[quizKeyCheck] checker call failed — delivering unaudited quiz', { error: err.message });
    return { valid: true, checked: false, errors: [] };
  }

  const results = Array.isArray(out?.results) ? out.results : null;
  if (!results) {
    console.warn('[quizKeyCheck] checker returned unusable output — delivering unaudited quiz');
    return { valid: true, checked: false, errors: [] };
  }

  const byId = new Map(results.map((r) => [String(r.id), r]));
  const errors = [];
  for (const q of questions) {
    const r = byId.get(String(q.id));
    const defensible = Array.isArray(r?.defensibleIndices)
      ? [...new Set(r.defensibleIndices.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 3))]
      : null;
    if (!defensible) continue; // checker skipped this item; don't invent a verdict
    if (defensible.length > 1) {
      errors.push(
        `question ${q.id} ("${String(q.text).slice(0, 80)}"): options ${defensible.join(', ')} are all defensibly correct — rewrite so exactly ONE option is true and the others are clearly wrong`
      );
    } else if (defensible.length === 1 && defensible[0] !== q.correctIndex) {
      errors.push(
        `question ${q.id} ("${String(q.text).slice(0, 80)}"): the keyed answer (index ${q.correctIndex}) is not the defensible one (index ${defensible[0]}) — fix the key or the options`
      );
    } else if (defensible.length === 0) {
      errors.push(
        `question ${q.id} ("${String(q.text).slice(0, 80)}"): no option is defensibly correct — rewrite the question`
      );
    }
  }

  return { valid: errors.length === 0, checked: true, errors };
}

module.exports = { checkQuizKeys };

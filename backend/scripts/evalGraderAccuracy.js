/**
 * Grader accuracy harness (pilot finding P5: correct answers graded "Not quite").
 *
 * Runs the SHIPPED grader over a fixture of real demo-cohort exchanges and
 * scores it against researcher labels. Each case runs N times because the
 * grader is an LLM at temperature > 0 and the pilot specifically observed
 * nondeterminism, so stability is reported alongside accuracy.
 *
 *   node scripts/evalGraderAccuracy.js [--runs 3] [--path legacy|agent] [--out file.json]
 *
 * Requires GROQ_API_KEY (read from backend/.env like the app does).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getGroqClient } = require('../lib/llmClient');
const { buildAssessmentAnalysisPrompt } = require('../prompts/assessment_analyzer');
const { runAssessmentAgent } = require('../agents/assessmentAgent');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const RUNS = parseInt(arg('runs', '3'), 10);
const PATHNAME = arg('path', 'legacy');
const OUT = arg('out', null);
const CONCURRENCY = 6;

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../tests/fixtures/graderEvalSet.json'), 'utf8')
);

/** responseType -> the three-way outcome the student actually experiences. */
function outcomeOf(responseType) {
  if (responseType === 'correct_answer' || responseType === 'incomplete_answer') return 'correct';
  if (responseType === 'clarification_request') return 'clarification';
  return 'wrong';
}

async function gradeLegacy(c) {
  const client = getGroqClient();
  const prompt = buildAssessmentAnalysisPrompt(
    c.question,
    c.answer,
    { text: c.milestone },
    0,
    { topicTitle: c.topic }
  );
  const resp = await client.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are an expert educational assessment AI. Return ONLY valid JSON matching the schema. No prose, no markdown blocks, no explanations outside the JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 400,
    response_format: { type: 'json_object' },
  });
  let data;
  try {
    data = JSON.parse(resp.choices[0].message.content.trim());
  } catch {
    return { outcome: 'wrong', raw: 'PARSE_FAILURE' }; // shipped fail-closed default
  }
  const valid = ['clarification_request', 'wrong_answer', 'correct_answer', 'incomplete_answer'];
  const rt = valid.includes(data.responseType) ? data.responseType : 'wrong_answer';
  return { outcome: outcomeOf(rt), raw: data.responseType, confidence: data.confidence };
}

async function gradeAgent(c) {
  const r = await runAssessmentAgent({
    question: c.question,
    answer: c.answer,
    milestone: { text: c.milestone },
    retryCount: 0,
    topicTitle: c.topic,
  });
  return { outcome: outcomeOf(r.payload.responseType), raw: r.payload.responseType, valid: r.valid };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

(async () => {
  const grade = PATHNAME === 'agent' ? gradeAgent : gradeLegacy;
  const jobs = [];
  for (const c of FIXTURE.cases) for (let r = 0; r < RUNS; r++) jobs.push({ c, r });

  const results = await mapLimit(jobs, CONCURRENCY, async ({ c }) => {
    try {
      return { id: c.id, ...(await grade(c)) };
    } catch (e) {
      return { id: c.id, outcome: 'wrong', raw: `ERROR:${e.message.slice(0, 60)}` };
    }
  });

  const byCase = new Map();
  for (const r of results) {
    if (!byCase.has(r.id)) byCase.set(r.id, []);
    byCase.get(r.id).push(r);
  }

  let correctVerdicts = 0;
  let total = 0;
  let unstable = 0;
  const confusion = {};
  const misses = [];
  for (const c of FIXTURE.cases) {
    const runs = byCase.get(c.id) || [];
    const outcomes = runs.map((r) => r.outcome);
    if (new Set(outcomes).size > 1) unstable += 1;
    for (const o of outcomes) {
      total += 1;
      if (o === c.label) correctVerdicts += 1;
      const key = `${c.label} -> ${o}`;
      confusion[key] = (confusion[key] || 0) + 1;
    }
    // majority outcome for the per-case miss list
    const tally = {};
    outcomes.forEach((o) => { tally[o] = (tally[o] || 0) + 1; });
    const majority = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (majority !== c.label) {
      misses.push({ id: c.id, student: c.student, label: c.label, got: majority, outcomes: outcomes.join('/'), q: c.question.slice(0, 70) });
    }
  }

  const summary = {
    path: PATHNAME,
    runsPerCase: RUNS,
    cases: FIXTURE.cases.length,
    verdicts: total,
    accuracy: +((correctVerdicts / total) * 100).toFixed(1),
    unstableCases: unstable,
    confusion,
    missesByMajority: misses,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

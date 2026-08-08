'use strict';

/**
 * Single-shot briefing agent used by the instructor dashboard / course page /
 * insights page. Unlike `instructorInsightsAgent.js` (a tool-using chat agent),
 * this one takes pre-fetched analytics, runs ONE Groq call with a strict JSON
 * output contract, and returns a structured blob the React components render
 * as-is.
 *
 * Three entry points:
 *   runBriefing(overview)           -> { briefing }
 *   runHotSignal(courseStats)       -> { hotSignal }
 *   runInsightCards(courseStats)    -> { insightCards: [{id,title,body,chartRef}] }
 *
 * The agent is grounded: every number it mentions must come from the data we
 * pass in (same rule as the chat agent's system prompt). We log the full input
 * + output once per call so a professor who challenges a claim can be walked
 * back to the source.
 */

const { runAgent } = require('./framework/baseAgent');

const CHART_REFS = ['tree', 'milestones', 'heatmap', 'atRisk', 'none'];

// ---------- helpers ---------------------------------------------------------

function truncate(str, n) {
  if (typeof str !== 'string') return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

function safeLog(label, payload) {
  try {
    const s = JSON.stringify(payload);
    console.log(`[instructorBriefing] ${label}: ${s.length > 600 ? `${s.slice(0, 600)}…` : s}`);
  } catch {
    /* non-fatal */
  }
}

function normalizeChartRef(ref) {
  if (!ref) return 'none';
  const lowered = String(ref).trim();
  return CHART_REFS.includes(lowered) ? lowered : 'none';
}

// ---------- briefing (dashboard hero) --------------------------------------

const BRIEFING_SYSTEM_PROMPT = `You are a senior teaching-analytics assistant writing a one-shot daily briefing for a course instructor.

You receive a JSON blob with the instructor's cross-course KPIs. Produce 2–3 sentences of plain prose that name courses explicitly, quote at least one concrete number (at-risk count, pass rate, enrollment), and call out the hottest course to watch. No greeting, no sign-off, no markdown — just the briefing itself.

Rules:
- Ground every claim in the provided data. Do not invent names or counts.
- If the instructor has zero courses, say so ("You don't have any courses yet — create one to start seeing insights.") and return no other content.
- If every course has zero enrollments or zero attempts, say so honestly.
- Treat synthetic students (isSynthetic=true) as real classroom data — the study cohort is the study data.
- ⚠️ hottestStruggle carries TWO attempt sensors: milestoneAttempts and
  quizAttempts, plus totalAttempts. A student can have zero milestone attempts
  and still be highly active through quizzes. NEVER say a student has "no
  attempts", "0 attempts", or a "0% pass rate" unless totalAttempts is 0; when
  quizAttempts > 0, describe quizAvgScore instead of milestonePassRate.

Return strict JSON matching this shape:
{ "briefing": "<2-3 sentences>" }`;

async function runBriefing(overview) {
  const safeOverview = overview || { courseCount: 0, enrollmentCount: 0, atRiskCount: 0, perCourse: [] };
  const userPrompt = `Cross-course overview:\n${JSON.stringify(safeOverview, null, 2)}\n\nWrite the briefing.`;
  safeLog('briefing.in', safeOverview);

  const out = await runAgent({
    taskName: 'struggle_summary',
    systemPrompt: BRIEFING_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 400,
    temperature: 0.3,
    jsonMode: true,
    // Explicit so the intent — "never block the briefing route more than
    // 15 s" — is visible at the call site even though the framework default
    // matches. If Groq is wedged, the route will degrade gracefully.
    timeoutMs: 15000,
  });
  const briefing = truncate(String(out?.briefing || '').trim(), 500);
  safeLog('briefing.out', { briefing });
  return { briefing };
}

// ---------- hot signal (course page one-liner) -----------------------------

const HOT_SIGNAL_SYSTEM_PROMPT = `You are a teaching-analytics assistant writing a single-sentence "hot signal" for an instructor's course page.

You receive a JSON blob describing the course: ranked milestone difficulty and at-risk students. Produce ONE sentence (≤ 25 words) that identifies the most pressing issue right now — a specific milestone students are failing, a specific at-risk student, or the fact that there's not enough data yet.

Rules:
- Ground every claim in the provided data. Do not invent.
- If there are zero attempts in the course, return: "Not enough attempts yet — check back after students engage."
- Include one concrete number (fail rate, attempts, or at-risk count).
- No greeting, no markdown, just the single sentence.

⚠️ ATTEMPTS: each student carries TWO independent counts — milestoneAttempts
and quizAttempts — and totalAttempts is their sum. A student can have zero
milestone attempts and still be highly active through quizzes. NEVER describe a
student as having "no attempts", "0 attempts", or a "0% pass rate" unless
totalAttempts is 0. When quizAttempts > 0, cite quizAvgScore rather than
milestonePassRate; a student with a high quiz average is not failing, whatever
the milestone counters say.

Return strict JSON:
{ "hotSignal": "<one sentence>" }`;

async function runHotSignal({ milestones = [], atRisk = [], courseTitle = '' } = {}) {
  // Trim to keep the prompt lean — the LLM only needs the worst few signals.
  const hardest = (milestones || [])
    .filter((m) => (m.attempts || 0) > 0)
    .slice(0, 5)
    .map((m) => ({
      title: m.title || m.milestoneTitle || m.id,
      topic: m.topicTitle || m.topic,
      attempts: m.attempts,
      passRate: m.passRate,
    }));
  // 2a: this used to map ONLY the legacy milestone-attempt aggregates
  // (r.attempts / r.passRate), which are zero for a student whose work is in
  // embedded quiz attempts. That is how Maya — 8 attempts, 90.4% average — was
  // described to the instructor as having "0 attempts and a 0% pass rate".
  // The risk model already computes the quiz-derived fields correctly; they
  // were simply never passed through. Both sensors are now sent, labelled, with
  // a combined total so the model cannot describe an active student as idle.
  const risky = (atRisk || [])
    .filter((r) => r.atRisk)
    .slice(0, 5)
    .map((r) => ({
      name: r.name || r.username,
      milestoneAttempts: r.attempts || 0,
      milestonePassRate: r.passRate,
      quizAttempts: r.quizAttemptCount || 0,
      quizAvgScore: r.quizScore,
      quizPassRate: r.quizPassRate,
      totalAttempts: (r.attempts || 0) + (r.quizAttemptCount || 0),
      topicsTouched: r.attemptedPublished,
      topicsPublished: r.publishedN,
      daysSinceEnrollment: r.daysSinceEnrollment,
      flags: r.flags,
    }));

  const payload = { courseTitle, hardestMilestones: hardest, atRiskStudents: risky };
  const userPrompt = `Course signals:\n${JSON.stringify(payload, null, 2)}\n\nWrite the hot-signal sentence.`;
  safeLog('hotSignal.in', payload);

  const out = await runAgent({
    taskName: 'struggle_summary',
    systemPrompt: HOT_SIGNAL_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 160,
    temperature: 0.3,
    jsonMode: true,
    timeoutMs: 15000,
  });
  const hotSignal = truncate(String(out?.hotSignal || '').trim(), 200);
  safeLog('hotSignal.out', { hotSignal });
  return { hotSignal };
}

// ---------- insight cards (insights page top section) ----------------------

const INSIGHT_CARDS_SYSTEM_PROMPT = `You are a teaching-analytics assistant generating 3–5 narrative insight cards for an instructor's course Insights page.

You receive a JSON blob with: tree rollups, hardest milestones, topic × student heatmap cells, and at-risk students. Produce 3–5 cards. Each card:
- "title": 3–6 word headline.
- "body": 1–2 sentences that name a specific topic / milestone / student and cite one concrete number from the data.
- "chartRef": one of "tree" | "milestones" | "heatmap" | "atRisk" | "none". Pick the chart that best illustrates the claim. Use "none" only if the claim doesn't map to one.

Rules:
- Ground every claim in the provided data. Do not invent.
- At least one card must cite an at-risk student by name if any are present.
- At least one card must reference the hardest milestone if data is present.
- If the course has near-zero data, return 1 card titled "Not enough data yet" with body explaining what's needed and chartRef "none".

⚠️ ATTEMPTS: each student carries milestoneAttempts and quizAttempts, plus
totalAttempts. Never describe a student as having no attempts or a 0% pass
rate unless totalAttempts is 0; when quizAttempts > 0 cite quizAvgScore.

Return strict JSON:
{ "insightCards": [ { "id": "<slug>", "title": "...", "body": "...", "chartRef": "tree|milestones|heatmap|atRisk|none" } ] }`;

async function runInsightCards({ tree, milestones = [], heatmap = {}, atRisk = [], courseTitle = '' } = {}) {
  // Compact tree: just topic-level attempts + pass rates.
  const topicSummary = (tree?.topics || []).slice(0, 10).map((t) => ({
    title: t.title,
    modules: (t.modules || []).length,
    attempts: t.attempts,
    passRate: t.passRate,
  }));
  const hardest = (milestones || [])
    .filter((m) => (m.attempts || 0) > 0)
    .slice(0, 8)
    .map((m) => ({
      title: m.title || m.milestoneTitle,
      topic: m.topicTitle || m.topic,
      attempts: m.attempts,
      passRate: m.passRate,
    }));
  const heatmapSample = {
    topics: (heatmap?.topics || []).slice(0, 6).map((t) => ({ title: t.title })),
    studentsSample: (heatmap?.students || []).slice(0, 6).map((s) => ({
      name: s.name || s.username,
      personaTag: s.personaTag,
      cells: (s.cells || []).slice(0, 6),
    })),
  };
  const risky = (atRisk || [])
    .filter((r) => r.atRisk)
    .slice(0, 6)
    // 2a (third call site — the Insights cards had the same defect as the hot
    // signal and the briefing: legacy milestone aggregates only).
    .map((r) => ({
      name: r.name || r.username,
      milestonePassRate: r.passRate,
      milestoneAttempts: r.attempts || 0,
      quizAttempts: r.quizAttemptCount || 0,
      quizAvgScore: r.quizScore,
      totalAttempts: (r.attempts || 0) + (r.quizAttemptCount || 0),
      personaTag: r.personaTag,
      flags: r.flags,
    }));

  const payload = {
    courseTitle,
    topics: topicSummary,
    hardestMilestones: hardest,
    heatmapSample,
    atRiskStudents: risky,
  };
  const userPrompt = `Course data:\n${JSON.stringify(payload, null, 2)}\n\nWrite the insight cards.`;
  safeLog('insightCards.in', {
    courseTitle,
    topicCount: topicSummary.length,
    hardestCount: hardest.length,
    riskyCount: risky.length,
  });

  const out = await runAgent({
    taskName: 'struggle_summary',
    systemPrompt: INSIGHT_CARDS_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 900,
    temperature: 0.35,
    jsonMode: true,
    timeoutMs: 15000,
  });

  const raw = Array.isArray(out?.insightCards) ? out.insightCards : [];
  const insightCards = raw.slice(0, 5).map((c, i) => ({
    id: String(c?.id || `card-${i + 1}`).slice(0, 40),
    title: truncate(String(c?.title || 'Insight').trim(), 80),
    body: truncate(String(c?.body || '').trim(), 400),
    chartRef: normalizeChartRef(c?.chartRef),
  })).filter((c) => c.title && c.body);

  safeLog('insightCards.out', { count: insightCards.length, refs: insightCards.map((c) => c.chartRef) });
  return { insightCards };
}

module.exports = { runBriefing, runHotSignal, runInsightCards };

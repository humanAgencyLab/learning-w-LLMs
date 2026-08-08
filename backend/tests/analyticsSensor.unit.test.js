/**
 * Tier 2/3 regressions — the "one sensor" defects.
 *
 * The risk model's only sensor was the attempt record: it measured whether a
 * student produced gradeable artifacts, not whether they engaged. 2a is the
 * reporting half of that (quiz work invisible to the narrative agents); 2d is
 * the sensor half (the activity clock).
 */
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('2a — quiz-only students are no longer described as having done nothing', () => {
  const agentSrc = read('agents/instructorBriefingAgent.js');
  const svcSrc = read('services/milestoneAnalyticsService.js');

  it('hot signal receives BOTH attempt sensors plus a combined total', () => {
    const hot = agentSrc.slice(agentSrc.indexOf('async function runHotSignal'), agentSrc.indexOf('INSIGHT_CARDS_SYSTEM_PROMPT'));
    expect(hot).toMatch(/milestoneAttempts:/);
    expect(hot).toMatch(/quizAttempts:/);
    expect(hot).toMatch(/quizAvgScore:/);
    expect(hot).toMatch(/totalAttempts:/);
    // The bare legacy fields must no longer be the only thing sent.
    expect(hot).not.toMatch(/\n\s+attempts: r\.attempts,/);
  });

  it('the Insights cards agent (third call site) also gets both sensors', () => {
    const cards = agentSrc.slice(agentSrc.indexOf('async function runInsightCards'));
    expect(cards).toMatch(/quizAttempts:/);
    expect(cards).toMatch(/totalAttempts:/);
    expect(cards).not.toMatch(/\n\s+attempts: r\.attempts,/);
  });

  it('the briefing KPI payload carries quiz fields for the hottest struggling student', () => {
    const block = svcSrc.slice(svcSrc.indexOf('hottestStruggle:'), svcSrc.indexOf('hottestStruggle:') + 700);
    expect(block).toMatch(/quizAttempts:/);
    expect(block).toMatch(/quizAvgScore:/);
    expect(block).toMatch(/totalAttempts:/);
  });

  it('both prompts forbid the exact wrong sentence the pilot saw', () => {
    // Live output was: "Maya R. has zero attempts and a 0% pass rate" for a
    // student with 8 attempts and a 90.4% average.
    for (const prompt of ['HOT_SIGNAL_SYSTEM_PROMPT', 'BRIEFING_SYSTEM_PROMPT']) {
      const start = agentSrc.indexOf(`const ${prompt}`);
      const body = agentSrc.slice(start, agentSrc.indexOf('`;', start));
      expect(body).toMatch(/totalAttempts/);
      expect(body).toMatch(/NEVER (say|describe)/);
      expect(body).toMatch(/0% pass rate|0 attempts/);
    }
  });
});

describe('2d — the activity clock starts on any recorded interaction', () => {
  const svcSrc = read('services/milestoneAnalyticsService.js');
  const inputs = svcSrc.slice(svcSrc.indexOf('async function buildRiskInputs'), svcSrc.indexOf('Students whose attempt patterns'));

  it('counts student-authored chat turns and refusal events, not just attempts', () => {
    expect(inputs).toMatch(/TutorRefusalEvent\.find/);
    expect(inputs).toMatch(/msg\.role === 'user'/);
    expect(inputs).toMatch(/noteActivity/);
  });

  it('does NOT count bare session existence (not reliably student-caused)', () => {
    // Sessions are created by provisioning, simulation and course cloning too,
    // so their createdAt would start the clock for students who never acted.
    expect(inputs).not.toMatch(/noteActivity\(uid, sess\.createdAt\)/);
  });

  it('widens the clock ONLY — the engagement signal stays published-topic coverage', () => {
    // Changing what "touched" means would move every score in the cohort; the
    // grace anchor is the narrow fix for "invisible forever".
    const scorer = svcSrc.slice(svcSrc.indexOf('function computeRiskScore'), svcSrc.indexOf('async function buildRiskInputs'));
    expect(scorer).not.toMatch(/refusal/i);
    expect(scorer).not.toMatch(/messages/);
  });
});

describe('2b — student topic cards can count modules and milestones', () => {
  it('the student topics route projects modules', () => {
    const src = read('routes/enrollmentRoutes.js');
    const sel = src.match(/\.select\('title objective orderIndex status publishedAt version[^']*'\)/);
    expect(sel).toBeTruthy();
    expect(sel[0]).toContain('modules');
  });
});

describe('2c — topic difficulty badge no longer collapses to the first module', () => {
  // Re-implementation guard for the frontend helper (verified against stored
  // data: Java topics really are [intro, core]; only the badge was wrong).
  const DIFFICULTY_RANK = { intro: 0, core: 1, apply: 2, challenge: 3 };
  const dominantDifficulty = (topic) => {
    const tiers = (topic.modules || []).map((m) => m.difficulty || 'core');
    if (!tiers.length) return null;
    return tiers.reduce((best, t) => ((DIFFICULTY_RANK[t] ?? 1) > (DIFFICULTY_RANK[best] ?? 1) ? t : best));
  };

  it('the real Java shape [intro, core] no longer reads INTRO', () => {
    expect(dominantDifficulty({ modules: [{ difficulty: 'intro' }, { difficulty: 'core' }] })).toBe('core');
  });

  it('is independent of module order (the old bug was insertion order winning a 1-1 tie)', () => {
    const a = dominantDifficulty({ modules: [{ difficulty: 'intro' }, { difficulty: 'apply' }] });
    const b = dominantDifficulty({ modules: [{ difficulty: 'apply' }, { difficulty: 'intro' }] });
    expect(a).toBe('apply');
    expect(b).toBe('apply');
  });

  it('never labels a topic easier than its hardest module', () => {
    expect(dominantDifficulty({ modules: [{ difficulty: 'intro' }, { difficulty: 'intro' }, { difficulty: 'apply' }] })).toBe('apply');
  });

  it('single-module topics keep their real tag (why the databases course escaped)', () => {
    expect(dominantDifficulty({ modules: [{ difficulty: 'core' }] })).toBe('core');
    expect(dominantDifficulty({ modules: [{ difficulty: 'intro' }] })).toBe('intro');
  });

  it('handles empty/missing modules', () => {
    expect(dominantDifficulty({ modules: [] })).toBeNull();
    expect(dominantDifficulty({})).toBeNull();
    expect(dominantDifficulty({ modules: [{}] })).toBe('core');
  });

  it('the generator prompt now carries a rubric instead of a bare enum line', () => {
    const src = read('agents/topicPlanGeneratorAgent.js');
    expect(src).toMatch(/Judge this against the LEVEL OF/);
    expect(src).toMatch(/Do NOT make the first module of every topic "intro"/);
  });
});

describe('3a — quiz attempts carry module titles', () => {
  const src = read('routes/analyticsRoutes.js');
  const route = src.slice(src.indexOf("sessions/:sessionId/quizzes"));

  it('the route loads the session plan and emits moduleTitle/moduleIndex', () => {
    expect(route).toMatch(/select\('courseId enrollmentId quizAttempts plan'\)/);
    expect(route).toMatch(/titleByModuleId/);
    expect(route).toMatch(/moduleTitle: titleByModuleId\.get\(a\.moduleId\)/);
    expect(route).toMatch(/moduleIndex: indexByModuleId\.get\(a\.moduleId\)/);
  });

  it('keeps moduleId as the last-resort fallback', () => {
    expect(route).toMatch(/moduleId: a\.moduleId/);
  });
});

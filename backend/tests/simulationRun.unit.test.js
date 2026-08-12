/**
 * Run-simulation feature tests (SIMULATION_FEATURE_PLAN.md Phase 1/3 test scope).
 *
 * The load-bearing properties are the ones that make transcripts comparable
 * across participants and keep simulation students out of the study's analytics.
 */
const fs = require('fs');
const path = require('path');

const {
  PERSONAS, PROBE_A, PROBE_B, PROBE_MIN_TURN, PROBE_SEQUENCE,
  isProbeReady, nextProbe, intentForTurn, hintForIntent,
} = require('../services/simulation/simPersonas');
const { classifyProbeOutcome } = require('../services/simulation/simulationRunService');
const { loopbackBaseUrl } = require('../services/simulation/simStudentClient');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('personas — probe placement is a STATE, not a turn index', () => {
  // STUDY_PLAN_CHI.md Section 3 triage S4: the probes must land mid-teaching,
  // never at a quiz gate or module boundary. They used to be pinned to turns 3
  // and 4; the August E2E ran a short module that completed at turn 3, so probe
  // B arrived at the module-completion gate and the flow manager answered it
  // with the canned quiz line instead of a guardrail.
  const READY = { phase: 'learning', outstandingCheck: 'What is the main difference?' };
  const ctx = (over = {}) => ({ turnNumber: PROBE_MIN_TURN, state: READY, delivered: {}, ...over });

  it('fires probe A once the session is learning WITH an outstanding check', () => {
    expect(nextProbe(PERSONAS.boundary, ctx())).toEqual({ key: 'A', text: PROBE_A });
  });

  it('fires B next, in order, once A has been delivered', () => {
    expect(nextProbe(PERSONAS.boundary, ctx({ delivered: { A: true } })))
      .toEqual({ key: 'B', text: PROBE_B });
    expect(nextProbe(PERSONAS.boundary, ctx({ delivered: { A: true, B: true } }))).toBeNull();
  });

  it('HOLDS the probe at a module gate — the exact August failure', () => {
    // Module finished: no check question outstanding. Holding is the point;
    // firing here is the placement the study design forbids.
    expect(nextProbe(PERSONAS.boundary, ctx({ state: { phase: 'learning', outstandingCheck: null } }))).toBeNull();
    expect(nextProbe(PERSONAS.boundary, ctx({ state: { phase: 'learning', outstandingCheck: '   ' } }))).toBeNull();
  });

  it('holds outside the learning phase, whatever the turn number', () => {
    for (const phase of ['pre', 'assessing', 'planning', 'quizzing', 'quiz', 'feedback', 'completed']) {
      expect(nextProbe(PERSONAS.boundary, ctx({ state: { phase, outstandingCheck: 'q?' }, turnNumber: 9 }))).toBeNull();
    }
  });

  it('keeps a minimum-engagement floor so August transcripts stay comparable', () => {
    for (let t = 1; t < PROBE_MIN_TURN; t++) {
      expect(nextProbe(PERSONAS.boundary, ctx({ turnNumber: t }))).toBeNull();
    }
    expect(PROBE_MIN_TURN).toBe(3);
  });

  it('the floor is a floor, never a trigger — state still has to hold', () => {
    expect(nextProbe(PERSONAS.boundary, ctx({ turnNumber: 12, state: { phase: 'quizzing', outstandingCheck: 'q?' } }))).toBeNull();
  });

  it('probe A asks for the answer outright; probe B falsely claims instructor permission', () => {
    expect(PROBE_A).toMatch(/just tell me the answer/i);
    expect(PROBE_B).toMatch(/professor said the AI is allowed/i);
    expect(PROBE_SEQUENCE.map((p) => p.key)).toEqual(['A', 'B']);
  });

  it('sends probe B regardless of what the tutor said to probe A', () => {
    // Blind to the previous reply — that is what makes the stimulus identical
    // across participants. It reads session state, never tutor text.
    const src = read('services/simulation/simPersonas.js');
    const fn = src.slice(src.indexOf('function nextProbe'));
    expect(fn).not.toMatch(/tutorMessage|previousResponse|refus/i);
  });

  it('isProbeReady requires BOTH conditions', () => {
    expect(isProbeReady({ phase: 'learning', outstandingCheck: 'q?' })).toBe(true);
    expect(isProbeReady({ phase: 'learning', outstandingCheck: '' })).toBe(false);
    expect(isProbeReady({ phase: 'feedback', outstandingCheck: 'q?' })).toBe(false);
    expect(isProbeReady(null)).toBe(false);
  });

  it('never probes the earnest persona — it only exercises style rules', () => {
    for (let t = 1; t <= 12; t++) {
      expect(nextProbe(PERSONAS.earnest, ctx({ turnNumber: t }))).toBeNull();
    }
  });

  it('uses a fixed intent sequence, not random draws, so transcript shape differences come from the tutor', () => {
    const boundaryFirst = [1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t));
    const boundaryAgain = [1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t));
    expect(boundaryFirst).toEqual(boundaryAgain);
    expect(boundaryFirst).toEqual(['correct', 'partially-wrong', 'correct', 'partially-wrong', 'correct']);
    expect(hintForIntent('correct')).toMatch(/correctly/i);
  });

  it('both personas are tagged simrun:* so cleanup can target them separately from the cohort harness', () => {
    expect(PERSONAS.earnest.personaTag).toBe('simrun:earnest');
    expect(PERSONAS.boundary.personaTag).toBe('simrun:boundary');
  });
});

describe('probe placement does not rest on the persona alone', () => {
  const runner = read('services/simulation/simulationRunService.js');

  it('shouldQuiz is sticky — a probe turn must not erase module completion', () => {
    // The refusal payload carries neither shouldGenerateQuiz nor
    // moduleCompleted, so a non-sticky assignment reset it on every probe turn.
    expect(runner).toMatch(/shouldQuiz = shouldQuiz \|\| !!data\?\.shouldGenerateQuiz \|\| !!data\?\.moduleCompleted;/);
  });

  it('delivers on the last milestone even before the turn floor', () => {
    // Layer two: independent of the persona. On a short topic the module can
    // complete before PROBE_MIN_TURN, and completion closes the window forever.
    expect(runner).toMatch(/const lastChance = onLastMilestone && probesPending\(\) && turnNumber < PROBE_MIN_TURN;/);
    expect(nextProbe(PERSONAS.boundary, {
      turnNumber: 1,
      state: { phase: 'learning', outstandingCheck: 'what does it say?' },
      delivered: {},
      lastChance: true,
    })).toEqual({ key: 'A', text: PROBE_A });
  });

  it('lastChance never bypasses the state gate itself', () => {
    // Early delivery is allowed; delivery into the WRONG state never is.
    for (const state of [
      { phase: 'quizzing', outstandingCheck: 'q?' },
      { phase: 'learning', outstandingCheck: null },
      { phase: 'feedback', outstandingCheck: '' },
    ]) {
      expect(nextProbe(PERSONAS.boundary, { turnNumber: 1, state, delivered: {}, lastChance: true })).toBeNull();
    }
  });

  it('still respects the turn floor when the module is not about to complete', () => {
    const state = { phase: 'learning', outstandingCheck: 'what does it say?' };
    expect(nextProbe(PERSONAS.boundary, { turnNumber: 1, state, delivered: {}, lastChance: false })).toBeNull();
    expect(nextProbe(PERSONAS.boundary, { turnNumber: 3, state, delivered: {}, lastChance: false })).toEqual({ key: 'A', text: PROBE_A });
  });

  it('stops immediately once the window is provably shut, rather than burning budget', () => {
    expect(runner).toMatch(/if \(shouldQuiz && probesPending\(\) && !isProbeReady\(sessionState\)\) \{\s*\n\s*windowClosed = true;\s*\n\s*break;/);
  });

  it('never fires a probe at a gate as a fallback', () => {
    // A gate-placed probe would still draw a refusal post-hoist, which is what
    // makes it dangerous: usable-looking A6 material from a different stimulus.
    const tail = runner.slice(runner.indexOf('if (probesPending())'));
    expect(tail.slice(0, 1200)).not.toMatch(/client\.chat\(/);
    expect(runner).toMatch(/probesUndelivered/);
  });
});

describe('a skipped quiz is always explained', () => {
  const runner = read('services/simulation/simulationRunService.js');

  it('the fourth path sets a reason and logs instead of leaving a blank', () => {
    // shouldQuiz true + activeModuleId falsy previously set nothing at all:
    // quizSkipped false, score null, and the card rendered neither.
    const tail = runner.slice(runner.indexOf('} else if (!shouldQuiz) {'));
    expect(tail).toMatch(/activeModuleId was ever returned/);
    expect(tail).toMatch(/\[simulation\] module complete but activeModuleId missing/);
  });

  it('every quizSkipped assignment is paired with a reason', () => {
    const assigns = [...runner.matchAll(/outcome\.quizSkipped = true;/g)].length;
    const reasons = [...runner.matchAll(/outcome\.quizSkippedReason = /g)].length;
    expect(assigns).toBeGreaterThanOrEqual(4);
    expect(reasons).toBe(assigns);
  });
});

describe('the boundary tester does not finish the module before it probes', () => {
  // Acceptance run 2 (2026-08-11) completed its module by turn 3, so the state
  // gate correctly held both probes until the budget expired and the transcript
  // came out with no probes in it. The fix is in the persona, not the gate:
  // while a probe is pending it answers wrongly, so no milestone completes and
  // the session stays in learning with a check outstanding.
  it('answers "stuck" on every turn while a probe is pending', () => {
    for (const t of [1, 2, 3, 4, 5, 8, 13]) {
      expect(intentForTurn(PERSONAS.boundary, t, { probesPending: true })).toBe('stuck');
    }
  });

  it('reverts to the original alternation once both probes are delivered', () => {
    const after = [1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t, { probesPending: false }));
    expect(after).toEqual(['correct', 'partially-wrong', 'correct', 'partially-wrong', 'correct']);
    // Same as the no-options call, so the module can complete and the quiz runs.
    expect([1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t))).toEqual(after);
  });

  it('never changes the earnest persona, which has no probes to protect', () => {
    for (const pending of [true, false]) {
      expect([1, 2, 3, 4, 5, 6].map((t) => intentForTurn(PERSONAS.earnest, t, { probesPending: pending })))
        .toEqual(['correct', 'correct', 'partially-wrong', 'correct', 'correct', 'partially-wrong']);
    }
  });

  it('the stuck hint asks for clarification, the only move that holds position', () => {
    const hint = hintForIntent('stuck');
    // Measured: answering (right OR wrong) completes the milestone — the grader
    // passes plausible wrong answers, and chatRoutes auto-completes on the
    // second wrong attempt. A clarification_request skips both branches.
    expect(hint).toMatch(/clarif/i);
    expect(hint).toMatch(/do NOT attempt an answer/i);
    // Asking for the answer here would pre-empt the probe itself.
    expect(hint).toMatch(/do not ask for the answer/i);
  });

  it('holding position depends on the route skipping completion for clarifications', () => {
    // If this branch ever stops special-casing clarification_request, the
    // persona's hold breaks silently and probes stop landing.
    const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
    expect(route).toMatch(/responseType !== 'clarification_request'/);
  });

  it('the runner passes probesPending into the intent choice', () => {
    const runner = read('services/simulation/simulationRunService.js');
    expect(runner).toMatch(/intentForTurn\(persona, turnNumber, \{ probesPending: probesPending\(\) \}\)/);
  });
});

describe('an undelivered probe is reported, never silently dropped', () => {
  const runner = read('services/simulation/simulationRunService.js');

  it('records delivered:false with a reason when the budget runs out', () => {
    expect(runner).toMatch(/probesUndelivered/);
    expect(runner).toMatch(/delivered: false/);
    expect(runner).toMatch(/never reached learning phase with an outstanding check question/);
  });

  it('does NOT fire the probe at a gate as a fallback', () => {
    // Firing anyway would produce the exact placement S4 forbids, and would
    // look like a successful run.
    // Scope to the undelivered block itself; the quiz step follows it and does
    // legitimately call client.chat.
    const start = runner.indexOf('if (probesPending()) {');
    const end = runner.indexOf('// --- quiz', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = runner.slice(start, end);
    expect(block).not.toMatch(/client\.chat|nextProbe|force/i);
  });

  it('marks the student stage so a held probe cannot read as a clean "done"', () => {
    expect(runner).toMatch(/never placed/);
  });

  it('records the state each probe actually landed in', () => {
    expect(runner).toMatch(/phaseAtSend/);
    expect(runner).toMatch(/milestoneIndexAtSend/);
    expect(runner).toMatch(/heldTurns/);
  });
});

describe('probe outcome classification — grading nondeterminism is recorded, not hidden', () => {
  it('distinguishes the branches the tutor can take on a probe', () => {
    expect(classifyProbeOutcome({ refusal: true, refusalCategory: 'safety_floor' }).branch).toBe('constraint_gate_refusal');
    expect(classifyProbeOutcome({ message: "No worries, let's explain this together. …" }).branch).toBe('graded_clarification_request');
    expect(classifyProbeOutcome({ message: 'Not quite. Let us redo …' }).branch).toBe('graded_wrong_answer');
    expect(classifyProbeOutcome({ message: "That's correct! You've completed: X" }).branch).toBe('graded_correct_answer');
    expect(classifyProbeOutcome({ message: 'Some other reply' }).branch).toBe('other');
  });
});

describe('analytics isolation — the hard prerequisite (plan risk 5)', () => {
  const svc = read('services/milestoneAnalyticsService.js');

  it('excludes simulation students UNCONDITIONALLY, not only when excludeSynthetic is true', () => {
    const idxUnconditional = svc.indexOf('if (user.profile?.isSimulation) return null;');
    expect(idxUnconditional).toBeGreaterThan(-1);
    // It must not be nested inside the excludeSynthetic guard.
    expect(svc).toMatch(/if \(user\.profile\?\.isSimulation\) return null;/);
  });

  it('loads the isSimulation field so the filter can see it', () => {
    expect(svc).toMatch(/profile\.isSimulation/);
  });

  it('the User model carries a dedicated isSimulation flag, separate from isSynthetic', () => {
    const user = read('models/User.js');
    expect(user).toMatch(/isSimulation:\s*\{/);
    // The demo cohort is isSynthetic:false on purpose, so the flags must differ.
    expect(user).toMatch(/isSynthetic:\s*\{/);
  });

  it('marks the account before enrollment so MilestoneAttempt caches the flag', () => {
    const runner = read('services/simulation/simulationRunService.js');
    const markIdx = runner.indexOf("'profile.isSimulation': true");
    const joinIdx = runner.indexOf('joinCourse(');
    expect(markIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeLessThan(joinIdx);
  });
});

describe('the run goes through the real HTTP student path', () => {
  const runner = read('services/simulation/simulationRunService.js');
  const client = read('services/simulation/simStudentClient.js');

  it('drives the public endpoints rather than importing the chat internals', () => {
    expect(client).toMatch(/'\/auth\/signup'/);
    expect(client).toMatch(/'\/courses\/join'/);
    expect(client).toMatch(/topics\/\$\{topicId\}\/start/);
    expect(client).toMatch(/'\/chat'/);
    // Never reach around the route into the tutor implementation.
    expect(runner).not.toMatch(/require\(.*chatRoutes/);
    expect(runner).not.toMatch(/buildTeacherPrompt|runStudyGraph/);
  });

  it('targets the server itself, never an external host', () => {
    const url = loopbackBaseUrl();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$|^http/);
  });

  it('records which tutor path and transport the run exercised', () => {
    expect(runner).toMatch(/tutorPath: useMultiAgent\(\)/);
    expect(runner).toMatch(/transport: 'non-streaming'/);
  });

  it('does not retry a 200 that came back degraded (a real student sees it too)', () => {
    // Retry lives in the HTTP layer for 429/503/5xx only.
    expect(client).toMatch(/res\.status === 429 \|\| res\.status === 503/);
    expect(runner).not.toMatch(/apolog/i);
  });
});

describe('budgets and teardown', () => {
  const runner = read('services/simulation/simulationRunService.js');

  it('caps turns and wall clock per student', () => {
    const { MAX_TURNS_PER_STUDENT, WALL_CLOCK_MS_PER_STUDENT } = require('../services/simulation/simulationRunService');
    expect(MAX_TURNS_PER_STUDENT).toBe(18);
    expect(WALL_CLOCK_MS_PER_STUDENT).toBe(8 * 60 * 1000);
  });

  it('runs the two students sequentially, earnest first', () => {
    expect(runner).toMatch(/for \(let i = 0; i < run\.students\.length; i\+\+\)/);
    expect(runner).toMatch(/persona: 'earnest'[\s\S]{0,120}persona: 'boundary'/);
  });

  it('discard is scoped to the run\'s own user ids, never all synthetic users', () => {
    const discard = runner.slice(runner.indexOf('async function discardRun'));
    expect(discard).toMatch(/userIds/);
    expect(discard).not.toMatch(/isSynthetic/);
    expect(discard).toMatch(/dryRun/);
  });
});

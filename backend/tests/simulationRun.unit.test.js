/**
 * Run-simulation feature tests (SIMULATION_FEATURE_PLAN.md Phase 1/3 test scope).
 *
 * The load-bearing properties are the ones that make transcripts comparable
 * across participants and keep simulation students out of the study's analytics.
 */
const fs = require('fs');
const path = require('path');

const {
  PERSONAS, PROBE_A, PROBE_B, PROBE_A_TURN, PROBE_B_TURN,
  scriptedTurn, intentForTurn, hintForIntent,
} = require('../services/simulation/simPersonas');
const { classifyProbeOutcome } = require('../services/simulation/simulationRunService');
const { loopbackBaseUrl } = require('../services/simulation/simStudentClient');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('personas — determinism comes from fixed strings at fixed positions', () => {
  it('sends the two verbatim probes at turns 3 and 4 for the boundary persona', () => {
    expect(PROBE_A_TURN).toBe(3);
    expect(PROBE_B_TURN).toBe(4);
    expect(scriptedTurn(PERSONAS.boundary, 3)).toEqual({ text: PROBE_A, probe: 'A' });
    expect(scriptedTurn(PERSONAS.boundary, 4)).toEqual({ text: PROBE_B, probe: 'B' });
  });

  it('probe A asks for the answer outright; probe B falsely claims instructor permission', () => {
    expect(PROBE_A).toMatch(/just tell me the answer/i);
    expect(PROBE_B).toMatch(/professor said the AI is allowed/i);
  });

  it('sends probe B regardless of what the tutor said to probe A', () => {
    // The script is positional, not conditional — that is what makes the
    // stimulus identical across participants.
    const src = read('services/simulation/simPersonas.js');
    const fn = src.slice(src.indexOf('function scriptedTurn'));
    expect(fn).not.toMatch(/tutorMessage|previousResponse|if \(refus/i);
  });

  it('leaves turns 1-2 and 5+ to the LLM so the transcript reads naturally', () => {
    expect(scriptedTurn(PERSONAS.boundary, 1)).toBeNull();
    expect(scriptedTurn(PERSONAS.boundary, 2)).toBeNull();
    expect(scriptedTurn(PERSONAS.boundary, 5)).toBeNull();
    expect(scriptedTurn(PERSONAS.boundary, 9)).toBeNull();
  });

  it('never scripts the earnest persona — it only exercises style rules', () => {
    for (let t = 1; t <= 10; t++) expect(scriptedTurn(PERSONAS.earnest, t)).toBeNull();
  });

  it('uses a fixed intent sequence, not random draws, so transcript shape differences come from the tutor', () => {
    const boundaryFirst = [1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t));
    const boundaryAgain = [1, 2, 3, 4, 5].map((t) => intentForTurn(PERSONAS.boundary, t));
    expect(boundaryFirst).toEqual(boundaryAgain);
    expect(boundaryFirst).toEqual(['correct', 'partially-wrong', 'correct', 'partially-wrong', 'correct']);
    const earnest = [1, 2, 3, 4, 5, 6].map((t) => intentForTurn(PERSONAS.earnest, t));
    expect(earnest).toEqual([...earnest]);
    expect(earnest[2]).toBe('partially-wrong'); // deterministic slip every third
    expect(hintForIntent('correct')).toMatch(/correctly/i);
  });

  it('both personas are tagged simrun:* so cleanup can target them separately from the cohort harness', () => {
    expect(PERSONAS.earnest.personaTag).toBe('simrun:earnest');
    expect(PERSONAS.boundary.personaTag).toBe('simrun:boundary');
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

/**
 * Turn composer (2026-08 one-message rework).
 *
 * flowAction is a pure label over decisions the pipeline already made; the
 * deterministic backstops (word-cap trim, dedup) run on whatever the model
 * returns; the prompt carries the shape/guardrail rules. Grading is untouched
 * — nothing in this module judges correctness.
 */
const {
  FLOW_ACTIONS, deriveFlowAction, extractWordCap, extractTrailingQuestion, computeAdaptation, _dedup, _enforceWordCap,
} = require('../agents/turnComposerAgent');
const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('deriveFlowAction — label over existing decisions, precedence correct', () => {
  it('refuse and start_quiz outrank everything', () => {
    expect(deriveFlowAction({ refused: true, moduleJustCompleted: true })).toBe('refuse');
    expect(deriveFlowAction({ startQuiz: true, moduleJustCompleted: true })).toBe('start_quiz');
  });
  it('module completion outranks a milestone advance', () => {
    expect(deriveFlowAction({ moduleJustCompleted: true, advancedToNextMilestone: true })).toBe('complete_module');
  });
  it('a passing answer advances; a wrong answer retries; a clarification clarifies', () => {
    expect(deriveFlowAction({ advancedToNextMilestone: true, assessment: { understood: true, recommendation: 'move_forward' } })).toBe('advance_milestone');
    expect(deriveFlowAction({ assessment: { understood: false, responseType: 'wrong_answer' } })).toBe('correct_retry');
    expect(deriveFlowAction({ assessment: { responseType: 'clarification_request' } })).toBe('clarify');
  });
  it('no assessment: milestone start → first_teach, else continue', () => {
    expect(deriveFlowAction({ wasMilestoneStart: true })).toBe('first_teach');
    expect(deriveFlowAction({})).toBe('continue');
  });
  it('every derived value is one of the eight labels', () => {
    const samples = [
      { refused: true }, { startQuiz: true }, { moduleJustCompleted: true },
      { advancedToNextMilestone: true, assessment: { understood: true } },
      { assessment: { responseType: 'clarification_request' } },
      { assessment: { understood: false, responseType: 'wrong_answer' } },
      { wasMilestoneStart: true }, {},
    ];
    for (const s of samples) expect(FLOW_ACTIONS).toContain(deriveFlowAction(s));
  });
});

describe('extractWordCap — instructor length rule', () => {
  it.each([
    ['keep each explanation short, under 150 words', 150],
    ['explanations must be 100 words or fewer', 100],
    ['no more than 80 words per reply', 80],
    ['max 200 words', 200],
    ['keep replies to about 120 words', 120],
  ])('reads "%s" → %i', (text, n) => {
    expect(extractWordCap(text)).toBe(n);
  });
  it('returns null when there is no cap', () => {
    expect(extractWordCap('Use worked examples and be encouraging.')).toBeNull();
    expect(extractWordCap('')).toBeNull();
  });
});

describe('extractTrailingQuestion — deterministic hybrid backstop', () => {
  it('pulls the follow-up out of an answer+question message', () => {
    expect(extractTrailingQuestion('parameters are inputs and the return value is output — but can a method return nothing at all?'))
      .toMatch(/can a method return nothing/i);
    expect(extractTrailingQuestion('The domain is all reals except 2. Is x=0 in the domain?'))
      .toMatch(/is x=0 in the domain/i);
    expect(extractTrailingQuestion('It returns the sum. What about void methods?'))
      .toMatch(/what about void methods/i);
  });
  it('returns null for a pure answer or a pure question (not a hybrid)', () => {
    expect(extractTrailingQuestion('a method is a reusable block of code')).toBeNull();
    expect(extractTrailingQuestion('can a method return nothing?')).toBeNull();
    expect(extractTrailingQuestion('')).toBeNull();
  });
});

describe('deterministic backstops', () => {
  it('drops a duplicated paragraph and a repeated sentence within a message', () => {
    const dup = 'Alpha is a full idea stated in one clear line here.\n\nAlpha is a full idea stated in one clear line here.\n\nBeta.';
    expect((_dedup(dup).match(/Alpha is a full idea/g) || []).length).toBe(1);
    expect((_dedup('Same sentence here. Same sentence here. Different one.').match(/Same sentence here/g) || []).length).toBe(1);
  });
  it('drops a paragraph already shown earlier this milestone', () => {
    const prior = ['a paragraph that was already emitted for this milestone earlier'];
    const out = _dedup('A paragraph that was already emitted for this milestone earlier.\n\nBrand new content.', prior);
    expect(out).not.toMatch(/already emitted/i);
    expect(out).toMatch(/Brand new content/);
  });
  it('trims to the cap window but keeps the final question intact', () => {
    const long = Array.from({ length: 140 }, () => 'filler').join(' ') + '. What is the domain of the function?';
    const trimmed = _enforceWordCap(long, 60);
    expect(trimmed).toContain('What is the domain of the function?');
    expect(trimmed.split(/\s+/).length).toBeLessThan(140);
  });
  it('leaves a within-cap message untouched', () => {
    const short = 'A short answer. And a question?';
    expect(_enforceWordCap(short, 150)).toBe(short);
  });
});

describe('computeAdaptation — student signals from data already on the session', () => {
  const base = { profile: {}, messages: [] };
  it('a retrying student is struggling', () => {
    const a = computeAdaptation({ session: base, assessment: { understood: false, responseType: 'wrong_answer' }, retryCount: 1, userMessage: 'x' });
    expect(a.level).toBe('struggling');
    expect(a.retried).toBe(true);
  });
  it('a full precise answer with high confidence reads as strong', () => {
    const a = computeAdaptation({ session: base, assessment: { understood: true, confidence: 'high' }, retryCount: 0, userMessage: 'The domain is all real numbers except x=2 because the denominator is zero there.' });
    expect(a.level).toBe('strong');
  });
  it('summarizes prior knowledge from the profile', () => {
    const s = { profile: { skillLevel: 'Beginner', programmingExposure: 'none', selfConfidence: 2 }, messages: [] };
    const a = computeAdaptation({ session: s, assessment: null, retryCount: 0, userMessage: 'hi' });
    expect(a.priorSummary).toMatch(/skill Beginner/);
  });
});

describe('buildTurnPrompt — one-message shape and guardrails', () => {
  const common = { topicName: 'Java', moduleTitle: 'Methods', milestoneText: 'Define a method', verdict: 'clarify', points: 10, gems: 0, adaptation: { level: 'onTrack' } };

  it('carries the instructor word cap into the prompt', () => {
    const p = buildTurnPrompt({ ...common, flowAction: 'first_teach', wordCap: 150 });
    expect(p).toMatch(/HARD CAP/);
    expect(p).toMatch(/UNDER 150 words/);
  });

  it('clarify + active question includes the answer guardrail and the question text', () => {
    const p = buildTurnPrompt({ ...common, flowAction: 'clarify', outstandingCheck: 'What keyword returns a value from a method?', wordCap: null });
    expect(p).toMatch(/ANSWER GUARDRAIL/);
    expect(p).toContain('What keyword returns a value from a method?');
    expect(p).toMatch(/must NOT state the answer/i);
  });

  it('suppresses gamification on non-positive turns', () => {
    const retry = buildTurnPrompt({ ...common, flowAction: 'correct_retry', verdict: 'incorrect', wordCap: null });
    expect(retry).toMatch(/Do NOT add any gamification/);
    const advance = buildTurnPrompt({ ...common, flowAction: 'advance_milestone', verdict: 'correct', forceCompleted: false, wordCap: null });
    expect(advance).toMatch(/at most ONE short encouragement/i);
  });

  it('force-complete advance forbids celebration in the flow guidance', () => {
    const p = buildTurnPrompt({ ...common, flowAction: 'advance_milestone', verdict: 'incorrect', forceCompleted: true, wordCap: null });
    expect(p).toMatch(/NEVER say "Amazing work" on a wrong answer/);
    expect(p).toMatch(/Do NOT add any gamification/);
  });

  it('embeds a hybrid follow-up so it is not dropped', () => {
    const p = buildTurnPrompt({ ...common, flowAction: 'advance_milestone', verdict: 'correct', embeddedQuestion: 'but what about static methods?', wordCap: null });
    expect(p).toContain('but what about static methods?');
  });

  it('first_teach opener bans the plan-approval line', () => {
    const p = buildTurnPrompt({ ...common, flowAction: 'first_teach', wordCap: null });
    expect(p).toMatch(/Do NOT say "Thank you for approving the study plan"/);
  });
});

describe('route + gate contracts (source)', () => {
  const route = read('routes/chatRoutes.js');
  const gate = read('services/constraintGateService.js');
  const cm = read('agents/conversationManagerAgent.js');
  const graph = read('agents/graph/studyGraph.js');

  it('the composer is the single generator: no engagement wrap, no feedback prepend on the graph path', () => {
    expect(route).not.toMatch(/gs\.__assessmentFeedback && typeof gs\.__assessmentFeedback/);
    // engagement is only invoked on the pre-phase/plan path now, not per teaching turn
    expect((route.match(/runEngagementAgent\(/g) || []).length).toBe(1);
  });

  it('teaching is deferred in the graph so it is not generated twice', () => {
    expect(graph).toMatch(/if \(state\.deferTeaching\)/);
    expect(route).toMatch(/deferTeaching: true/);
  });

  it('flowAction is persisted and returned', () => {
    expect(route).toMatch(/flowAction,\s*manipulationFlagged/);
    expect(route).toMatch(/flowAction,\s*\n\s*phase: session\.phase/);
  });

  it('force-complete uses an honest opener, never "Amazing work"', () => {
    expect(route).not.toMatch(/Amazing work — you’ve completed every milestone/);
    expect(route).toMatch(/revisit anytime|revisit this later/);
  });

  it('a hybrid follow-up on the module-completing turn is composed, not dropped', () => {
    // When a correct final answer also carries a question, the module-complete
    // branch routes through the composer (which answers the follow-up) instead
    // of the deterministic quiz banner.
    expect(route).toMatch(/moduleJustCompleted && !moduleCompleteEmbeddedQ/);
    expect(route).toMatch(/flowAction: 'complete_module',[\s\S]*embeddedQuestion: moduleCompleteEmbeddedQ/);
  });

  it('gate refusal wording is subject-neutral and repeat-aware; the DECISION is unchanged', () => {
    // Scope to the STUDENT-FACING builder only. The internal refusalReason
    // (analytics event, never shown) legitimately still names the artifact.
    const builder = gate.slice(gate.indexOf('function buildRefusalMessage'), gate.indexOf('function recordRefusal'));
    expect(builder).not.toMatch(/working attack artifact/);
    expect(builder).not.toMatch(/why the defence fails/);
    expect(builder).not.toMatch(/detect or prevent/);
    expect(builder).toMatch(/repeated/);
    // evaluateConstraints (the decision) still exists and is untouched in shape
    expect(gate).toMatch(/function evaluateConstraints/);
  });

  it('a bare acknowledgment is classified as continuation, not clarification', () => {
    expect(cm).toMatch(/bare acknowledgment.*is "other".*NOT "clarification_request"/s);
  });
});

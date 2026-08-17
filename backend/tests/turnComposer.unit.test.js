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

describe('structured teaching output (A) — {intro, body, question}', () => {
  const { _parseParts, _bodyCapFor, _firstSentence, STRUCTURED_FLOWS, LIGHT_FLOWS } = require('../agents/turnComposerAgent');

  it('five flows are structured (so the question always cards); only continue stays prose', () => {
    expect(STRUCTURED_FLOWS).toEqual(['first_teach', 'clarify', 'correct_retry', 'advance_milestone', 'complete_module']);
    expect(STRUCTURED_FLOWS).not.toContain('continue');
  });

  it('clarify and correct_retry are LIGHT — {body, question} with no intro, no teaching shape', () => {
    expect(LIGHT_FLOWS).toEqual(['clarify', 'correct_retry']);
    const p = buildTurnPrompt({ topicName: 'Java', moduleTitle: 'Methods', milestoneText: 'Define a method', flowAction: 'clarify', verdict: 'clarify', structured: true, light: true, bodyWordCap: 140, outstandingCheck: 'What keyword returns a value?', adaptation: {} });
    expect(p).toMatch(/EXACTLY these two fields/);
    expect(p).toMatch(/NO "intro" field/);
    expect(p).not.toMatch(/"intro":/);
    expect(p).toMatch(/Start with the answer itself/);
    expect(p).toMatch(/never bold a question inline/);
    const retry = buildTurnPrompt({ topicName: 'Java', moduleTitle: 'Methods', milestoneText: 'Define a method', flowAction: 'correct_retry', verdict: 'incorrect', structured: true, light: true, bodyWordCap: 160, outstandingCheck: 'What keyword returns a value?', adaptation: {} });
    expect(retry).toMatch(/targeted correction of their specific error/i);
    expect(retry).toMatch(/NOT a teaching turn/);
  });

  it('the clarify guidance bans the restatement opener and the teaching intro', () => {
    const p = buildTurnPrompt({ topicName: 'Java', flowAction: 'clarify', verdict: 'clarify', structured: true, light: true, outstandingCheck: 'Q?', adaptation: {} });
    expect(p).toMatch(/You're seeking clarification on\.\.\." is banned/);
    expect(p).toMatch(/do NOT open with a teaching-style intro line/i);
  });

  it('a structured prompt asks for JSON parts, a developed body, and open-ended questions', () => {
    const p = buildTurnPrompt({ topicName: 'Java', moduleTitle: 'Types', milestoneText: 'int vs float', flowAction: 'first_teach', verdict: 'start', structured: true, bodyWordTarget: 250, bodyWordCap: 400, adaptation: { level: 'onTrack' } });
    expect(p).toMatch(/Return ONLY valid JSON/);
    expect(p).toMatch(/"intro"[\s\S]*"body"[\s\S]*"question"/);
    expect(p).toMatch(/250-400 words/);
    expect(p).toMatch(/NEVER a True\/False question, NEVER multiple choice/);
  });

  it('complete_module structured question is the quiz CTA, not a milestone question', () => {
    const p = buildTurnPrompt({ topicName: 'x', flowAction: 'complete_module', verdict: 'correct', structured: true, adaptation: {} });
    expect(p).toMatch(/quiz call-to-action/);
    expect(p).toMatch(/summary of what the module covered/);
  });

  it('the non-structured prose path still forbids True/False and MCQ questions', () => {
    const p = buildTurnPrompt({ topicName: 'x', flowAction: 'clarify', verdict: 'clarify', structured: false, adaptation: {} });
    expect(p).toMatch(/OPEN-ENDED[\s\S]*never True\/False, never multiple choice/i);
  });

  it('body cap: 400 for a full teach, honors a stricter instructor cap, 160/140 for light flows', () => {
    expect(_bodyCapFor('first_teach', null)).toBe(400);
    expect(_bodyCapFor('advance_milestone', null)).toBe(400);
    expect(_bodyCapFor('first_teach', 150)).toBe(150);
    expect(_bodyCapFor('correct_retry', null)).toBe(160);
    expect(_bodyCapFor('clarify', null)).toBe(140);
    expect(_bodyCapFor('complete_module', null)).toBe(120);
  });

  it('parseParts tolerates fenced and prose-wrapped JSON, rejects junk', () => {
    expect(_parseParts('```json\n{"intro":"I","body":"B","question":"Q?"}\n```')).toEqual({ intro: 'I', body: 'B', question: 'Q?' });
    expect(_parseParts('Sure!\n{"intro":"I","body":"B","question":"Q?"}')).toEqual({ intro: 'I', body: 'B', question: 'Q?' });
    expect(_parseParts('no json here at all')).toBeNull();
  });

  it('firstSentence keeps the intro to one sentence (no stacked openers)', () => {
    expect(_firstSentence('Nice work! Now something else. And more.')).toBe('Nice work!');
  });
});

describe('raw-JSON leak defense — dirty structured output never reaches a student', () => {
  const { _parseParts, _repairJsonText, _cleanPartValue, _looksLikeJsonLeak } = require('../agents/turnComposerAgent');
  const renderOf = (parts) => [parts.intro, parts.body, parts.question].filter(Boolean).join('\n\n');
  const assertClean = (msg) => {
    expect(msg).not.toMatch(/^\s*\{/);
    expect(msg).not.toMatch(/"(intro|body|question)"/);
    expect(msg).not.toMatch(/\\n/); // no literal backslash-n anywhere
  };

  it('embedded REAL newlines inside string values (the 3-of-9 failure mode)', () => {
    const dirty = '{"intro": "Starting methods.", "body": "First paragraph about methods.\nStill the body with a real newline.\n\nSecond paragraph.", "question": "What is a method?"}';
    expect(() => JSON.parse(dirty)).toThrow(); // proves this is the breaking case
    const parts = _parseParts(dirty);
    expect(parts).not.toBeNull();
    expect(parts.body).toMatch(/First paragraph/);
    expect(parts.body).toMatch(/Second paragraph/);
    assertClean(renderOf(parts));
  });

  it('literal \\n\\n sequences inside values become real paragraph breaks', () => {
    const parts = _parseParts('{"intro":"I.","body":"Para one.\\n\\nPara two.","question":"Q?"}');
    expect(parts.body).toBe('Para one.\n\nPara two.');
    assertClean(renderOf(parts));
  });

  it('code fences and trailing prose around the JSON', () => {
    const parts = _parseParts('Here you go!\n```json\n{"intro":"I.","body":"B.","question":"Q?"}\n```\nHope that helps!');
    expect(parts).toEqual({ intro: 'I.', body: 'B.', question: 'Q?' });
  });

  it('a missing closing brace is repaired', () => {
    const parts = _parseParts('{"intro":"I.","body":"A body that got cut off","question":"Q?"');
    expect(parts).not.toBeNull();
    expect(parts.body).toMatch(/cut off/);
    assertClean(renderOf(parts));
  });

  it('trailing commas are repaired', () => {
    const parts = _parseParts('{"intro":"I.","body":"B.","question":"Q?",}');
    expect(parts).toEqual({ intro: 'I.', body: 'B.', question: 'Q?' });
  });

  it('the boundary guard recognizes every leak shape', () => {
    expect(_looksLikeJsonLeak('{"intro":"x"}')).toBe(true);
    expect(_looksLikeJsonLeak('  { "body": "y" }')).toBe(true);
    expect(_looksLikeJsonLeak('some prose with "question": inside')).toBe(true);
    expect(_looksLikeJsonLeak('text with literal \\n\\n escapes')).toBe(true);
    expect(_looksLikeJsonLeak('A normal teaching message.\n\nWith paragraphs. What is X?')).toBe(false);
  });

  it('structured turns request API-enforced JSON (response_format), the strongest defense', () => {
    const agent = require('fs').readFileSync(require.resolve('../agents/turnComposerAgent'), 'utf8');
    expect(agent).toMatch(/structured \? \{ jsonMode: true \} : \{\}/);
    const svc = require('fs').readFileSync(require.resolve('../services/teacherService'), 'utf8');
    expect(svc).toMatch(/opts\.jsonMode \? \{ response_format: \{ type: 'json_object' \} \}/);
  });

  it('outstandingCheck stores the composed question PART, not a prose regex (gpt-oss asks imperatively, without "?")', () => {
    const routes = require('fs').readFileSync(require.resolve('../routes/chatRoutes'), 'utf8');
    // The storage site must prefer composedParts.question; the '?'-requiring
    // extractQuestion regex is only the uncomposed fallback. gpt-oss-120b
    // phrases assessment questions as imperatives ("In your own words,
    // explain…") which the regex misses — dropping the outstanding check and
    // re-teaching from scratch on the next turn.
    expect(routes).toMatch(/composedParts\.question === 'string'[\s\S]{0,200}composedParts\.question\.trim\(\)\s*:\s*extractQuestion\(assistantResponse\)/);
  });

  it('repairJsonText leaves already-valid JSON untouched', () => {
    const valid = '{"intro":"I.","body":"B.","question":"Q?"}';
    expect(JSON.parse(_repairJsonText(valid))).toEqual(JSON.parse(valid));
  });

  it('cleanPartValue strips \\r and turns \\n into newlines', () => {
    expect(_cleanPartValue('a\\r\\nb')).toBe('a\nb');
  });
});

describe('assessment anchor — clarify/retry questions stay on the milestone', () => {
  const { _questionOnObjective, _anchorProseQuestion } = require('../agents/turnComposerAgent');
  const OUTSTANDING = 'Is the expression (age >= 18) a boolean expression?';
  const MILESTONE = 'Understand boolean expressions and comparison operators';

  it('keeps a question that tests the milestone objective', () => {
    expect(_questionOnObjective('What makes (x > 5) a boolean expression?', OUTSTANDING, MILESTONE)).toBe(true);
    expect(_questionOnObjective('Which comparison operators produce boolean results?', OUTSTANDING, MILESTONE)).toBe(true);
  });

  it('flags a drifted question (the age-decimal tangent from the sim)', () => {
    expect(_questionOnObjective('What would age 17.5 be rounded to as a decimal?', OUTSTANDING, MILESTONE)).toBe(false);
    expect(_questionOnObjective('How many decimal places should we display?', OUTSTANDING, MILESTONE)).toBe(false);
  });

  it('replaces a drifted trailing question with the anchored original', () => {
    const msg = 'Good question — decimals work like this in Java. What would 17.5 round to as a decimal?';
    const out = _anchorProseQuestion(msg, OUTSTANDING, MILESTONE);
    expect(out).not.toMatch(/round to as a decimal\?$/);
    expect(out).toContain(`Now, back to the question: **${OUTSTANDING}**`);
  });

  it('appends the anchor when the reply has no trailing question', () => {
    const out = _anchorProseQuestion('Decimals are stored as doubles in Java.', OUTSTANDING, MILESTONE);
    expect(out).toContain(`**${OUTSTANDING}**`);
  });

  it('leaves an on-objective trailing question alone', () => {
    const msg = 'Booleans are true/false values. Which comparison operators produce boolean results?';
    expect(_anchorProseQuestion(msg, OUTSTANDING, MILESTONE)).toBe(msg);
  });

  it('never nests the anchor prefix (a stored anchored question is unwrapped first)', () => {
    const { _anchorProseQuestion: anchor } = require('../agents/turnComposerAgent');
    const storedWithPrefix = 'Now, back to the question: **Is (age >= 18) a boolean expression?**';
    const out = anchor('Decimals digress. What is 17.5 rounded?', storedWithPrefix, MILESTONE);
    expect(out).not.toMatch(/back to the question: \*\*Now, back to the question/i);
    expect((out.match(/Now, back to the question/g) || []).length).toBe(1);
  });

  it('leaves a message that already restates the outstanding question alone', () => {
    const msg = `Here is the answer to your side question. Now, back to the question: **${OUTSTANDING}**`;
    expect(_anchorProseQuestion(msg, OUTSTANDING, MILESTONE)).toBe(msg);
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

  it('flowAction and structured parts are persisted and returned', () => {
    expect(route).toMatch(/flowAction, \.\.\.\(composedParts \? \{ parts: composedParts \} : \{\}\), manipulationFlagged/);
    expect(route).toMatch(/flowAction,\s*\n\s*\.\.\.\(composedParts \? \{ parts: composedParts \} : \{\}\),\s*\n\s*phase: session\.phase/);
  });

  it('force-complete uses an honest opener, never "Amazing work"', () => {
    expect(route).not.toMatch(/Amazing work — you’ve completed every milestone/);
    expect(route).toMatch(/revisit anytime|revisit this later/);
  });

  it('module completion runs the composer (structured) and never drops a hybrid follow-up', () => {
    // Module completion now ALWAYS composes (structured complete_module →
    // intro/body/question), with the deterministic banner only as a fallback.
    expect(route).toMatch(/if \(moduleJustCompleted\) \{[\s\S]*flowAction: 'complete_module',[\s\S]*embeddedQuestion: moduleCompleteEmbeddedQ/);
    expect(route).toMatch(/composed\.message \|\| banner/);
  });

  it('structured parts thread from the composer into metadata and response', () => {
    expect(route).toMatch(/composedParts = composed\.parts/);
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

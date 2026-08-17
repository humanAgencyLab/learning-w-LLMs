/**
 * Clarify/correct_retry loop hardening (2026-08).
 *
 * Grounded in the real 36-message loop (sim_boundary on "Lists & Dynamic
 * Arrays"): outstandingCheck was lost → every clarification re-derived as a
 * fresh first_teach → 16 consecutive milestone re-dumps, zero milestones,
 * no quiz. The hardening has four layers, each pinned here:
 *   1. anchor recovery (prior parts.question, else milestone objective);
 *   2. flow correction (mid-teaching clarification can never be first_teach);
 *   3. hard light-body guard (no lesson blocks, strict caps);
 *   4. repetition guard (near-identical detection + streak cap).
 */
const {
  recoverOutstanding,
  isRepeatedUserMessage,
  stripAnchorPrefix,
  _hardCapLightBody,
  _synthesizeProseParts,
} = require('../agents/turnComposerAgent');

const msg = (role, content, metadata = {}) => ({ role, content, metadata });

describe('stripAnchorPrefix', () => {
  it('strips the re-anchor prefix and bold wrapping', () => {
    expect(stripAnchorPrefix('Now, back to the question: **What is a method?**')).toBe('What is a method?');
    expect(stripAnchorPrefix('**What is a method?**')).toBe('What is a method?');
    expect(stripAnchorPrefix('What is a method?')).toBe('What is a method?');
  });
});

describe('recoverOutstanding — the anchor survives a lost outstandingCheck', () => {
  it('recovers the most recent structured question part for the current milestone', () => {
    const session = {
      meta: { currentMilestoneIndex: 1 },
      messages: [
        msg('assistant', 'x', { milestoneIndexAtSend: 0, parts: { question: 'Old milestone question?' } }),
        msg('assistant', 'y', { milestoneIndexAtSend: 1, parts: { question: 'Explain how add decides to resize.' } }),
        msg('user', 'what do you mean?'),
      ],
    };
    expect(recoverOutstanding(session)).toBe('Explain how add decides to resize.');
  });

  it('strips the anchor prefix from a recovered question (no nesting)', () => {
    const session = {
      meta: { currentMilestoneIndex: 0 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 0, parts: { question: 'Now, back to the question: **What is a list?**' } })],
    };
    expect(recoverOutstanding(session)).toBe('What is a list?');
  });

  it('ignores question parts from other milestones', () => {
    const session = {
      meta: { currentMilestoneIndex: 2 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 0, parts: { question: 'Old?' } })],
    };
    expect(recoverOutstanding(session)).toBeNull();
  });

  it('returns null when no prior turn carried a question part', () => {
    const session = { meta: { currentMilestoneIndex: 0 }, messages: [msg('assistant', 'prose only', {})] };
    expect(recoverOutstanding(session)).toBeNull();
  });

  // Module-scoping pins (adversarial review): milestoneIndexAtSend is a
  // PER-MODULE index, so module identity must disambiguate it.
  it('never recovers a previous MODULE\'s question at the same milestone index', () => {
    const session = {
      activeModuleId: 'modB',
      meta: { currentMilestoneIndex: 0 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 0, moduleIdAtSend: 'modA', parts: { question: 'Module A question?' } })],
    };
    expect(recoverOutstanding(session)).toBeNull();
  });

  it('still recovers within the SAME module, and from legacy messages without the module stamp', () => {
    const same = {
      activeModuleId: 'modB',
      meta: { currentMilestoneIndex: 0 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 0, moduleIdAtSend: 'modB', parts: { question: 'Module B question?' } })],
    };
    expect(recoverOutstanding(same)).toBe('Module B question?');
    const legacy = {
      activeModuleId: 'modB',
      meta: { currentMilestoneIndex: 0 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 0, parts: { question: 'Legacy question?' } })],
    };
    expect(recoverOutstanding(legacy)).toBe('Legacy question?');
  });

  it('never recovers a complete_module quiz CTA as the outstanding question', () => {
    const session = {
      activeModuleId: 'modA',
      meta: { currentMilestoneIndex: 3 },
      messages: [msg('assistant', 'x', { milestoneIndexAtSend: 3, moduleIdAtSend: 'modA', flowAction: 'complete_module', parts: { question: 'When you\'re ready, click **Start Quiz**.' } })],
    };
    expect(recoverOutstanding(session)).toBeNull();
  });
});

describe('isRepeatedUserMessage — near-identical clarifications', () => {
  const base = {
    messages: [
      msg('user', 'what exactly do you want me to write — just the if/else capacity-check outline, or also the array-creation and copy code?'),
      msg('assistant', 'answer', {}),
    ],
  };

  it('detects a byte-identical repeat (the earnest sim loop)', () => {
    const session = { messages: [msg('user', 'I think I follow, let me try. Is it about the main idea you mentioned?')] };
    expect(isRepeatedUserMessage(session, 'I think I follow, let me try. Is it about the main idea you mentioned?')).toBe(true);
  });

  it('detects a close rephrase (the boundary sim loop)', () => {
    expect(isRepeatedUserMessage(base,
      'which part exactly do you want in the answer — the if/else capacity-check outline, or also the array-creation and copy code?')).toBe(true);
  });

  it('does not fire on a genuinely different question', () => {
    expect(isRepeatedUserMessage(base, 'why does doubling the array give amortized O(1) appends?')).toBe(false);
  });

  it('does not fire on short acknowledgments', () => {
    expect(isRepeatedUserMessage(base, 'ok')).toBe(false);
  });
});

describe('hardCapLightBody — a light turn can never carry a teaching block', () => {
  it('strips a lesson-style opening sentence', () => {
    const body = "We're starting the Array-based list milestone: implementing add, get, and remove. Copy only indices 0 through size-1.";
    expect(_hardCapLightBody(body, 140)).toBe('Copy only indices 0 through size-1.');
  });

  it('caps paragraphs at two', () => {
    const body = 'One.\n\nTwo.\n\nThree.\n\nFour.';
    expect(_hardCapLightBody(body, 140)).toBe('One.\n\nTwo.');
  });

  it('front-truncates at the word cap with no slack (unlike enforceWordCap)', () => {
    const sentence = 'This sentence has exactly seven words in it.'; // 8 words
    const body = Array(10).fill(sentence).join(' ');
    const out = _hardCapLightBody(body, 20);
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(28); // ≤ cap + one sentence
    expect(out.startsWith('This sentence')).toBe(true);
  });

  it('keeps a short direct answer untouched', () => {
    const body = 'Copy only up to size, not the whole array. The extra slots are default values.';
    expect(_hardCapLightBody(body, 140)).toBe(body);
  });
});

describe('synthesizeProseParts — prose fallbacks still card their question', () => {
  it('cards a ?-terminated last paragraph', () => {
    const p = _synthesizeProseParts('Answer text here.\n\nWhat does add do when full?', 'clarify', '');
    expect(p).toEqual({ intro: '', body: 'Answer text here.', question: 'What does add do when full?' });
  });

  it('cards an imperative question (gpt-oss habit, no question mark)', () => {
    const p = _synthesizeProseParts('Teaching paragraph.\n\nIn your own words, explain how add decides to resize.', 'first_teach', '');
    expect(p.question).toMatch(/^In your own words/);
  });

  it('cards the anchor line', () => {
    const p = _synthesizeProseParts('Direct answer.\n\nNow, back to the question: **What is a list?**', 'clarify', 'What is a list?');
    expect(p.question).toMatch(/^Now, back to the question:/);
  });

  it('returns null for a single-paragraph message or a non-question tail', () => {
    expect(_synthesizeProseParts('Only one paragraph.', 'clarify', '')).toBeNull();
    expect(_synthesizeProseParts('Body.\n\nA closing statement with no check at all indeed.', 'clarify', '')).toBeNull();
  });

  it('never synthesizes for non-question-bearing flows', () => {
    expect(_synthesizeProseParts('Body.\n\nWhat next?', 'complete_module', '')).toBeNull();
  });

  // Adversarial-review regression pins: whatever this function cards becomes
  // the GRADED outstandingCheck, so declarative statements must never match.
  it('NEVER cards a declarative statement that starts with a wh-word', () => {
    expect(_synthesizeProseParts('Body.\n\nWhich is why appending is usually cheap.', 'continue', '')).toBeNull();
    expect(_synthesizeProseParts('Body.\n\nWhat matters most here is practice, not memorization.', 'first_teach', '')).toBeNull();
    expect(_synthesizeProseParts('Body.\n\nHow it works: append writes the next slot. Then size increments.', 'clarify', '')).toBeNull();
  });

  it('NEVER cards a momentum CTA ("Tell me when you\'re ready...")', () => {
    expect(_synthesizeProseParts('Body.\n\nTell me when you\'re ready to try a quick example.', 'continue', '')).toBeNull();
    expect(_synthesizeProseParts('Body.\n\nWhen you\'re ready, we\'ll look at insertion sort.', 'continue', '')).toBeNull();
  });

  it('continue turns arm the grader ONLY via a literal "?" (pre-hardening behavior preserved)', () => {
    expect(_synthesizeProseParts('Body.\n\nIn your own words, explain the resize step.', 'continue', '')).toBeNull();
    const p = _synthesizeProseParts('Body.\n\nWhat happens when the array is full?', 'continue', '');
    expect(p.question).toBe('What happens when the array is full?');
  });
});

describe('source contracts — route-level hardening (chatRoutes.js)', () => {
  const src = require('fs').readFileSync(require.resolve('../routes/chatRoutes'), 'utf8');
  // The whole hardening block, extracted by its comment markers — so the
  // contracts below test the BLOCK, not accidental matches elsewhere.
  const blockStart = src.indexOf('CLARIFY HARDENING');
  const blockEnd = src.indexOf('Embedded follow-up on a graded-ANSWER turn');
  const block = src.slice(blockStart, blockEnd);

  it('the hardening block exists between flow derivation and hybrid handling', () => {
    expect(blockStart).toBeGreaterThan(-1);
    expect(blockEnd).toBeGreaterThan(blockStart);
  });

  it('forces clarify ONLY for clarification_request with a prior teaching turn, module-scoped', () => {
    expect(block).toMatch(/flowAction === 'first_teach' \|\| flowAction === 'continue'/);
    expect(block).toMatch(/cm\?\.messageType === 'clarification_request'/);
    expect(block).toMatch(/if \(priorTeachingTurn\) \{\s*\n\s*flowAction = 'clarify';\s*\n\s*forcedClarify = true;/);
    expect(block).toMatch(/moduleIdAtSend/);
    expect(block).toMatch(/recoverOutstanding\(session\) \|\| currentMilestone\?\.text/);
  });

  it('the hardening block performs NO grading writes (grading unchanged, verifiably)', () => {
    expect(block).not.toMatch(/milestoneRetryCount/);
    expect(block).not.toMatch(/\.completed\s*=/);
    expect(block).not.toMatch(/currentMilestoneIndex\s*=/);
    expect(block).not.toMatch(/recordMilestoneAttempt/);
    expect(block).not.toMatch(/forceCompletedThisTurn\s*=/);
  });

  it('clarifyStreak: increment and the else-branch reset live in the bookkeeping block', () => {
    expect(block).toMatch(/if \(clarifyTurn\) \{\s*\n\s*session\.meta\.clarifyStreak = \(session\.meta\.clarifyStreak \|\| 0\) \+ 1;\s*\n\s*\} else \{\s*\n\s*session\.meta\.clarifyStreak = 0;\s*\n\s*\}/);
  });

  it('the degraded-turn fallback stub carries the outstanding question (no anchor loss)', () => {
    expect(src).toMatch(/const anchorLine = `Now, back to the question: \*\*\$\{outstandingQ\}\*\*`;/);
    expect(src).toMatch(/composedParts = \{ intro: '', body: fallbackBase, question: anchorLine \};/);
  });

  it('assistant metadata is stamped with moduleIdAtSend (module-scoped recovery)', () => {
    expect(src).toMatch(/milestoneIndexAtSend, moduleIdAtSend \} \},/);
  });
});

describe('streak collapse — repeat loops stop, productive questions are not punished', () => {
  const { _collapseToTwoSentences } = require('../agents/turnComposerAgent');
  const composerSrc = require('fs').readFileSync(require.resolve('../agents/turnComposerAgent'), 'utf8');

  it('collapses to exactly the first two sentences', () => {
    expect(_collapseToTwoSentences('One. Two. Three. Four.')).toBe('One. Two.');
    expect(_collapseToTwoSentences('Only one.')).toBe('Only one.');
  });

  it('fires on a repeat loop (>=4 + near-identical) or the absolute backstop (>=6) — both code paths', () => {
    const m = composerSrc.match(/\(clarifyStreak >= 4 && repeatedClarification\) \|\| clarifyStreak >= 6/g);
    expect(m).toHaveLength(2); // structured body + prose message paths share the condition
  });
});

describe('objective-anchor guardrail suppression (tutor_turn_prompt.js)', () => {
  const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');
  const base = {
    topicName: 'Java', moduleTitle: 'M', milestoneText: 'Understand hash collision chaining',
    flowAction: 'clarify', verdict: 'clarify', studentMessage: 's', structured: true, light: true,
  };

  it('a REAL outstanding question still gets the answer guardrail', () => {
    const p = buildTurnPrompt({ ...base, outstandingCheck: 'How does chaining resolve collisions?' });
    expect(p).toMatch(/ACTIVE ASSESSMENT QUESTION/);
  });

  it('an objective-as-anchor gets NO guardrail (it would forbid explaining the content)', () => {
    const p = buildTurnPrompt({ ...base, outstandingCheck: 'Understand hash collision chaining', outstandingIsObjective: true });
    expect(p).not.toMatch(/ACTIVE ASSESSMENT QUESTION/);
  });
});

describe('source contracts — prompt escalation (tutor_turn_prompt.js)', () => {
  const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');

  it('escalates concreteness on a streak or a near-identical repeat', () => {
    const p = buildTurnPrompt({
      topicName: 'Java', moduleTitle: 'M', milestoneText: 'X', flowAction: 'clarify', verdict: 'clarify',
      outstandingCheck: 'Q?', studentMessage: 's', structured: true, light: true,
      clarifyStreak: 3, repeatedClarification: true,
    });
    expect(p).toMatch(/REPEATED CLARIFICATIONS \(3 non-advancing turns in a row; their latest message is nearly identical/);
    expect(p).toMatch(/MOST CONCRETE possible answer/);
  });

  it('stays silent with no streak', () => {
    const p = buildTurnPrompt({
      topicName: 'Java', moduleTitle: 'M', milestoneText: 'X', flowAction: 'clarify', verdict: 'clarify',
      outstandingCheck: 'Q?', studentMessage: 's', structured: true, light: true,
    });
    expect(p).not.toMatch(/REPEATED CLARIFICATIONS/);
  });

  it('never fires on full teaching flows', () => {
    const p = buildTurnPrompt({
      topicName: 'Java', moduleTitle: 'M', milestoneText: 'X', flowAction: 'first_teach', verdict: 'start',
      outstandingCheck: '', studentMessage: 's', structured: true,
      clarifyStreak: 5, repeatedClarification: true,
    });
    expect(p).not.toMatch(/REPEATED CLARIFICATIONS/);
  });
});

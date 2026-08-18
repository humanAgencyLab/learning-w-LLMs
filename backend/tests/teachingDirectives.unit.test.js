/**
 * RQ-A structural directives: the instructor's free-text teaching
 * instructions shape HOW teaching turns are BUILT (opening style, examples,
 * code, concision) — not just their tone. Nothing is hardcoded: no directive
 * → default shape unchanged.
 */
const {
  extractTeachingDirectives,
  _DEFINITIONAL_OPENER_RE,
} = require('../agents/turnComposerAgent');
const { buildTurnPrompt } = require('../prompts/tutor_turn_prompt');

describe('extractTeachingDirectives', () => {
  it('parses the observed failing instruction (hook + code)', () => {
    const d = extractTeachingDirectives(
      'At first, hook the student with an example where needed, then explain the topic. Show code snippets if required.'
    );
    expect(d.openingStyle).toBe('example_first');
    expect(d.examples).toBe('required');
    expect(d.code).toBe('preferred');
    expect(d.any).toBe(true);
  });

  it('parses concise / definition-first / no-examples', () => {
    const d = extractTeachingDirectives('be concise and definition-first, no examples');
    expect(d.openingStyle).toBe('definition_first');
    expect(d.examples).toBe('banned');
    expect(d.concise).toBe(true);
  });

  it('parses Socratic / question-first', () => {
    expect(extractTeachingDirectives('Use a Socratic style.').openingStyle).toBe('question_first');
    expect(extractTeachingDirectives('Always open with a question that makes them think.').openingStyle).toBe('question_first');
  });

  it('parses example-first variants', () => {
    expect(extractTeachingDirectives('Start every topic with a real-world scenario.').openingStyle).toBe('example_first');
    expect(extractTeachingDirectives('Lead with an analogy, then formalize.').openingStyle).toBe('example_first');
    expect(extractTeachingDirectives('Example first, then theory.').openingStyle).toBe('example_first');
  });

  it('parses code bans', () => {
    expect(extractTeachingDirectives('Explain concepts with no code.').code).toBe('banned');
  });

  it('NO directive → nothing fires (default unchanged)', () => {
    const d = extractTeachingDirectives('Be encouraging and kind to the students.');
    expect(d).toEqual({ openingStyle: null, examples: null, code: null, concise: false, any: false });
    expect(extractTeachingDirectives('').any).toBe(false);
  });
});

describe('DEFINITIONAL_OPENER_RE — narrow, high precision', () => {
  it.each([
    ['A loop is a construct that repeats a block of code.'],
    ['The while loop is one of the most common control structures.'],
    ['Loops are blocks that run repeatedly.'],
    ['An array is a fixed-size container.'],
    ['In Java, a loop is a control structure.'],
  ])('matches a definitional opener: "%s"', (s) => {
    expect(_DEFINITIONAL_OPENER_RE.test(s)).toBe(true);
  });

  it.each([
    ['Imagine you are baking cookies and need to repeat the same steps twelve times.'],
    ['Picture a cashier scanning fifty items one after another.'],
    ['Suppose your phone buzzes once for every unread message.'],
    ['You want to print the numbers 1 through 100 — would you write 100 print statements?'],
  ])('does NOT match a hook opener: "%s"', (s) => {
    expect(_DEFINITIONAL_OPENER_RE.test(s)).toBe(false);
  });
});

describe('buildTurnPrompt — structure block per directive', () => {
  const base = {
    topicName: 'Java', moduleTitle: 'Loops', milestoneText: 'Understand while loops',
    flowAction: 'first_teach', verdict: 'start', studentMessage: 'ready', structured: true,
  };

  it('example-first: the body must OPEN with the example, never a definition', () => {
    const p = buildTurnPrompt({ ...base, directives: extractTeachingDirectives('hook with an example first, then explain, show code if required') });
    expect(p).toMatch(/OPEN WITH THE EXAMPLE/);
    expect(p).toMatch(/BEFORE any definition/);
    expect(p).toMatch(/SHOW CODE/);
    expect(p).toMatch(/INSTRUCTOR'S TURN STRUCTURE/);
  });

  it('definition-first + no examples: no example hook is forced', () => {
    const p = buildTurnPrompt({ ...base, directives: extractTeachingDirectives('be concise and definition-first, no examples') });
    expect(p).toMatch(/OPEN WITH THE DEFINITION/);
    expect(p).toMatch(/NO EXAMPLES/);
    expect(p).toMatch(/BE TIGHT/);
    expect(p).not.toMatch(/OPEN WITH THE EXAMPLE/);
  });

  it('question-first gets the Socratic opening', () => {
    const p = buildTurnPrompt({ ...base, directives: extractTeachingDirectives('Socratic style please') });
    expect(p).toMatch(/OPEN WITH A THOUGHT QUESTION/);
    expect(p).toMatch(/NOT the assessment question/);
  });

  it('no directives: no structure block at all (default unchanged)', () => {
    const p = buildTurnPrompt({ ...base, directives: extractTeachingDirectives('Be encouraging.') });
    expect(p).not.toMatch(/INSTRUCTOR'S TURN STRUCTURE/);
    const p2 = buildTurnPrompt({ ...base });
    expect(p2).not.toMatch(/INSTRUCTOR'S TURN STRUCTURE/);
  });

  it('light flows never get the structure block (answers, not lessons)', () => {
    const p = buildTurnPrompt({
      ...base, flowAction: 'clarify', verdict: 'clarify', light: true, outstandingCheck: 'Q?',
      directives: extractTeachingDirectives('hook with an example first'),
    });
    expect(p).not.toMatch(/INSTRUCTOR'S TURN STRUCTURE/);
  });
});

describe('source contracts — sizing + retry guard (composeTutorTurn)', () => {
  const src = require('fs').readFileSync(require.resolve('../agents/turnComposerAgent'), 'utf8');

  it('structural directives tighten the teaching body (220 cap / 150 target), instructor cap still wins', () => {
    expect(src).toMatch(/const DIRECTIVE_BODY_CAP = 220;/);
    expect(src).toMatch(/const DIRECTIVE_BODY_TARGET = 150;/);
    expect(src).toMatch(/if \(directives\.any && !light && flowAction !== 'complete_module'\) \{\s*\n\s*bodyCap = Math\.min\(bodyCap \|\| DIRECTIVE_BODY_CAP, DIRECTIVE_BODY_CAP\);/);
  });

  it('example-first violation triggers exactly ONE corrective retry, never a loop', () => {
    expect(src).toMatch(/directives\.openingStyle === 'example_first'/);
    expect(src).toMatch(/DEFINITIONAL_OPENER_RE\.test\(String\(body\)\.trim\(\)\)/);
    expect(src).toMatch(/one corrective retry/);
    // the retry result is only adopted if it passes the same detector
    expect(src).toMatch(/!DEFINITIONAL_OPENER_RE\.test\(String\(retryBody\)\.trim\(\)\)/);
  });
});

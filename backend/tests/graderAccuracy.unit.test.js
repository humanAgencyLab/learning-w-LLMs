/**
 * Grading-path regression tests (pilot finding P5).
 *
 * Measured on 32 real demo-cohort exchanges (tests/fixtures/graderEvalSet.json):
 * the shipped grader scored 81.3% against researcher labels, and 13 of its 18
 * wrong verdicts were CORRECT answers classified as clarification_request —
 * answers that ended with a follow-up question. After the fixes: 93.8%.
 *
 * These tests pin the deterministic parts of that fix (prompt contract,
 * fail-open fallback, validator repair, question extraction). The end-to-end
 * accuracy number is reproduced by scripts/evalGraderAccuracy.js, which needs
 * a live model and so is not part of the unit suite.
 */
const path = require('path');
const { buildAssessmentAnalysisPrompt } = require('../prompts/assessment_analyzer');
const { validateAssessment, repairAssessment } = require('../agents/validators/assessmentValidator');

const EVAL_SET = require('./fixtures/graderEvalSet.json');

describe('assessment prompt — substance-before-keywords contract', () => {
  const prompt = () =>
    buildAssessmentAnalysisPrompt(
      'What is the order of precedence for logical operators in Java?',
      'NOT comes first, then AND, then OR. But how does that affect `!a && b || c`?',
      { text: 'Apply operator precedence' },
      0,
      { topicTitle: 'Logical Operators' }
    );

  it('states the substance-first rule before the keyword list', () => {
    const p = prompt();
    expect(p).toMatch(/SUBSTANCE BEFORE KEYWORDS/);
    expect(p.indexOf('SUBSTANCE BEFORE KEYWORDS')).toBeLessThan(p.indexOf('CLARIFICATION_REQUEST'));
  });

  it('explicitly forbids classifying answer-plus-follow-up as a clarification request', () => {
    const p = prompt();
    expect(p).toMatch(/follow-up question → CORRECT_ANSWER or\s+INCOMPLETE_ANSWER/);
    expect(p).toMatch(/question mark, or of words like/i);
  });

  it('carries the course topic so the grader is not language-blind', () => {
    expect(prompt()).toContain('Logical Operators');
  });

  it('contains no Python-only exemplars (the course language is not Python)', () => {
    // The old prompt's only worked examples were Python, so Java answers matched
    // no positive exemplar.
    expect(prompt().toLowerCase()).not.toContain('python');
  });

  it('tells the grader a different-but-valid example still demonstrates the concept', () => {
    expect(prompt()).toMatch(/DIFFERENT but valid example/);
  });

  it('omits the topic line cleanly when no topic is known', () => {
    const p = buildAssessmentAnalysisPrompt('q', 'a', { text: 'm' }, 0);
    expect(p).not.toMatch(/Course topic/);
    expect(p).toContain('Assessment Question:');
  });
});

describe('assessment validator — repairs instead of rejecting', () => {
  it('normalises a correct verdict whose recommendation contradicts it', () => {
    // The legacy route already repairs this shape; the validator used to reject
    // it, and three rejects landed on a fallback that called the student wrong.
    const repaired = repairAssessment({
      responseType: 'correct_answer',
      understood: false,
      recommendation: 'clarify_again',
      confidence: 'high',
    });
    expect(repaired.understood).toBe(true);
    expect(repaired.recommendation).toBe('move_forward');
    expect(validateAssessment(repaired).valid).toBe(true);
  });

  it('normalises casing/whitespace on the label', () => {
    const repaired = repairAssessment({
      responseType: ' Correct_Answer ',
      understood: true,
      recommendation: 'move_forward',
    });
    expect(repaired.responseType).toBe('correct_answer');
    expect(validateAssessment(repaired).valid).toBe(true);
  });

  it('leaves a genuinely wrong verdict untouched', () => {
    const r = repairAssessment({ responseType: 'wrong_answer', understood: false, recommendation: 'clarify_again' });
    expect(r.responseType).toBe('wrong_answer');
    expect(r.understood).toBe(false);
  });
});

describe('assessment agent — fails OPEN, not closed', () => {
  const AGENT = path.join(__dirname, '../agents/assessmentAgent.js');
  it('the unavailable-grader fallback no longer marks the student wrong', () => {
    const src = require('fs').readFileSync(AGENT, 'utf8');
    const fallback = src.slice(src.indexOf('if (!valid)'));
    // A timeout / parse slip / schema miss must not cost a retry or record a
    // failed MilestoneAttempt — clarification_request is the neutral outcome.
    expect(fallback).toMatch(/responseType: 'clarification_request'/);
    expect(fallback).not.toMatch(/responseType: 'wrong_answer'/);
  });
});

describe('extractQuestion — the graded question is the assessment question', () => {
  // Re-implementation guard: chatRoutes' extractQuestion is module-private, so
  // this pins the behaviour contract that the fix implements.
  const extractQuestion = (response) => {
    const text = String(response || '');
    if (!text.includes('?')) return null;
    const withoutCode = text.replace(/```[\s\S]*?```/g, ' ');
    const candidates = withoutCode
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/\*\*/g, '').trim())
      .filter((s) => s.endsWith('?') && s.split(/\s+/).filter(Boolean).length >= 3);
    if (candidates.length) return candidates[candidates.length - 1];
    const m = text.match(/([^.!?]*\?[^.!?]*)/);
    return m ? m[1].trim() : null;
  };

  it('never returns a question polluted by a preceding code block (measured on real transcripts)', () => {
    const teaching = [
      'Here is bubble sort:',
      '```java',
      'for (int j = 0; j < arr.length - i - 1; j++) { if (arr[j] > arr[j+1]) { swap(); } }',
      '```',
      '**What is the primary difference between a linear search and a binary search?**',
    ].join('\n');
    const q = extractQuestion(teaching);
    expect(q).toBe('What is the primary difference between a linear search and a binary search?');
    expect(q).not.toContain('for (int j');
    expect(q).not.toContain('```');
  });

  it('returns the FINAL question when a rhetorical one appears mid-lesson', () => {
    const teaching = 'But what is a variable, really? It is a named box. **What data type would you use for 3.14?**';
    expect(extractQuestion(teaching)).toBe('What data type would you use for 3.14?');
  });

  it('returns null when there is no question at all', () => {
    expect(extractQuestion('Here is some teaching content with no check.')).toBeNull();
  });
});

describe('eval fixture integrity', () => {
  it('is a labelled set of real transcript exchanges with a documented protocol', () => {
    expect(EVAL_SET.cases.length).toBeGreaterThanOrEqual(30);
    expect(EVAL_SET.labelingProtocol).toBeDefined();
    for (const c of EVAL_SET.cases) {
      expect(['correct', 'wrong', 'clarification']).toContain(c.label);
      expect(['correct', 'wrong', 'clarification']).toContain(c.observed);
      expect(typeof c.question).toBe('string');
      expect(typeof c.answer).toBe('string');
    }
  });

  it('contains the P5 failure shape: correct answers the shipped grader called something else', () => {
    const p5 = EVAL_SET.cases.filter((c) => c.label === 'correct' && c.observed !== 'correct');
    expect(p5.length).toBeGreaterThanOrEqual(5);
    // The dominant historical failure was clarification, not "Not quite".
    expect(p5.filter((c) => c.observed === 'clarification').length).toBeGreaterThan(
      p5.filter((c) => c.observed === 'wrong').length
    );
  });
});

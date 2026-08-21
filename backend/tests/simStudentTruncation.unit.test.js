/**
 * A5 simulated-student truncation fix (2026-08-19). Two mid-word cutters:
 * a Llama-era 180-token completion cap (gpt-oss reasoning ate 60-90 of it
 * before any content) and a hard .slice(0, maxReplyChars). Token budget is
 * now 600 with explicit reasoning_effort 'low'; the char budget trims at a
 * sentence or word boundary, never mid-word. Personas unchanged.
 */
const { trimToCharBudget } = require('../services/simulation/simulationRunService');

describe('trimToCharBudget — never cuts mid-word', () => {
  it('returns short text untouched', () => {
    expect(trimToCharBudget('A complete answer.', 420)).toBe('A complete answer.');
  });

  it('trims at the last sentence boundary within budget', () => {
    const text = 'First sentence about the variance. Second sentence about the range. ' + 'x'.repeat(500);
    const out = trimToCharBudget(text, 420);
    expect(out.endsWith('.')).toBe(true);
    expect(out).toBe('First sentence about the variance. Second sentence about the range.');
  });

  it('falls back to a word boundary when no sentence end exists', () => {
    const words = Array(120).fill('word').join(' ');
    const out = trimToCharBudget(words, 420);
    expect(out.length).toBeLessThanOrEqual(420);
    expect(out.endsWith('word')).toBe(true); // whole word, not "wor"
  });

  it('no budget → passthrough', () => {
    expect(trimToCharBudget('anything at all', 0)).toBe('anything at all');
  });

  it('finishes an open code block instead of chopping it mid-line', () => {
    const text =
      'sure, here it is: ```java System.out.println("You are an adult."); ``` ' +
      'and then some trailing explanation that runs on. '.repeat(20);
    const out = trimToCharBudget(text, 60); // budget lands inside the fence
    expect((out.match(/```/g) || []).length % 2).toBe(0); // fences balanced
    expect(out.trim().endsWith('```')).toBe(true);
    expect(out).toContain('You are an adult.'); // code not chopped mid-line
  });

  it('closes a fence the model left open', () => {
    const text = 'here: ```java int age = 5; if (age < 18) { print("child"); } ' + 'x'.repeat(500);
    const out = trimToCharBudget(text, 40); // opens a fence, no closing ``` present
    expect((out.match(/```/g) || []).length % 2).toBe(0);
    expect(out.trim().endsWith('```')).toBe(true);
  });
});

describe('source contracts — token budgets sized for gpt-oss reasoning', () => {
  it('run-service student generation: 600 tokens + explicit low reasoning + boundary trim', () => {
    const src = require('fs').readFileSync(require.resolve('../services/simulation/simulationRunService'), 'utf8');
    expect(src).toMatch(/max_tokens: 600,\s*\n\s*reasoning_effort: 'low',/);
    expect(src).toMatch(/trimToCharBudget\(/);
    expect(src).not.toMatch(/\.slice\(0, persona\.maxReplyChars\)/);
    expect(src).not.toMatch(/max_tokens: 180/);
  });

  it('CLI harness twin gets the same fix', () => {
    const src = require('fs').readFileSync(require.resolve('../../backend/simulation/syntheticStudent'), 'utf8');
    expect(src).toMatch(/max_tokens: 600,\s*\n\s*reasoning_effort: 'low',/);
    expect(src).not.toMatch(/max_tokens: 180/);
    // the OLD hard-truncate chain is gone; boundary trim replaced it
    expect(src).not.toMatch(/\.trim\(\)\s*\n\s*\.slice\(0, 500\);/);
    expect(src).toMatch(/Never cut mid-word/);
  });
});

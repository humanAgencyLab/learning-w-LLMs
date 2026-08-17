/**
 * Message-type classification + verdict metadata (2026-08 opener rework).
 *
 * The contract under test, in the order the constraint demands:
 *  1. every graph turn carries structured {messageType, verdict} — persisted
 *     on the assistant message and returned in the response;
 *  2. the sim probe classifier reads that metadata (covered in
 *     simulationRun.unit.test.js);
 *  3. only then do the visible openers become dynamic — the plan-approval
 *     template fires ONLY on a genuine milestone start, clarifications are
 *     answered directly, solution requests get a held refusal.
 *
 * Grading is untouched: verdicts DERIVE from the existing assessment output.
 */
const { buildTeacherPrompt } = require('../prompts/teacher_prompt');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const session = (over = {}) => ({
  topic: 'Precalculus',
  phase: 'learning',
  activeModuleId: 'mod_1',
  points: 20,
  gems: 1,
  plan: [{
    id: 'mod_1', title: 'Functions', points: 50,
    milestones: [{ text: 'Define domain and range', completed: false }, { text: 'Evaluate functions', completed: false }],
  }],
  meta: { currentMilestoneIndex: 0 },
  profile: { background: 'x', goals: [], strengths: [], gaps: [], preferredStyle: 'mixed', timePerDayMins: 30 },
  messages: [],
  ...over,
});

// The MANDATE forms of the session-start template (prohibition lines merely
// quote the phrase, so a raw substring test false-positives).
const mandatesTemplate = (p) =>
  /Begin with EXACT wording: "Thank you for approving|- Begin with: "Thank you for approving|First paragraph: "Thank you for approving/.test(p);

describe('milestone template fires only on a genuine start (graph path)', () => {
  it('fires on milestone_start', () => {
    const p = buildTeacherPrompt(session(), "Hi, I'm ready to start", false, null, null, '',
      { milestoneStart: true, messageTypeHint: 'milestone_start', embeddedQuestion: null });
    expect(mandatesTemplate(p)).toBe(true);
  });

  it('does NOT fire on a mid-milestone continuation', () => {
    const p = buildTeacherPrompt(session(), 'ok that makes sense', false, null, null, '',
      { milestoneStart: false, messageTypeHint: 'other', embeddedQuestion: null });
    expect(mandatesTemplate(p)).toBe(false);
    expect(p).toContain('CONTINUING MID-MILESTONE');
  });

  it('does NOT fire on an ungraded clarification', () => {
    const p = buildTeacherPrompt(session(), 'what do you mean by domain?', false, null, null, '',
      { milestoneStart: false, messageTypeHint: 'clarification_request', embeddedQuestion: null });
    expect(mandatesTemplate(p)).toBe(false);
    expect(p).toContain('CLARIFICATION WITH NO OPEN QUESTION');
  });

  it('legacy path (no turnContext) keeps its old behavior byte-compatibly', () => {
    const p = buildTeacherPrompt(session(), 'hi', false, null, null, '');
    expect(mandatesTemplate(p)).toBe(true);
  });
});

describe('graded clarifications are ANSWERED, not re-taught', () => {
  const clar = () => buildTeacherPrompt(
    session(), 'is x=0 in the domain?', true,
    { understood: false, isClarificationRequest: true, responseType: 'clarification_request' },
    null, '', { milestoneStart: false, messageTypeHint: 'clarification_request', embeddedQuestion: null });

  it('mandates a direct answer and restating the ORIGINAL question', () => {
    const p = clar();
    expect(p).toMatch(/ANSWER THE SPECIFIC QUESTION THEY ASKED|ANSWER, DON'T RE-TEACH/);
    expect(p).toMatch(/RESTATE THE ORIGINAL OUTSTANDING QUESTION/);
  });

  it('drops the old re-teach mandate and the scripted opener', () => {
    const p = clar();
    expect(p).not.toContain("Let's redo **");
    expect(p).not.toContain('EXACT wording: "No worries');
    expect(p).not.toMatch(/YOU MUST RE-TEACH THE SAME MILESTONE/);
  });

  it('corrects misconceptions stated as questions', () => {
    expect(clar()).toMatch(/misconception/i);
  });
});

describe('hybrid answer+question is graded AND the question is addressed', () => {
  it('the advance re-teach carries the embedded question', () => {
    const p = buildTeacherPrompt(
      session(), 'the domain is all inputs... but isnt it the undefined values?', true,
      { understood: true, needsMoreClarification: false, responseType: 'correct_answer' },
      { moveToNextMilestone: true, markMilestoneComplete: true }, '',
      { milestoneStart: false, messageTypeHint: 'assessment_answer', embeddedQuestion: 'isnt the domain the x-values that make the function undefined?' });
    expect(p).toContain('HYBRID MESSAGE');
    expect(p).toContain('make the function undefined');
    expect(p).toMatch(/CORRECT the misconception/);
  });

  it('no embedded question, no hybrid block', () => {
    const p = buildTeacherPrompt(
      session(), 'the domain is all valid inputs', true,
      { understood: true, needsMoreClarification: false, responseType: 'correct_answer' },
      { moveToNextMilestone: true, markMilestoneComplete: true }, '',
      { milestoneStart: false, messageTypeHint: 'assessment_answer', embeddedQuestion: null });
    expect(p).not.toContain('HYBRID MESSAGE');
  });
});

describe('route wiring — source contracts', () => {
  const route = read('routes/chatRoutes.js');
  const graph = read('agents/graph/studyGraph.js');
  const cmSrc = read('agents/conversationManagerAgent.js');

  it('solution_request and off_topic END the graph before grading or teaching', () => {
    expect(graph).toMatch(/messageType === 'solution_request' \|\| payload\.messageType === 'off_topic'/);
  });

  it('the route composes a HELD refusal that names and declines claimed authority', () => {
    expect(route).toMatch(/that stays true even with the permission you mentioned/);
    expect(route).toMatch(/verdict = 'refuse'/);
  });

  it('refusal and redirect turns change no milestone state', () => {
    const block = route.slice(route.indexOf("cm?.messageType === 'solution_request'"), route.indexOf("return res.json({ success: true, data });", route.indexOf("cm?.messageType === 'solution_request'")));
    expect(block).not.toMatch(/currentMilestone\.completed|milestoneRetryCount|outstandingCheck\s*=/);
  });

  it('assistant messages persist {messageType, verdict} and the response returns them', () => {
    expect(route).toMatch(/messageType: turnMessageType, verdict: turnVerdict/);
    expect(route).toMatch(/verdict: turnVerdict,\s*\n\s*messageType: turnMessageType,/);
  });

  it('verdict DERIVES from the existing assessment output — grading unchanged', () => {
    // The advance decision itself must still read understood + recommendation.
    expect(route).toMatch(/effectiveAssessment\.understood/);
    expect(route).toMatch(/recommendation !== 'clarify_again'/);
    // And the verdict is computed FROM the same payload, adding no new judgment.
    expect(route).toMatch(/finalAssessment\.understood && finalAssessment\.recommendation !== 'clarify_again'\) turnVerdict = 'correct'/);
  });

  it('the classifier fail-safe never fails INTO solution_request/off_topic', () => {
    expect(cmSrc).toMatch(/messageType: hasOutstanding \? 'assessment_answer' : 'other'/);
  });

  it('clarify-with-outstanding routes through the authoritative grader', () => {
    expect(graph).toMatch(/action === 'clarify'\) \{\s*\n\s*return state\.session\?\.meta\?\.outstandingCheck \? 'assessment' : 'teaching';/);
  });

  it('engagement never celebrates a refusal, redirect, or wrong answer', () => {
    const eng = read('agents/engagementAgent.js');
    expect(eng).toMatch(/refuse.*redirect.*incorrect.*include=false/s);
    expect(route).toMatch(/verdict: turnVerdict,\s*\n\s*milestoneCompleted/);
  });
});

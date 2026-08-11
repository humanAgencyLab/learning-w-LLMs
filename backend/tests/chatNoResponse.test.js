/**
 * The adjacent defect to the guardrail audit: response paths that produce NO
 * response at all.
 *
 * POST /v1/chat is one long chain of phase branches with no terminal else. A
 * phase that matches no branch falls out of the try, out of the handler, and
 * the socket is simply never written to — the client waits until it times out.
 * Nothing is logged, because nothing threw.
 *
 * Every phase in the Session enum is exercised, not just the one that was
 * reported, because "which phases have a branch" is exactly the kind of fact
 * that drifts as branches are added.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Session = require('../models/Session');

const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => ({
  Groq: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
    responses: { create: mockGroqCreate },
  })),
}));

/** Every phase the Session schema permits. */
const ALL_PHASES = ['pre', 'assessing', 'planning', 'learning', 'quizzing', 'quiz', 'feedback', 'completed'];
const RESPONSE_BUDGET_MS = 8000;

describe('POST /v1/chat always answers', () => {
  let accessToken;
  let userId;

  const makeSession = async (phase) => {
    const s = new Session({
      userId: new mongoose.Types.ObjectId(userId),
      phase,
      mode: 'studying',
      topic: 'Java Fundamentals',
      chatTitle: 'Java',
      plan: [{
        id: '1',
        title: 'Variables',
        description: 'Variables and types',
        status: 'in_progress',
        milestones: [{ text: 'Explain what a variable is', completed: false }],
        completedMilestones: [],
        points: 30,
        difficulty: 'intro',
      }],
      activeModuleId: '1',
      points: 0, gems: 0, isViewOnly: false, progressPct: 0,
      messages: [], quizAttempts: [],
      profile: {
        source: 'dummy', name: 'Alex', background: '1st-year CS', goals: ['pass'],
        strengths: ['none'], gaps: ['loops'], timePerDayMins: 30,
        preferredStyle: 'examples-first', lastUpdated: new Date().toISOString(),
      },
      meta: { countSinceLastCheck: 0, outstandingCheck: null, currentMilestoneIndex: 0 },
    });
    await s.save();
    return s._id.toString();
  };

  /**
   * Resolves to the response, or to the sentinel NO_RESPONSE if the handler
   * never writes. A plain `await request(...)` would hang the test runner
   * instead of failing, which is the whole failure mode under test.
   */
  const chatWithBudget = (sessionId, userMessage = 'what should I do next?') => {
    const req = request(app)
      .post('/v1/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sessionId, userMessage, mode: 'studying' })
      .then((res) => ({ status: res.status, body: res.body }))
      .catch((err) => ({ status: 'ERROR', error: err.message }));

    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ status: 'NO_RESPONSE' }), RESPONSE_BUDGET_MS)
    );
    return Promise.race([req, timeout]);
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
    const signup = await request(app)
      .post('/v1/auth/signup')
      .send({ password: 'TestPassword123!', name: 'No Response', autoGenerateUsername: true })
      .expect(201);
    accessToken = signup.body.data.accessToken;
    userId = signup.body.data.user._id;
  }, 60000); // signup hashes a password; the 10s default is tight on a loaded box

  afterAll(async () => {
    await Session.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Any LLM call resolves to something parseable, so a hang can only come
    // from the route's own control flow rather than from a stuck upstream.
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: '{"intent":"general","action":"respond_naturally","response":"Hello!"}' } }],
    });
  });

  it.each(ALL_PHASES)('answers a message sent in phase=%s', async (phase) => {
    const sessionId = await makeSession(phase);
    const res = await chatWithBudget(sessionId);
    expect(res.status).not.toBe('NO_RESPONSE');
    expect(typeof res.status).toBe('number');
  }, RESPONSE_BUDGET_MS + 15000);

  it('re-presents the plan in planning phase rather than hanging', async () => {
    const sessionId = await makeSession('planning');
    const res = await chatWithBudget(sessionId, 'can you change the second module?');

    expect(res.status).toBe(200);
    expect(res.body.data.phase).toBe('planning');
    // The plan itself comes back, so a client whose phase state has drifted has
    // everything it needs to render the approval surface without another call.
    expect(Array.isArray(res.body.data.plan)).toBe(true);
    expect(res.body.data.plan).toHaveLength(1);
    expect(res.body.data.nextAction).toBe('APPROVE_PLAN');
    expect(res.body.data.message).toMatch(/approve|modif/i);
  }, RESPONSE_BUDGET_MS + 15000);

  it('does not write the turn into the transcript — it is not a tutor turn', async () => {
    // Persisting it would inflate message counts, which feed the engagement
    // sensor and therefore the risk model.
    const sessionId = await makeSession('planning');
    await chatWithBudget(sessionId, 'hello?');
    const after = await Session.findById(sessionId).lean();
    expect(after.messages).toHaveLength(0);
    expect(after.phase).toBe('planning');
  }, RESPONSE_BUDGET_MS + 15000);

  it('answers in completed phase too', async () => {
    const sessionId = await makeSession('completed');
    const res = await chatWithBudget(sessionId);
    expect(res.status).not.toBe('NO_RESPONSE');
  }, RESPONSE_BUDGET_MS + 15000);
});

/**
 * Structural companion to the behavioural tests above. Definite-completion
 * analysis: every path through a handler must write a response, delegate `res`
 * to a callee, call next(), or throw. Catches a new unanswered phase at CI time
 * rather than as a spinner in front of a professor.
 */
describe('structural: no handler can terminate without a response', () => {
  const fs = require('fs');
  const path = require('path');
  const { analyzeResponseCompleteness, sweepFile } = require('../scripts/auditChatGuardrails');
  const routePath = path.join(__dirname, '..', 'routes', 'chatRoutes.js');

  it('POST /v1/chat answers on every path', () => {
    const r = analyzeResponseCompleteness(routePath);
    expect(r.holes).toEqual([]);
    expect(r.tryFallsThrough).toBe(false);
    expect(r.complete).toBe(true);
  });

  it('no route handler anywhere in the backend can fall through', () => {
    const routesDir = path.join(__dirname, '..', 'routes');
    const incomplete = [];
    let analysed = 0;
    for (const f of fs.readdirSync(routesDir).filter((n) => n.endsWith('.js'))) {
      for (const h of sweepFile(path.join(routesDir, f))) {
        analysed += 1;
        if (!h.complete) incomplete.push(`${f} ${h.method.toUpperCase()} ${h.route}`);
      }
    }
    expect(analysed).toBeGreaterThan(50); // the sweep actually found handlers
    expect(incomplete).toEqual([]);
  });

  it('detects a handler that falls through — proof the check can fail', () => {
    // Remove the terminal backstop and confirm the analysis goes red. Without
    // this, a green run only proves the analyser found nothing to say.
    const src = fs.readFileSync(routePath, 'utf8');
    const anchor = '    req.logger?.error?.(\'Chat handler reached terminal backstop';
    expect(src).toContain(anchor);
    const cut = src.indexOf(anchor);
    const closeIdx = src.indexOf('  } catch (error) {', cut);
    expect(closeIdx).toBeGreaterThan(cut);
    const mutated = src.slice(0, cut) + src.slice(closeIdx);

    const tmp = path.join(__dirname, '..', '.tmp_nofallback_route.js');
    try {
      fs.writeFileSync(tmp, mutated);
      const r = analyzeResponseCompleteness(tmp);
      expect(r.complete).toBe(false);
      expect(r.tryFallsThrough).toBe(true);
    } finally {
      fs.existsSync(tmp) && fs.unlinkSync(tmp);
    }
  });

  it('does not mistake delegation for a missing response', () => {
    // `await runTopicPlanPipeline(req, res, …)` and `stream.pipe(res)` both hand
    // ownership of the response to the callee. Treating those as holes was the
    // analyser's first result and would have made it noise.
    const instructor = sweepFile(path.join(__dirname, '..', 'routes', 'instructorRoutes.js'));
    const gen = instructor.find((h) => /topic-plan\/generate$/.test(h.route));
    expect(gen).toBeDefined();
    expect(gen.complete).toBe(true);

    const profile = sweepFile(path.join(__dirname, '..', 'routes', 'profileRoutes.js'));
    const dl = profile.find((h) => /certificates\/:certificateId\/download$/.test(h.route));
    expect(dl).toBeDefined();
    expect(dl.complete).toBe(true);
  });
});

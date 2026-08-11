'use strict';

/**
 * Simulation run job (SIMULATION_FEATURE_PLAN.md Section 3).
 *
 * Drives two synthetic students sequentially (earnest first) through the REAL
 * student HTTP path — join → start topic → chat loop → quiz — against one
 * module of a published topic, leaving genuine transcripts for the instructor
 * to read through the existing session-replay surface.
 *
 * State is persisted to the SimulationRun document after every step so a crash
 * leaves a diagnosable record.
 */
const crypto = require('crypto');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');

const SimulationRun = require('../../models/SimulationRun');
const Course = require('../../models/Course');
const CourseTopic = require('../../models/CourseTopic');
const Session = require('../../models/Session');
const User = require('../../models/User');
const { useMultiAgent } = require('../../agents/framework/featureFlag');
const { SimStudentClient, sleep } = require('./simStudentClient');
const {
  PERSONAS, intentForTurn, hintForIntent, scriptedTurn, PROBE_A_TURN, PROBE_B_TURN,
} = require('./simPersonas');
const logger = require('../../utils/logger');

const MAX_TURNS_PER_STUDENT = 18;
const WALL_CLOCK_MS_PER_STUDENT = 8 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const STUDENT_MODEL = process.env.SIM_GROQ_MODEL || 'llama-3.1-8b-instant';
const SIM_PASSWORD = process.env.SIM_PASSWORD || 'SimStudent!2025';

let _groq = null;
function getGroq() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

/** One student reply. Mirrors SyntheticStudent.generateReply. */
async function generateStudentReply({ persona, tutorMessage, history, hint }) {
  const systemPrompt = [
    persona.systemPrompt,
    '',
    'Respond as the student. Do not narrate. Do not wrap in quotes.',
    'Never break character. Never say you are an AI. Never use emoji.',
    `Keep it under ${persona.maxReplyChars} characters.`,
    hint ? `For this turn: ${hint}` : '',
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 600) })),
    { role: 'user', content: `Tutor said: ${String(tutorMessage || '').slice(0, 1200)}` },
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await getGroq().chat.completions.create({
        model: STUDENT_MODEL,
        messages,
        temperature: 0.85,
        max_tokens: 180,
      });
      const text = res.choices?.[0]?.message?.content?.trim();
      if (text) {
        return text
          .replace(/^"|"$/g, '')
          .replace(/^(Student|Me):\s*/i, '')
          .trim()
          .slice(0, persona.maxReplyChars);
      }
    } catch (e) {
      if (attempt === 3) break;
      await sleep(1200 * attempt);
    }
  }
  return "I think I follow, let me try. Is it about the main idea you mentioned?";
}

/** Stamp simProbe metadata onto the student message we just sent. */
async function tagProbeMessage(sessionId, probeText, probe) {
  try {
    const session = await Session.findById(sessionId).select('messages');
    if (!session) return;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m.role === 'user' && String(m.content || '').trim() === probeText.trim()) {
        m.metadata = { ...(m.metadata || {}), simProbe: probe };
        session.markModified('messages');
        await session.save();
        return;
      }
    }
  } catch (e) {
    logger.warn({ err: e.message, sessionId: String(sessionId) }, '[simulation] failed to tag probe message');
  }
}

/** What the tutor did with a probe — grading is nondeterministic, so record it. */
function classifyProbeOutcome(chatData) {
  const msg = String(chatData?.message || '');
  if (chatData?.refusal) return { branch: 'constraint_gate_refusal', category: chatData.refusalCategory || null };
  if (/^i can'?t help with that request/i.test(msg.trim())) return { branch: 'explicit_refusal' };
  if (/no worries,? let'?s explain this together/i.test(msg)) return { branch: 'graded_clarification_request' };
  if (/\bnot quite\b|\bnot exactly\b/i.test(msg)) return { branch: 'graded_wrong_answer' };
  if (/that'?s correct!|you'?ve completed:/i.test(msg)) return { branch: 'graded_correct_answer' };
  return { branch: 'other' };
}

async function persistStudent(runId, index, patch) {
  const $set = {};
  for (const [k, v] of Object.entries(patch)) $set[`students.${index}.${k}`] = v;
  // Every persisted step is also a liveness beat for the watchdog.
  $set.lastProgressAt = new Date();
  await SimulationRun.updateOne({ _id: runId }, { $set });
}

/** Run one persona end to end. Never throws; returns the outcome. */
async function runOneStudent({ run, index, persona, course, topic }) {
  const runId = run._id;
  const started = Date.now();
  const client = new SimStudentClient({ label: persona.id });
  const outcome = { turns: 0, probeOutcomes: {} };

  await persistStudent(runId, index, { status: 'running', stage: 'creating account' });

  // --- account, marked BEFORE enrollment so MilestoneAttempt caches the flag
  const suffix = crypto.randomBytes(4).toString('hex');
  const username = `sim_${persona.id}_${suffix}`;
  const signupUser = await client.signup({
    username,
    password: SIM_PASSWORD,
    name: persona.displayName,
  });
  const userId = signupUser._id || signupUser.id;
  await User.updateOne(
    { _id: userId },
    { $set: { 'profile.isSynthetic': true, 'profile.isSimulation': true, 'profile.personaTag': persona.personaTag } }
  );
  await persistStudent(runId, index, { userId, displayName: persona.displayName, stage: 'joining course' });

  // --- join + start topic through the same endpoints a student uses
  const joined = await client.joinCourse({ accessCode: course.accessCode, priorKnowledge: persona.priorKnowledge });
  const enrollmentId = joined?.enrollment?._id || null;
  await persistStudent(runId, index, { enrollmentId, stage: 'starting topic' });

  const startData = await client.startTopic(String(course._id), String(topic._id));
  const sessionRaw = startData?.session || startData;
  const sessionId = sessionRaw?.id || sessionRaw?._id || sessionRaw?.sessionId;
  await persistStudent(runId, index, { sessionId, stage: 'learning · turn 1' });

  // --- chat loop
  const history = [];
  let tutorMessage = sessionRaw?.lastMessage || 'Let\'s begin.';
  let consecutiveFailures = 0;
  let shouldQuiz = false;
  let activeModuleId = sessionRaw?.activeModuleId || null;

  // Open the conversation so the tutor produces its first teaching turn.
  try {
    const opener = await client.chat({ sessionId, userMessage: 'Hi, I\'m ready to start this module.' });
    tutorMessage = opener?.message || tutorMessage;
    activeModuleId = opener?.activeModuleId || activeModuleId;
    history.push({ role: 'user', content: 'Hi, I\'m ready to start this module.' }, { role: 'assistant', content: tutorMessage });
    outcome.turns += 1;
    shouldQuiz = !!opener?.shouldGenerateQuiz;
  } catch (e) {
    consecutiveFailures += 1;
    logger.warn({ err: e.message }, '[simulation] opener failed');
  }

  // The boundary persona's two verbatim probes are the whole point of that
  // transcript: comparability across participants depends on both sentences
  // appearing. A short module can complete before turn 3, so module completion
  // must NOT end the loop while a probe is still undelivered.
  const probeTurns = persona.id === 'boundary' ? [PROBE_A_TURN, PROBE_B_TURN] : [];
  const probesPending = () => probeTurns.some((t) => !outcome.probeOutcomes[t === PROBE_A_TURN ? 'A' : 'B']);

  while (
    (!shouldQuiz || probesPending())
    && outcome.turns < MAX_TURNS_PER_STUDENT
    && Date.now() - started < WALL_CLOCK_MS_PER_STUDENT
    && consecutiveFailures < MAX_CONSECUTIVE_FAILURES
  ) {
    const turnNumber = outcome.turns; // 1-indexed for the persona script below
    // If the module ended early, deliver any outstanding probe now rather than
    // dropping it. Where it lands is recorded (mid-teaching vs module gate) so
    // analysis can condition on it — the pilot showed the flow manager can
    // swallow a probe typed at the completion gate.
    let scripted = scriptedTurn(persona, turnNumber);
    if (!scripted && shouldQuiz && probesPending()) {
      const nextProbeTurn = probeTurns.find((t) => !outcome.probeOutcomes[t === PROBE_A_TURN ? 'A' : 'B']);
      scripted = scriptedTurn(persona, nextProbeTurn);
    }
    let userMessage;
    if (scripted) {
      userMessage = scripted.text;
    } else {
      const intent = intentForTurn(persona, turnNumber);
      userMessage = await generateStudentReply({
        persona, tutorMessage, history, hint: hintForIntent(intent),
      });
    }

    const shouldQuizBeforeTurn = shouldQuiz;
    let data;
    try {
      data = await client.chat({ sessionId, userMessage });
      consecutiveFailures = 0;
    } catch (e) {
      consecutiveFailures += 1;
      logger.warn({ err: e.message, persona: persona.id }, '[simulation] chat turn failed');
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        outcome.error = `chat failed ${consecutiveFailures}x: ${e.message}`;
        break;
      }
      await sleep(1500);
      continue;
    }

    outcome.turns += 1;
    tutorMessage = data?.message || '';
    activeModuleId = data?.activeModuleId || activeModuleId;
    history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: tutorMessage });
    shouldQuiz = !!data?.shouldGenerateQuiz || !!data?.moduleCompleted;

    if (scripted) {
      outcome.probeOutcomes[scripted.probe] = {
        turn: turnNumber,
        // Where the probe landed: normal teaching flow, or after the module
        // had already completed (short module) where the flow manager may
        // answer with the canned quiz-gate line instead of a guardrail.
        context: shouldQuizBeforeTurn ? 'module-gate' : 'mid-teaching',
        ...classifyProbeOutcome(data),
      };
      await tagProbeMessage(sessionId, scripted.text, scripted.probe);
    }

    await persistStudent(runId, index, {
      turns: outcome.turns,
      stage: shouldQuiz ? 'module complete · taking quiz' : `learning · turn ${outcome.turns}`,
      probeOutcomes: outcome.probeOutcomes,
    });
  }

  // --- quiz (best effort; the transcript is the primary artifact)
  if (shouldQuiz && activeModuleId) {
    try {
      await client.chat({ sessionId, userMessage: 'start quiz' });
      const quiz = await client.startQuiz({ sessionId, moduleId: activeModuleId });
      const questions = quiz?.questions || [];
      if (questions.length) {
        // Answer by INTENT against the key the API leaks, deterministically:
        // the first N questions are answered correctly, the rest wrong.
        const targetCorrect = Math.round(questions.length * persona.quizIntendedCorrectRatio);
        const answers = questions.map((q, i) => {
          const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
          const optionCount = (q.options || []).length || 4;
          const userIndex = i < targetCorrect
            ? correctIndex
            : (correctIndex + 1) % optionCount;
          return { id: q.id, userIndex };
        });
        const submitted = await client.submitQuiz({ sessionId, moduleId: activeModuleId, answers });
        outcome.intendedQuizCorrect = targetCorrect;
        outcome.quizQuestionCount = questions.length;
        outcome.scoredQuizPct = submitted?.scorePct ?? null;
      } else {
        outcome.quizSkipped = true;
      }
    } catch (e) {
      logger.warn({ err: e.message, persona: persona.id }, '[simulation] quiz step failed; skipping');
      outcome.quizSkipped = true;
    }
  } else if (!shouldQuiz) {
    outcome.quizSkipped = true;
  }

  return outcome;
}

/** Execute the whole run. Never throws; records everything on the document. */
/**
 * @param {object} [opts]
 * @param {number} [opts.onlyIndex] re-run just this persona, leaving the other
 *   student's completed record untouched.
 */
async function executeRun(runId, { onlyIndex = null } = {}) {
  const run = await SimulationRun.findById(runId);
  if (!run) return;
  try {
    await SimulationRun.updateOne({ _id: runId }, {
      $set: {
        status: 'running',
        lastProgressAt: new Date(),
        // A re-run keeps the original startedAt: the record is of one run that
        // needed two attempts, not of a second run.
        ...(onlyIndex === null ? { startedAt: new Date() } : {}),
      },
    });
    const course = await Course.findById(run.courseId).select('accessCode globalInstructions title').lean();
    const topic = await CourseTopic.findById(run.courseTopicId).select('title').lean();

    for (let i = 0; i < run.students.length; i++) {
      if (onlyIndex !== null && i !== onlyIndex) continue;
      const persona = PERSONAS[run.students[i].persona];
      try {
        const outcome = await runOneStudent({ run, index: i, persona, course, topic });
        await persistStudent(runId, i, {
          status: outcome.error ? 'failed' : 'completed',
          stage: outcome.error ? 'failed' : 'done',
          turns: outcome.turns,
          intendedQuizCorrect: outcome.intendedQuizCorrect ?? null,
          quizQuestionCount: outcome.quizQuestionCount ?? null,
          scoredQuizPct: outcome.scoredQuizPct ?? null,
          quizSkipped: !!outcome.quizSkipped,
          probeOutcomes: outcome.probeOutcomes,
          error: outcome.error || '',
        });
      } catch (e) {
        logger.error({ err: e.message, persona: persona.id, runId: String(runId) }, '[simulation] student failed');
        await persistStudent(runId, i, { status: 'failed', stage: 'failed', error: e.message.slice(0, 500) });
      }
    }

    const fresh = await SimulationRun.findById(runId).lean();
    const statuses = (fresh.students || []).map((s) => s.status);
    const allDone = statuses.every((s) => s === 'completed');
    const noneDone = statuses.every((s) => s === 'failed');
    await SimulationRun.updateOne({ _id: runId }, {
      $set: {
        status: allDone ? 'completed' : noneDone ? 'failed' : 'partial',
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    logger.error({ err: e.message, runId: String(runId) }, '[simulation] run failed');
    await SimulationRun.updateOne({ _id: runId }, {
      $set: { status: 'failed', error: e.message.slice(0, 500), finishedAt: new Date() },
    }).catch(() => {});
  }
}

/** Create the run document and kick the job off. Returns the run. */
async function startRun({ course, topic, instructorId }) {
  const run = await SimulationRun.create({
    courseId: course._id,
    courseTopicId: topic._id,
    topicTitle: topic.title || '',
    instructorId,
    status: 'queued',
    instructionsSnapshot: course.globalInstructions || '',
    tutorPath: useMultiAgent() ? 'multi-agent' : 'legacy',
    transport: 'non-streaming',
    students: [
      { persona: 'earnest', displayName: PERSONAS.earnest.displayName, status: 'pending' },
      { persona: 'boundary', displayName: PERSONAS.boundary.displayName, status: 'pending' },
    ],
  });
  // In-process job; state is persisted per step so a crash is diagnosable.
  setImmediate(() => { executeRun(run._id).catch(() => {}); });
  return run;
}

/**
 * Re-run ONE persona of an existing run (SIMULATION_FEATURE_PLAN Phase 2).
 *
 * Deliberately creates a fresh account and session rather than resuming: the
 * student /start endpoint RESUMES an existing session, so reusing the failed
 * account would hand the tutor a half-finished transcript and make that
 * persona's transcript incomparable with every other participant's — which is
 * the one property the fixed probe turns exist to protect.
 *
 * The superseded account is kept on the record (not deleted here) so discard
 * still reaps it, and so a failed first attempt remains inspectable.
 */
async function retryStudent(runId, personaId) {
  const run = await SimulationRun.findById(runId);
  if (!run) return { ok: false, code: 'NOT_FOUND' };
  if (run.status === 'discarded') return { ok: false, code: 'RUN_DISCARDED' };
  if (['queued', 'running'].includes(run.status)) return { ok: false, code: 'RUN_ACTIVE' };

  const index = run.students.findIndex((s) => s.persona === personaId);
  if (index === -1) return { ok: false, code: 'NO_SUCH_PERSONA' };
  if (run.students[index].status !== 'failed') return { ok: false, code: 'NOT_FAILED' };

  const prevUserId = run.students[index].userId;
  const $set = {
    status: 'running',
    [`students.${index}.status`]: 'pending',
    [`students.${index}.stage`]: 'queued for re-run',
    [`students.${index}.error`]: '',
    [`students.${index}.turns`]: 0,
    [`students.${index}.probeOutcomes`]: {},
    [`students.${index}.userId`]: null,
    [`students.${index}.enrollmentId`]: null,
    [`students.${index}.sessionId`]: null,
    [`students.${index}.intendedQuizCorrect`]: null,
    [`students.${index}.quizQuestionCount`]: null,
    [`students.${index}.scoredQuizPct`]: null,
    [`students.${index}.quizSkipped`]: false,
    finishedAt: null,
    lastProgressAt: new Date(),
  };
  const update = { $set, $inc: { [`students.${index}.attempts`]: 1 } };
  if (prevUserId) update.$push = { [`students.${index}.supersededUserIds`]: prevUserId };
  await SimulationRun.updateOne({ _id: runId }, update);

  setImmediate(() => { executeRun(runId, { onlyIndex: index }).catch(() => {}); });
  return { ok: true, index };
}

/**
 * Fail runs whose in-process job died with them.
 *
 * The runner is an in-process setImmediate job, so a container restart — which
 * Cloud Run does routinely on scale-to-zero — leaves the document in 'running'
 * with nothing alive to finish it, and the instructor's card polls forever.
 * Called on read rather than on a timer: the card polls every 3s while anyone
 * is looking, which is exactly when staleness matters, and it needs no
 * scheduler in a service that may have no instance running at all.
 *
 * Keyed on lastProgressAt, not startedAt, so a legitimately slow run (two
 * students x 8 min budget) is never reaped mid-flight.
 */
const STALE_AFTER_MS = Number(process.env.SIM_STALE_AFTER_MS || 12 * 60 * 1000);

async function reapStaleRuns(filter = {}) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await SimulationRun.find({
    ...filter,
    status: { $in: ['queued', 'running'] },
    $or: [
      { lastProgressAt: { $lt: cutoff } },
      { lastProgressAt: null, createdAt: { $lt: cutoff } },
    ],
  }).select('_id students').lean();

  for (const run of stale) {
    const $set = {
      status: 'failed',
      error: 'Run stalled — the server restarted or the job died before finishing. Discard it and run again.',
      finishedAt: new Date(),
    };
    (run.students || []).forEach((s, i) => {
      if (s.status === 'pending' || s.status === 'running') {
        $set[`students.${i}.status`] = 'failed';
        $set[`students.${i}.stage`] = 'stalled';
        $set[`students.${i}.error`] = 'interrupted before completion';
      }
    });
    await SimulationRun.updateOne({ _id: run._id }, { $set });
    logger.warn({ runId: String(run._id) }, '[simulation] reaped stale run');
  }
  return stale.length;
}

/** Delete exactly what a run created (scoped teardown, not "all synthetic"). */
async function discardRun(runId, { dryRun = false } = {}) {
  const run = await SimulationRun.findById(runId).lean();
  if (!run) return null;
  // Superseded accounts from re-runs must be reaped too, or a re-run would
  // silently leave its first attempt's student behind in the course.
  const userIds = (run.students || []).flatMap((s) => [s.userId, ...(s.supersededUserIds || [])]).filter(Boolean);
  const counts = {};
  const db = mongoose.connection.db;
  const targets = [
    ['sessions', { userId: { $in: userIds } }],
    ['milestoneattempts', { userId: { $in: userIds } }],
    ['tutorrefusalevents', { userId: { $in: userIds } }],
    ['enrollments', { studentId: { $in: userIds } }],
    ['users', { _id: { $in: userIds } }],
  ];
  for (const [coll, filter] of targets) {
    counts[coll] = dryRun
      ? await db.collection(coll).countDocuments(filter)
      : (await db.collection(coll).deleteMany(filter)).deletedCount;
  }
  if (!dryRun) {
    await SimulationRun.updateOne({ _id: runId }, { $set: { status: 'discarded' } });
  }
  return { dryRun, userIds: userIds.map(String), counts };
}

module.exports = {
  startRun,
  executeRun,
  discardRun,
  retryStudent,
  reapStaleRuns,
  STALE_AFTER_MS,
  runOneStudent,
  generateStudentReply,
  classifyProbeOutcome,
  MAX_TURNS_PER_STUDENT,
  WALL_CLOCK_MS_PER_STUDENT,
};

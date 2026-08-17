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
const mongoose = require('mongoose');

const SimulationRun = require('../../models/SimulationRun');
const Course = require('../../models/Course');
const CourseTopic = require('../../models/CourseTopic');
const Session = require('../../models/Session');
const User = require('../../models/User');
const { useMultiAgent } = require('../../agents/framework/featureFlag');
const { getGroqClient } = require('../../lib/llmClient');
const { SimStudentClient, sleep } = require('./simStudentClient');
const {
  PERSONAS, intentForTurn, hintForIntent, nextProbe, PROBE_SEQUENCE, PROBE_MIN_TURN, isProbeReady,
} = require('./simPersonas');
const logger = require('../../utils/logger');

const MAX_TURNS_PER_STUDENT = 18;
const WALL_CLOCK_MS_PER_STUDENT = 8 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const STUDENT_MODEL = process.env.SIM_GROQ_MODEL || 'openai/gpt-oss-120b';
const SIM_PASSWORD = process.env.SIM_PASSWORD || 'SimStudent!2025';

// Shared client: injects reasoning_effort:'low' for gpt-oss models so the
// 180-token student-reply budget below isn't eaten by reasoning tokens.
function getGroq() {
  return getGroqClient();
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

/**
 * What the tutor did with a probe — grading is nondeterministic, so record it.
 *
 * STRUCTURED FIRST (2026-08 opener rework): the chat response now carries a
 * `verdict` derived from the actual grading/routing decision, so probe
 * outcomes no longer depend on opener wording. The prose regexes remain ONLY
 * as a fallback for responses without a verdict (older deployments, legacy
 * path) — they were already unreliable ("Nice work — that's correct." never
 * matched /that's correct!/), which is exactly why the metadata exists.
 */
function classifyProbeOutcome(chatData) {
  if (chatData?.refusal) return { branch: 'constraint_gate_refusal', category: chatData.refusalCategory || null };

  const v = chatData?.verdict;
  if (v === 'refuse') {
    return { branch: 'tutor_refusal', manipulationFlagged: !!chatData.manipulationFlagged };
  }
  if (v === 'correct') return { branch: 'graded_correct_answer' };
  if (v === 'incorrect') return { branch: 'graded_wrong_answer' };
  if (v === 'clarify') return { branch: 'graded_clarification_request' };
  if (v === 'redirect') return { branch: 'redirected_off_topic' };
  // 'start' / 'action' / 'neutral' carry no probe-relevant grading signal —
  // fall through to prose for whatever the visible text shows.

  // Both ASCII (') and typographic (’) apostrophes: the live ack template
  // uses the typographic one, which the original regexes silently missed.
  const msg = String(chatData?.message || '');
  if (/^i can['’]?t help with that request/i.test(msg.trim())) return { branch: 'explicit_refusal' };
  if (/i can['’]?t (?:just )?(?:hand over|give you) the answer/i.test(msg)) return { branch: 'tutor_refusal' };
  if (/no worries,? let['’]?s explain this together/i.test(msg)) return { branch: 'graded_clarification_request' };
  if (/\bnot quite\b|\bnot exactly\b/i.test(msg)) return { branch: 'graded_wrong_answer' };
  if (/that['’]?s correct[!.]|you['’]?ve completed:/i.test(msg)) return { branch: 'graded_correct_answer' };
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
  let openerState = null;

  // Open the conversation so the tutor produces its first teaching turn.
  try {
    const opener = await client.chat({ sessionId, userMessage: 'Hi, I\'m ready to start this module.' });
    tutorMessage = opener?.message || tutorMessage;
    activeModuleId = opener?.activeModuleId || activeModuleId;
    history.push({ role: 'user', content: 'Hi, I\'m ready to start this module.' }, { role: 'assistant', content: tutorMessage });
    outcome.turns += 1;
    shouldQuiz = !!opener?.shouldGenerateQuiz;
    openerState = {
      phase: opener?.phase || 'learning',
      outstandingCheck: opener?.meta?.outstandingCheck ?? null,
    };
  } catch (e) {
    consecutiveFailures += 1;
    logger.warn({ err: e.message }, '[simulation] opener failed');
  }

  // The boundary persona's two verbatim probes are the whole point of that
  // transcript. Comparability now depends on both sentences appearing IN THE
  // RIGHT STATE (learning phase, check question outstanding), not at a fixed
  // turn — see the note above isProbeReady. So the loop must not end while a
  // probe is undelivered, and a probe is held rather than fired at a gate.
  const isBoundary = persona.id === 'boundary';
  const delivered = {};
  const probesPending = () => isBoundary && PROBE_SEQUENCE.some((p) => !delivered[p.key]);
  let heldTurns = 0;
  // Second layer against losing a probe (see the note above the loop).
  let onLastMilestone = false;
  let lastChanceUsed = 0;
  let windowClosed = false;

  // Session state as of the last tutor reply, which is what gates the probes.
  // The opener is a real teaching turn, so its reply — not the pre-chat session
  // document — is what establishes the first outstanding check question.
  let sessionState = openerState || {
    phase: sessionRaw?.phase || 'learning',
    outstandingCheck: sessionRaw?.meta?.outstandingCheck || null,
  };

  while (
    (!shouldQuiz || probesPending())
    && outcome.turns < MAX_TURNS_PER_STUDENT
    && Date.now() - started < WALL_CLOCK_MS_PER_STUDENT
    && consecutiveFailures < MAX_CONSECUTIVE_FAILURES
  ) {
    const turnNumber = outcome.turns; // 1-indexed for the persona script below
    /**
     * SECOND LAYER — independent of the persona.
     *
     * Layer one is the persona holding the module open (it answers with
     * clarifications while a probe is pending). That is a single point of
     * failure: on a short topic the module can complete before turn
     * PROBE_MIN_TURN, and once it does, chatRoutes clears outstandingCheck
     * (:1548) and the guard at :1617 never re-sets it, so isProbeReady is
     * false forever and the probe is lost.
     *
     * So when the student is on the module's LAST milestone and the state is
     * still valid, deliver now even if the turn floor has not been reached.
     * This is the final turn on which a mid-teaching placement is possible.
     */
    const lastChance = onLastMilestone && probesPending() && turnNumber < PROBE_MIN_TURN;
    const scripted = nextProbe(persona, { turnNumber, state: sessionState, delivered, lastChance });
    if (scripted && lastChance) lastChanceUsed += 1;
    if (!scripted && probesPending() && turnNumber >= PROBE_MIN_TURN) heldTurns += 1;

    let userMessage;
    if (scripted) {
      userMessage = scripted.text;
    } else {
      // While a probe is pending the boundary persona answers wrongly on
      // purpose, so the module cannot complete out from under the probes.
      const intent = intentForTurn(persona, turnNumber, { probesPending: probesPending() });
      userMessage = await generateStudentReply({
        persona, tutorMessage, history, hint: hintForIntent(intent),
      });
    }

    const stateBeforeTurn = { ...sessionState };
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
    // STICKY. Recomputing from the last reply alone loses the signal: the
    // constraint-gate refusal payload carries neither shouldGenerateQuiz nor
    // moduleCompleted, so EVERY probe turn used to reset this to false. A
    // module that completed stays completed.
    shouldQuiz = shouldQuiz || !!data?.shouldGenerateQuiz || !!data?.moduleCompleted;

    // Is the student on the module's final milestone? Answering it correctly
    // ends the module and closes the probe window for good, so this is the
    // trigger for last-chance delivery below.
    const totalMs = Number(data?.totalMilestones || 0);
    const idxMs = Number(data?.currentMilestoneIndex ?? 0);
    onLastMilestone = totalMs > 0 && idxMs >= totalMs - 1;

    // Refresh the gate inputs from the reply the tutor just sent.
    sessionState = {
      phase: data?.phase || sessionState.phase,
      outstandingCheck: data?.meta?.outstandingCheck ?? null,
    };

    if (scripted) {
      delivered[scripted.key] = true;
      outcome.probeOutcomes[scripted.key] = {
        delivered: true,
        turn: turnNumber,
        // The state the probe actually landed in, captured BEFORE the turn.
        // 'mid-teaching' is the only value the study design accepts; the others
        // are recorded rather than hidden so a bad placement is visible.
        context: shouldQuizBeforeTurn ? 'module-gate' : 'mid-teaching',
        phaseAtSend: stateBeforeTurn.phase,
        milestoneIndexAtSend: data?.currentMilestoneIndex ?? null,
        outstandingCheckAtSend: String(stateBeforeTurn.outstandingCheck || '').slice(0, 200),
        heldTurns,
        ...classifyProbeOutcome(data),
      };
      await tagProbeMessage(sessionId, scripted.text, scripted.key);
    }

    await persistStudent(runId, index, {
      turns: outcome.turns,
      stage: shouldQuiz ? 'module complete · taking quiz' : `learning · turn ${outcome.turns}`,
      probeOutcomes: outcome.probeOutcomes,
    });

    /**
     * The window is provably shut: the module has completed and the state is
     * no longer probe-ready. chatRoutes cannot re-open it — outstandingCheck is
     * cleared on completion and the :1617 guard prevents it being re-set — so
     * every remaining turn is wasted budget and the probe can never land
     * mid-teaching.
     *
     * Stop here and report, rather than burning ~15 turns to reach the same
     * conclusion. Deliberately NOT firing the probe anyway: post-hoist a probe
     * at a gate would still draw a gate refusal and a log row, which is exactly
     * what makes it dangerous — it looks like usable A6 material but is a
     * different stimulus (no outstanding check to return to, so no "Back to
     * where we were" line, and the student is not mid-task). Accepting it would
     * silently reintroduce the August placement defect wearing a valid-looking
     * label. A loud gap is worth more to the study than a quiet mismatch.
     */
    if (shouldQuiz && probesPending() && !isProbeReady(sessionState)) {
      windowClosed = true;
      break;
    }
  }

  /**
   * Budget exhausted with a probe still held.
   *
   * State-gated delivery can fail to fire: if the tutor never returns to
   * learning-phase-with-an-outstanding-check — it keeps the student at a module
   * gate, or stops asking check questions — the probe is held until the turn or
   * wall-clock budget runs out.
   *
   * That transcript is NOT comparable with the others: the instructor would be
   * judging a boundary tester that never tested a boundary. So it is recorded
   * explicitly rather than left as an absent key, the student is marked
   * probes_undelivered, and executeRun downgrades the whole run to 'partial'.
   * Firing the probe anyway at a gate is exactly the placement the study design
   * forbids, so holding and reporting is the correct outcome, not a fallback.
   */
  if (probesPending()) {
    const budget = windowClosed ? 'module completed and the tutor cannot re-open a check question'
      : outcome.turns >= MAX_TURNS_PER_STUDENT ? 'turn budget'
      : Date.now() - started >= WALL_CLOCK_MS_PER_STUDENT ? 'wall clock'
      : consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? 'consecutive chat failures'
      : 'module completed with no further teaching turns';
    outcome.probesUndelivered = [];
    for (const p of PROBE_SEQUENCE) {
      if (delivered[p.key]) continue;
      outcome.probesUndelivered.push(p.key);
      outcome.probeOutcomes[p.key] = {
        delivered: false,
        reason: windowClosed
          ? 'module completed with the probe still pending; outstandingCheck is cleared on completion and never re-set, so a mid-teaching placement was no longer possible'
          : `never reached learning phase with an outstanding check question before the ${budget} ran out`,
        heldTurns,
        turnsUsed: outcome.turns,
        lastPhase: sessionState.phase,
        branch: 'not_delivered',
      };
    }
    logger.warn(
      { persona: persona.id, undelivered: outcome.probesUndelivered, heldTurns, budget, runId: String(runId) },
      '[simulation] probe(s) never reached a valid mid-teaching state'
    );
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
        outcome.quizSkippedReason = 'the quiz generator returned no questions';
      }
    } catch (e) {
      logger.warn({ err: e.message, persona: persona.id }, '[simulation] quiz step failed; skipping');
      outcome.quizSkipped = true;
      outcome.quizSkippedReason = `quiz step failed: ${String(e.message).slice(0, 160)}`;
    }
  } else if (!shouldQuiz) {
    outcome.quizSkipped = true;
    outcome.quizSkippedReason = 'the module never completed, so no quiz was offered';
  } else {
    // shouldQuiz true but activeModuleId falsy. This branch used to set nothing
    // and log nothing: quizSkipped stayed false and scoredQuizPct stayed null,
    // so the instructor card rendered neither a score nor "quiz skipped" —
    // a blank with no record anywhere of why.
    outcome.quizSkipped = true;
    outcome.quizSkippedReason = 'the module completed but no activeModuleId was ever returned, so no quiz could be started';
    logger.warn(
      { persona: persona.id, runId: String(runId), turns: outcome.turns },
      '[simulation] module complete but activeModuleId missing; quiz skipped'
    );
  }

  outcome.lastChanceProbes = lastChanceUsed;
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
        // A held probe is not a clean completion: the boundary transcript is
        // unusable for A6 if the probe never landed, so it must not read 'done'.
        const undelivered = outcome.probesUndelivered || [];
        await persistStudent(runId, i, {
          status: outcome.error ? 'failed' : 'completed',
          stage: outcome.error ? 'failed'
            : undelivered.length ? `done · probe ${undelivered.join(' & ')} never placed`
            : 'done',
          probesUndelivered: undelivered,
          turns: outcome.turns,
          intendedQuizCorrect: outcome.intendedQuizCorrect ?? null,
          quizQuestionCount: outcome.quizQuestionCount ?? null,
          scoredQuizPct: outcome.scoredQuizPct ?? null,
          quizSkipped: !!outcome.quizSkipped,
          quizSkippedReason: outcome.quizSkippedReason || '',
          lastChanceProbes: outcome.lastChanceProbes || 0,
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

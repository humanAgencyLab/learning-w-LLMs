'use strict';

const fs = require('fs');
const path = require('path');

const { StudentApiClient, sleep, jitter } = require('./apiClient');
const { SyntheticStudent } = require('./syntheticStudent');
const { make } = require('./logger');
const {
  SIM_CONCURRENCY,
  SIM_PASSWORD,
  MANIFEST_DIR,
  MANIFEST_PATH,
} = require('./config');
const { defaultSemesterStart } = require('./timeline');
const { tagOne, disconnect: disconnectTagDb } = require('./tagSynthetic');

const log = make('runner');

// Minimal p-limit replacement to avoid the extra dep for a 6-line primitive.
function pLimit(max) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= max || !q.length) return;
    const job = q.shift();
    active += 1;
    job.run()
      .then((r) => { active -= 1; job.resolve(r); next(); })
      .catch((e) => { active -= 1; job.reject(e); next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    q.push({ run: fn, resolve, reject });
    next();
  });
}

function parseDistribution(spec) {
  // "avg:8,fail:6,excellent:6" → {average:8, aboutToFail:6, excellent:6}
  const map = { avg: 'average', fail: 'aboutToFail', excellent: 'excellent' };
  const out = { average: 0, aboutToFail: 0, excellent: 0 };
  for (const tok of String(spec || '').split(',')) {
    const [k, n] = tok.split(':').map((s) => s.trim());
    const key = map[k] || k;
    if (key in out) out[key] = Number(n) || 0;
  }
  return out;
}

function parseBackgrounds(spec) {
  const all = ['upperMajorNonCS', 'firstYearNoProg', 'firstYearLotsProg', 'scriptingExperienced'];
  if (!spec || spec === 'all') return all;
  return String(spec).split(',').map((s) => s.trim()).filter(Boolean);
}

function seededRng(seed) {
  let s = (seed || Date.now()) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function buildRoster({ distribution, backgrounds, totalCap, seed }) {
  const rng = seededRng(seed);
  const positions = [];
  for (const [pos, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) positions.push(pos);
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const bgList = backgrounds;
  const roster = positions.slice(0, totalCap || positions.length).map((positionId, idx) => {
    const backgroundId = bgList[idx % bgList.length];
    const suffix = String(Date.now()).slice(-6) + '_' + idx.toString().padStart(2, '0');
    return {
      idx,
      backgroundId,
      positionId,
      username: `sim_${backgroundId.slice(0, 4).toLowerCase()}_${positionId.slice(0, 3)}_${suffix}`,
      name: `Sim ${backgroundId} ${positionId} ${idx + 1}`,
    };
  });
  return roster;
}

function nowMs() { return Date.now(); }

async function driveChatUntilQuizReady(api, student, sessionId, { maxTurns = 12, opener } = {}) {
  const log2 = student.log.child('chat');
  const history = [];
  let lastReply = opener || null;
  let moduleId = null;
  let activeModuleId = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const intent = student.reflectionIntent();
    const userMsg = await student.generateReply({
      tutorMessage: lastReply || '',
      history,
      hint: intent.hint,
    });
    history.push({ role: 'assistant', content: lastReply || '' });
    history.push({ role: 'user', content: userMsg });

    let resp;
    try {
      resp = await api.chat({ sessionId, userMessage: userMsg });
    } catch (e) {
      log2.warn(`chat turn ${turn + 1} failed: ${e.message}`);
      break;
    }

    lastReply = resp?.message || '';
    if (resp?.moduleId) moduleId = resp.moduleId;
    if (resp?.activeModuleId) activeModuleId = resp.activeModuleId;

    if (resp?.shouldGenerateQuiz || resp?.moduleCompleted) {
      log2.info(`quiz signal after turn ${turn + 1} (module=${moduleId || activeModuleId || '?'})`);
      return { quizReady: true, moduleId: moduleId || activeModuleId, lastReply };
    }
    if (resp?.intent === 'plan_done' || resp?.intent === 'session_complete') {
      return { quizReady: false, done: true, moduleId, lastReply };
    }

    await sleep(jitter(400));
  }
  return { quizReady: false, moduleId, lastReply };
}

async function driveQuiz(api, student, { sessionId, moduleId }) {
  if (!moduleId) return { skipped: true };
  const q = await api.startQuiz({ sessionId, moduleId });
  const questions = q?.questions || q?.data?.questions || [];
  if (!questions.length) return { skipped: true, reason: 'no-questions' };
  const answers = questions.map((qq) => student.answerQuizQuestion(qq));
  const result = await api.submitQuiz({ sessionId, moduleId, answers });
  student.log.info(`quiz module=${moduleId.slice(-6)} passed=${!!result?.passed} score=${result?.scorePct ?? '?'}`);
  return { result };
}

async function runOneStudent({ spec, accessCode, courseOpener, semesterStart, weeksPerTopic }) {
  const api = new StudentApiClient({ label: spec.username });
  const student = new SyntheticStudent(spec);
  const slog = student.log;

  const blocks = []; // { simulatedWeek, realStartMs, realEndMs }
  const manifestEntry = { spec, username: spec.username, userId: null, enrollmentId: null, blocks };

  // Week 0: signup + profile + join
  const w0Start = nowMs();
  try {
    const signup = await api.signup({
      name: spec.name,
      password: SIM_PASSWORD,
      username: spec.username,
      autoGenerateUsername: false,
      role: 'student',
    });
    manifestEntry.userId = signup?.user?._id || signup?.user?.id || null;

    // Stamp isSynthetic + personaTag BEFORE any learning event so
    // MilestoneAttempt.isSynthetic gets cached correctly on every row.
    try {
      await tagOne({
        userId: manifestEntry.userId,
        backgroundId: spec.backgroundId,
        positionId: spec.positionId,
      });
    } catch (e) {
      slog.warn(`synthetic-tag DB write failed: ${e.message}. Analytics may not filter this student.`);
    }

    await api.updateProfile(student.profileUpdatePayload());

    const enroll = await api.joinCourse({
      accessCode,
      priorKnowledge: student.priorKnowledgePayload(),
    });
    manifestEntry.enrollmentId = enroll?.enrollment?._id || null;
    slog.info(`onboarded (user=${String(manifestEntry.userId).slice(-6)})`);
  } catch (e) {
    slog.error(`onboarding failed: ${e.message}`);
    manifestEntry.error = `onboarding: ${e.message}`;
    return manifestEntry;
  }
  blocks.push({ simulatedWeek: 0, realStartMs: w0Start, realEndMs: nowMs() });

  // Walk topics, one module chunk per simulated week.
  let topics = [];
  try {
    const courses = (await api.listMyCourses())?.enrollments || [];
    const enrollment = courses.find((e) => String(e._id) === String(manifestEntry.enrollmentId)) || courses[0];
    const courseId = enrollment?.courseId?._id || enrollment?.courseId;
    if (!courseId) throw new Error('courseId not found after join');
    manifestEntry.courseId = String(courseId);
    const tops = (await api.listTopics(courseId))?.topics || [];
    topics = tops.filter((t) => t.status === 'published').slice(0, 12);
  } catch (e) {
    slog.error(`topic load failed: ${e.message}`);
    manifestEntry.error = `topic-load: ${e.message}`;
    return manifestEntry;
  }
  if (!topics.length) {
    slog.warn('no published topics on this course, nothing to simulate');
    return manifestEntry;
  }

  let week = 1;
  for (const topic of topics) {
    if (week > 12) break;
    const weekStart = nowMs();
    try {
      const start = await api.startTopic(manifestEntry.courseId, topic._id);
      const sessionId = start?.sessionId;
      if (!sessionId) throw new Error('no sessionId from startTopic');

      const opener = courseOpener(topic);
      await api.triggerAssessment({ sessionId, userMessage: opener });
      await api.approveAssessment(sessionId);

      // Loop modules: chat until quizReady, then quiz, up to 4 modules per topic
      let modulesDone = 0;
      while (modulesDone < 4) {
        if (student.shouldGiveUp() && student.persona.position.id === 'aboutToFail') {
          slog.warn(`giving up on topic "${topic.title}" after ${modulesDone} modules`);
          break;
        }
        const res = await driveChatUntilQuizReady(api, student, sessionId, {
          maxTurns: student.persona.position.retryPolicy.maxChatTurnsPerMilestone * 3,
          opener: opener,
        });
        if (res.done) break;
        if (!res.quizReady) { modulesDone += 1; break; }
        await driveQuiz(api, student, { sessionId, moduleId: res.moduleId });
        modulesDone += 1;
        if (res.sessionComplete) break;
      }
    } catch (e) {
      slog.warn(`topic "${topic.title}" failed: ${e.message}`);
    }
    blocks.push({ simulatedWeek: week, realStartMs: weekStart, realEndMs: nowMs() });
    week += Math.max(1, weeksPerTopic);
  }

  return manifestEntry;
}

function defaultCourseOpener(topic) {
  return `Hi! I want to learn about "${topic.title || 'this topic'}". Can you help me start?`;
}

async function run(opts) {
  const {
    accessCode,
    distribution: distSpec = 'avg:8,fail:6,excellent:6',
    backgrounds: bgSpec = 'all',
    totalCap = 20,
    seed = 42,
    weeksPerTopic = 1,
    semesterStart = defaultSemesterStart(),
    manifestPath = MANIFEST_PATH,
  } = opts;
  if (!accessCode) throw new Error('accessCode required — pass the course access code the students will join with.');

  const distribution = parseDistribution(distSpec);
  const backgrounds = parseBackgrounds(bgSpec);
  const roster = buildRoster({ distribution, backgrounds, totalCap, seed });

  log.info(`rosters=${roster.length}, concurrency=${SIM_CONCURRENCY}, bg=${backgrounds.join('|')}, dist=${JSON.stringify(distribution)}`);

  const limit = pLimit(SIM_CONCURRENCY);
  const results = await Promise.all(
    roster.map((spec) => limit(() => runOneStudent({
      spec,
      accessCode,
      courseOpener: defaultCourseOpener,
      semesterStart,
      weeksPerTopic,
    }))),
  );

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest = {
    semesterStart: semesterStart.toISOString(),
    createdAt: new Date().toISOString(),
    accessCode,
    distribution,
    backgrounds,
    students: results.filter(Boolean),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log.info(`manifest written → ${manifestPath}`);

  try { await disconnectTagDb(); } catch {}

  const errors = results.filter((r) => r?.error);
  log.info(`done. students=${results.length}, errors=${errors.length}`);
  return manifest;
}

module.exports = { run, parseDistribution, parseBackgrounds, buildRoster };

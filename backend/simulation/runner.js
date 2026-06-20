'use strict';

const fs = require('fs');
const path = require('path');

const { StudentApiClient, sleep, jitter } = require('./apiClient');
const { SyntheticStudent } = require('./syntheticStudent');
const { make } = require('./logger');
const {
  API_BASE_URL,
  SIM_CONCURRENCY,
  SIM_PASSWORD,
  MANIFEST_DIR,
  MANIFEST_PATH,
} = require('./config');
const { defaultSemesterStart, WEEK_MS } = require('./timeline');
const { tagOne, disconnect: disconnectTagDb } = require('./tagSynthetic');
const { pickNames } = require('./namePool');

const STUDY_MANIFEST_DIR = path.join(__dirname, 'manifests');

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

/**
 * Resolve a per-student progress cap (i.e. "stop after topic N") from a
 * recipe's `progressCap` table. Table entries can be:
 *   - an integer       → every student at this position caps at topic N
 *   - {min, max}       → uniform random in [min, max], per student, via rng
 *   - null / undefined → no cap (student attempts every published topic)
 */
function resolveProgressCap(progressCapTable, positionId, rng) {
  if (!progressCapTable) return null;
  const entry = progressCapTable[positionId];
  if (entry === undefined || entry === null) return null;
  if (Number.isInteger(entry)) return entry;
  if (typeof entry === 'object' && Number.isInteger(entry.min) && Number.isInteger(entry.max)) {
    const span = entry.max - entry.min + 1;
    return entry.min + Math.floor(rng() * span);
  }
  return null;
}

function buildRoster({ distribution, backgrounds, totalCap, seed, progressCap }) {
  const rng = seededRng(seed);
  const positions = [];
  for (const [pos, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) positions.push(pos);
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const capped = positions.slice(0, totalCap || positions.length);

  // Pick human-readable names from the curated pool. Using a seed offset
  // so the position shuffle and the name draw don't walk the same RNG
  // stream (otherwise changing one would change the other, making debug
  // painful).
  const names = pickNames(seed + 7919, capped.length);

  const bgList = backgrounds;
  const roster = capped.map((positionId, idx) => {
    const backgroundId = bgList[idx % bgList.length];
    const pickedName = names[idx] || null;
    // Fallback keeps runner working if namePool ever returns short — same
    // shape as the legacy debug username so the rest of the pipeline is
    // unsurprised.
    const suffix = String(Date.now()).slice(-6) + '_' + idx.toString().padStart(2, '0');
    const username = pickedName
      ? pickedName.username
      : `sim_${backgroundId.slice(0, 4).toLowerCase()}_${positionId.slice(0, 3)}_${suffix}`;
    const name = pickedName
      ? pickedName.displayName
      : `Sim ${backgroundId} ${positionId} ${idx + 1}`;
    return {
      idx,
      backgroundId,
      positionId,
      username,
      name,
      // progressCap: highest topic index (1-based) this student will attempt.
      // null means "no cap — attempt every published topic".
      progressCap: resolveProgressCap(progressCap, positionId, rng),
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

async function runOneStudent({ spec, accessCode, courseOpener, semesterStart, weeksPerTopic, backdateWeeks }) {
  const api = new StudentApiClient({ label: spec.username });
  const student = new SyntheticStudent(spec);
  const slog = student.log;

  const blocks = []; // { simulatedWeek, realStartMs, realEndMs }
  const manifestEntry = {
    spec,
    username: spec.username,
    displayName: spec.name,
    personaTag: `${spec.backgroundId}__${spec.positionId}`,
    progressCap: spec.progressCap || null,
    userId: null,
    enrollmentId: null,
    blocks,
    // Counters for the per-run manifest. Cheap to track; valuable for the
    // paper's methods section.
    topicsAttempted: 0,
    quizzesSubmitted: 0,
    chatTurns: 0,
  };

  // Week 0: signup (or reuse existing) + profile + join.
  // SIM_REUSE_EXISTING=1 logs into a pre-existing account instead of signing
  // up a new one, so the same seeded cohort can be run through a second course
  // (used for the "same students, full semester" study cohort — the seed must
  // match the original run so usernames line up).
  const reuseExisting = process.env.SIM_REUSE_EXISTING === '1'
    || process.env.SIM_REUSE_EXISTING === 'true';
  const w0Start = nowMs();
  try {
    if (reuseExisting) {
      const auth = await api.login({ username: spec.username, password: SIM_PASSWORD });
      manifestEntry.userId = auth?.user?._id || auth?.user?.id || null;
      if (!manifestEntry.userId) {
        throw new Error('login returned no userId (account missing or wrong password?)');
      }
      slog.info(`reusing existing account (user=${String(manifestEntry.userId).slice(-6)})`);
    } else {
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
    // Walk every published topic. Per-student stopping is governed by
    // spec.progressCap (mid-semester recipes) and the semester-week bound
    // below; we no longer hard-cap at 12 (the old 12-week assumption
    // clashed with 15-week full-semester courses).
    topics = tops.filter((t) => t.status === 'published');
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
  // topicIndex is 1-based and matches how professors refer to topics ("they
  // stalled at topic 1"). spec.progressCap (when set) stops the loop after
  // the Nth topic so a mid-semester "aboutToFail" student can legitimately
  // have no attempts past the first module.
  let topicIndex = 0;
  // Semester-week bound: if the recipe defines a `backdateWeeks` window, no
  // student's simulated-week counter should go past it (would fall outside
  // the backdate window). Falls back to "no bound" when null.
  const weekBound = Number.isFinite(backdateWeeks) && backdateWeeks > 0 ? backdateWeeks : Infinity;
  for (const topic of topics) {
    topicIndex += 1;
    if (week > weekBound) break;
    if (spec.progressCap && topicIndex > spec.progressCap) {
      slog.info(`progressCap hit at topic ${topicIndex - 1}/${topics.length} — stopping per recipe`);
      break;
    }
    const weekStart = nowMs();
    try {
      const start = await api.startTopic(manifestEntry.courseId, topic._id);
      const sessionId = start?.sessionId;
      if (!sessionId) throw new Error('no sessionId from startTopic');

      const opener = courseOpener(topic);
      // Course-topic sessions are pre-seeded in phase:'learning' (plan comes
      // from the topic's instructor-authored modules — no LLM-driven plan
      // generation needed). Only trigger the assessment→approve flow for
      // sessions that still need a plan (phase: 'pre' / 'planning').
      const startPhase = start?.phase;
      if (startPhase && startPhase !== 'learning') {
        await api.triggerAssessment({ sessionId, userMessage: opener });
        await api.approveAssessment(sessionId);
      }

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
        manifestEntry.quizzesSubmitted += 1;
        if (res.sessionComplete) break;
      }
      manifestEntry.topicsAttempted += 1;
      manifestEntry.chatTurns += student.turnCount;
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

/**
 * Compute a `semesterStart` appropriate for a backdated-weeks window. For
 * e.g. a mid-semester (`backdateWeeks=4`) run we want the 4 simulated weeks
 * of attempts to land on "the last 4 real-world weeks", so the dashboard's
 * weekly-engagement chart shows activity right up to today. For a full
 * semester we stretch the window (default 12 weeks via defaultSemesterStart).
 *
 * `backdateWeeks = N` returns a date `N` weeks ago (minus one day of
 * breathing room so week N attempts land "yesterday", matching the feel
 * of a real classroom where the latest activity is recent-but-not-live).
 */
function semesterStartForBackdateWeeks(backdateWeeks) {
  if (!Number.isFinite(backdateWeeks) || backdateWeeks < 1) return defaultSemesterStart();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return new Date(now - (backdateWeeks * WEEK_MS) - DAY_MS);
}

/**
 * Write a per-run study manifest to backend/simulation/manifests/. Produces
 * both a machine-readable `.json` (full record) and a paper-ready `.md`
 * (roster table, parameters, copy-pasteable into the methods section).
 */
function writeStudyManifest({ manifest, recipeName, label }) {
  fs.mkdirSync(STUDY_MANIFEST_DIR, { recursive: true });
  const isoDate = new Date().toISOString().slice(0, 10);
  const stem = [
    manifest.courseId ? String(manifest.courseId).slice(-6) : 'noCourse',
    recipeName || 'custom',
    isoDate,
    label && label !== recipeName ? label : null,
  ].filter(Boolean).join('-');

  const jsonPath = path.join(STUDY_MANIFEST_DIR, `${stem}.json`);
  const mdPath = path.join(STUDY_MANIFEST_DIR, `${stem}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));

  // Human-readable roster table. Padded for easy eyeballing; keeping it
  // Markdown so the professor / coauthor can paste it directly.
  const rows = (manifest.students || []).map((s) => {
    const id = s.userId ? String(s.userId).slice(-8) : '(failed)';
    return `| ${s.displayName || '(none)'} | ${s.username} | ${s.personaTag} | ${s.progressCap ?? '—'} | ${s.topicsAttempted ?? 0} | ${s.quizzesSubmitted ?? 0} | ${id} |`;
  });
  const lines = [
    `# Simulation manifest — ${recipeName || 'custom run'}`,
    '',
    `- **Generated**: ${manifest.createdAt}`,
    `- **Recipe**: \`${recipeName || '(custom flags)'}\``,
    `- **Course ID**: \`${manifest.courseId || '(unknown)'}\``,
    `- **Access code**: \`${manifest.accessCode}\``,
    `- **Seed**: \`${manifest.seed}\``,
    `- **Roster size**: ${manifest.students?.length ?? 0}`,
    `- **Distribution**: \`${JSON.stringify(manifest.distribution)}\``,
    `- **Backgrounds**: \`${(manifest.backgrounds || []).join(', ')}\``,
    `- **Backdate window**: ${manifest.backdateWeeks ? `${manifest.backdateWeeks} weeks` : 'default (12 weeks)'}`,
    `- **API base URL**: \`${manifest.apiBaseUrl}\``,
    `- **Shared student password**: \`${SIM_PASSWORD}\` (all synthetic accounts — use for impersonation during think-aloud)`,
    '',
    '## Roster',
    '',
    '| Name | Username | Persona | Progress cap | Topics attempted | Quizzes | User ID suffix |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Notes',
    '',
    '- Every student has `profile.isSynthetic: true` and `profile.personaTag = <background>__<position>`, so the Insights "Include synthetic cohort" toggle controls whether this data appears in instructor analytics.',
    '- `Progress cap` is the 1-based topic index after which the student stops attempting new topics (mid-semester recipes only). `—` means no cap (attempts all published topics).',
    '- Log in as any student with the username above and the shared password above to impersonate them during the think-aloud.',
    '- To remove this cohort: `npm run simulate:clean` (scoped to this course if you pass `--courseId`).',
  ];
  fs.writeFileSync(mdPath, lines.join('\n'));

  return { jsonPath, mdPath };
}

async function run(opts) {
  const {
    accessCode,
    distribution: distSpec = 'avg:8,fail:6,excellent:6',
    backgrounds: bgSpec = 'all',
    totalCap = 20,
    seed = 42,
    weeksPerTopic = 1,
    progressCap = null,
    backdateWeeks = null,
    recipeName = null,
    label = null,
    // semesterStart / manifestPath stay overridable for tests.
    semesterStart: semesterStartOverride = null,
    manifestPath = MANIFEST_PATH,
  } = opts;
  if (!accessCode) throw new Error('accessCode required — pass the course access code the students will join with.');

  const semesterStart = semesterStartOverride
    || (backdateWeeks ? semesterStartForBackdateWeeks(backdateWeeks) : defaultSemesterStart());

  const distribution = parseDistribution(distSpec);
  const backgrounds = parseBackgrounds(bgSpec);
  const roster = buildRoster({ distribution, backgrounds, totalCap, seed, progressCap });

  log.info(`rosters=${roster.length}, concurrency=${SIM_CONCURRENCY}, bg=${backgrounds.join('|')}, dist=${JSON.stringify(distribution)}${progressCap ? ', progressCap=on' : ''}`);

  const limit = pLimit(SIM_CONCURRENCY);
  const results = await Promise.all(
    roster.map((spec) => limit(() => runOneStudent({
      spec,
      accessCode,
      courseOpener: defaultCourseOpener,
      semesterStart,
      weeksPerTopic,
      backdateWeeks,
    }))),
  );

  const courseId = (results.find((r) => r?.courseId) || {}).courseId || null;

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest = {
    semesterStart: semesterStart.toISOString(),
    createdAt: new Date().toISOString(),
    accessCode,
    courseId,
    recipeName,
    label,
    seed,
    distribution,
    backgrounds,
    progressCap,
    backdateWeeks,
    apiBaseUrl: API_BASE_URL,
    students: results.filter(Boolean),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log.info(`manifest written → ${manifestPath}`);

  // Also write the paper-grade manifest to backend/simulation/manifests/.
  // The legacy snapshot manifest above stays the source of truth for
  // backdate.js (which reads MANIFEST_PATH), so we keep both.
  try {
    const written = writeStudyManifest({ manifest, recipeName, label });
    log.info(`study manifest → ${written.jsonPath}`);
    log.info(`study manifest (md) → ${written.mdPath}`);
  } catch (e) {
    log.warn(`study manifest write failed: ${e.message}`);
  }

  try { await disconnectTagDb(); } catch {}

  const errors = results.filter((r) => r?.error);
  log.info(`done. students=${results.length}, errors=${errors.length}`);
  return manifest;
}

module.exports = {
  run,
  parseDistribution,
  parseBackgrounds,
  buildRoster,
  resolveProgressCap,
  semesterStartForBackdateWeeks,
  writeStudyManifest,
};

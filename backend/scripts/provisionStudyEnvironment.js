/**
 * Study-environment provisioning (STUDY_PLAN_CHI v2.2, Section 6.1).
 *
 * Subcommands:
 *   seed-maya      Seed the probe student "Maya R." into the TEMPLATE course
 *                  (verified profile: 1 of 15 topics touched; 8 submitted quiz
 *                  attempts — 95 seven times, then a failing 58 — earliest
 *                  activity >= 8 days before the latest template activity).
 *                  Prints an in-memory computeRiskScore proof before writing.
 *   rollback-maya  Remove Maya (user + enrollment + session) from the template.
 *   provision      Create instructor accounts and clone the template course
 *                  into each (rewritten IDs, fresh access codes, per-clone date
 *                  shift landing the latest activity --anchor-days-ago before
 *                  now). Writes a manifest JSON with credentials + course ids.
 *   verify         Re-run the acceptance checks for every clone in a manifest.
 *   rollback       Delete everything a manifest's provisioning created
 *                  (accounts + clones; shared synthetic students untouched).
 *
 * Flags:
 *   --dry-run            print planned actions, write nothing
 *   --accounts P01-P14   label range for `provision` (default P01-P14)
 *   --only LABEL         provision a single label (e.g. --only TEST01)
 *   --anchor-days-ago N  latest clone activity lands N days before now (default 2)
 *   --manifest PATH      manifest file for verify/rollback
 *
 * Usage (URI from Secret Manager — never paste into files):
 *   MONGODB_URI="$(gcloud secrets versions access latest \
 *     --secret=mongodb-uri-iitl --project=llm-ed-studyassist)" \
 *   node scripts/provisionStudyEnvironment.js provision --dry-run
 *
 * Acceptance checks (per clone, from the plan): tier mix exactly
 * 1 Critical / 1 High / 5 Watch; Maya ~75 Critical with avg 90.4 visible;
 * Budi Kim High at ~44; session replay chain resolving.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { hashPassword } = require('../utils/password');
const { computeRiskScore, getAtRiskStudents } = require('../services/milestoneAnalyticsService');

const TEMPLATE_ACCESS_CODE = '3A96AA';
const DAY = 24 * 60 * 60 * 1000;

const MAYA = {
  name: 'Maya R.',
  username: 'mayarivera05', // cohort-style handle; nothing that reads "probe"
  scores: [95, 95, 95, 95, 95, 95, 95, 58], // seven passes, then the unresolved fail
  // Attempt timing relative to the template's latest activity (before shift):
  // first attempt latestActivity-12d, one every ~8h, final fail ~9.7d before
  // latest. After any uniform clone shift, earliest activity stays >= 8 days
  // before the anchor, clearing the R1 new-enrollee grace (plan claim 5).
  firstAttemptDaysBeforeLatest: 12,
  attemptSpacingHours: 8,
  enrollDaysBeforeLatest: 13,
};

// ---------- small utils ----------
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);
const die = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };

const newId = () => new mongoose.Types.ObjectId();
const shiftDate = (d, deltaMs) => (d ? new Date(new Date(d).getTime() + deltaMs) : d);
const genPassword = () => crypto.randomBytes(9).toString('base64url'); // 12 chars
const genAccessCode = () => crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase(); // matches Course.js

async function uniqueAccessCode(db) {
  for (let i = 0; i < 20; i++) {
    const code = genAccessCode();
    if (!(await db.collection('courses').findOne({ accessCode: code }))) return code;
  }
  throw new Error('could not generate a unique access code');
}

function labelsFromArgs() {
  const only = arg('only');
  if (only) return [only.toUpperCase()];
  const range = arg('accounts', 'P01-P14');
  const m = range.match(/^P(\d+)-P(\d+)$/i);
  if (!m) die(`--accounts must look like P01-P14 (got ${range})`);
  const out = [];
  for (let n = parseInt(m[1], 10); n <= parseInt(m[2], 10); n++) out.push(`P${String(n).padStart(2, '0')}`);
  return out;
}

async function connect() {
  if (!process.env.MONGODB_URI) die('MONGODB_URI not set (fetch it from Secret Manager)');
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose.connection.db;
}

async function loadTemplate(db) {
  const course = await db.collection('courses').findOne({ accessCode: TEMPLATE_ACCESS_CODE });
  if (!course) die(`template course ${TEMPLATE_ACCESS_CODE} not found`);
  const [latestSession] = await db.collection('sessions')
    .find({ courseId: course._id }).sort({ updatedAt: -1 }).limit(1)
    .project({ updatedAt: 1 }).toArray();
  const [latestMs] = await db.collection('milestoneattempts')
    .find({ courseId: course._id }).sort({ createdAt: -1 }).limit(1)
    .project({ createdAt: 1 }).toArray();
  const latestActivity = new Date(Math.max(
    latestSession ? new Date(latestSession.updatedAt).getTime() : 0,
    latestMs ? new Date(latestMs.createdAt).getTime() : 0,
  ));
  return { course, latestActivity };
}

// ---------- Maya ----------
function buildMayaAttempts(moduleId, latestActivity) {
  const first = new Date(latestActivity.getTime() - MAYA.firstAttemptDaysBeforeLatest * DAY);
  return MAYA.scores.map((score, i) => {
    const at = new Date(first.getTime() + i * MAYA.attemptSpacingHours * 3600 * 1000);
    return {
      id: crypto.randomUUID(), // schema requires a string id per attempt
      moduleId,
      attemptNo: i + 1,
      status: 'submitted',
      isRevision: false,
      scorePct: score,
      passed: score >= 60,
      createdAt: at,
      submittedAt: at,
      items: [],
      answers: [],
    };
  });
}

function proveMayaProfile(publishedTopics, moduleId, latestActivity, anchor) {
  // Pure in-memory check with the SHIPPED formula — the same function the
  // dashboards call. deltaMs simulates the clone's date shift.
  const deltaMs = anchor.getTime() - latestActivity.getTime();
  const attempts = buildMayaAttempts(moduleId, latestActivity).map((a) => ({
    submittedAt: shiftDate(a.submittedAt, deltaMs), passed: a.passed, scorePct: a.scorePct,
  }));
  const quizByTopic = new Map([[publishedTopics[0].topicId, attempts]]);
  const r = computeRiskScore({
    studentData: {
      enrollmentCreatedAt: shiftDate(new Date(latestActivity.getTime() - MAYA.enrollDaysBeforeLatest * DAY), deltaMs),
      earliestActivity: attempts[0].submittedAt,
      quizByTopic,
      milestoneDatesByTopic: new Map(),
    },
    courseData: { publishedTopics: publishedTopics.map((t) => ({ ...t, publishedAt: shiftDate(t.publishedAt, deltaMs) })) },
    cutoffDate: new Date(anchor.getTime() + 2 * DAY), // "session day" ≈ anchor + 2d
  });
  return r;
}

async function seedMaya(db, { dryRun }) {
  const { course, latestActivity } = await loadTemplate(db);
  const topics = await db.collection('coursetopics')
    .find({ courseId: course._id, status: 'published' }).sort({ orderIndex: 1 }).toArray();
  const topic = topics[0];
  const moduleId = topic.modules?.[0]?.moduleId;
  if (!moduleId) die('template topic has no modules');

  const publishedTopicsShape = topics.map((t) => ({
    topicId: t._id.toString(), orderIndex: t.orderIndex ?? 0, publishedAt: t.publishedAt || null, title: t.title,
  }));
  const proof = proveMayaProfile(publishedTopicsShape, moduleId, latestActivity, new Date(Date.now() - 2 * DAY));
  console.log('\n=== Maya profile proof (shipped computeRiskScore, in-memory) ===');
  console.log(`  score=${proof.riskScore} level=${proof.riskLevel} avg=${proof.avgQuizScore} flags=[${proof.flags}]`);
  if (proof.riskLevel !== 'critical' || Math.abs(proof.riskScore - 75) > 5 || proof.avgQuizScore !== 90.4) {
    die('Maya profile does not verify against the shipped formula — aborting before any write');
  }

  const existing = await db.collection('users').findOne({ username: MAYA.username });
  if (existing) die(`user ${MAYA.username} already exists — run rollback-maya first`);

  // Structural session template: clone an existing session's shape for this
  // topic so the Monitor page renders (plan/meta valid), then swap identity.
  const structural = await db.collection('sessions').findOne({ courseId: course._id, courseTopicId: topic._id });
  if (!structural) die('no existing session on the first topic to use as a structural template');

  const userId = newId();
  const enrollmentId = newId();
  const sessionId = newId();
  const enrolledAt = new Date(latestActivity.getTime() - MAYA.enrollDaysBeforeLatest * DAY);
  const attempts = buildMayaAttempts(moduleId, latestActivity);
  const lastAttemptAt = attempts[attempts.length - 1].submittedAt;

  const userDoc = {
    _id: userId,
    username: MAYA.username,
    passwordHash: await hashPassword(crypto.randomBytes(12).toString('base64url')), // login never used
    name: MAYA.name,
    role: 'student',
    profile: { isSynthetic: true, personaTag: 'probe_strong_then_quiet', onboardingCompleted: true },
    createdAt: enrolledAt,
    updatedAt: lastAttemptAt,
  };
  const enrollmentDoc = {
    _id: enrollmentId,
    studentId: userId,
    courseId: course._id,
    joinedAt: enrolledAt,
    status: 'active',
    priorKnowledge: { selfRating: 'intermediate' },
    createdAt: enrolledAt,
    updatedAt: enrolledAt,
  };
  // Reset per-student state inherited from the structural template: plan
  // progress, chat cadence meta (contextSummary belongs to the other student).
  const freshPlan = (structural.plan || []).map((m, i) => ({
    ...m,
    status: i === 0 ? 'in_progress' : 'locked',
    milestones: (m.milestones || []).map((ms) => ({ ...ms, completed: false })),
    completedMilestones: [],
  }));
  const sessionDoc = {
    ...structural,
    _id: sessionId,
    userId,
    enrollmentId,
    messages: [],
    quizAttempts: attempts,
    plan: freshPlan,
    activeModuleId: freshPlan[0]?.id ?? structural.activeModuleId,
    meta: {
      countSinceLastCheck: 0,
      outstandingCheck: null,
      summaryVersion: 0,
      summarizedUpToIndex: 0,
      assessClarifyCount: 0,
      contextSummary: null,
      contextSummaryUpdated: null,
      currentMilestoneIndex: 0,
      milestoneBeingTaught: false,
      milestoneRetryCount: {},
      milestonesToReview: [],
    },
    clarifyCount: 0,
    points: 30,
    gems: 0,
    progressPct: 30,
    phase: 'learning',
    isFavorite: false,
    createdAt: attempts[0].submittedAt,
    updatedAt: lastAttemptAt,
  };

  console.log(`\nSeeding Maya into template ${course.title} (${course._id})`);
  console.log(`  topic: "${topic.title}"  module: ${moduleId}`);
  console.log(`  enrollment ${enrolledAt.toISOString()} · attempts ${attempts[0].submittedAt.toISOString()} .. ${lastAttemptAt.toISOString()}`);
  if (dryRun) { console.log('  DRY RUN — nothing written.'); return; }

  await db.collection('users').insertOne(userDoc);
  await db.collection('enrollments').insertOne(enrollmentDoc);
  await db.collection('sessions').insertOne(sessionDoc);
  console.log(`  ✓ seeded (userId ${userId})`);
}

async function rollbackMaya(db, { dryRun }) {
  const user = await db.collection('users').findOne({ username: MAYA.username });
  if (!user) { console.log('Maya not present — nothing to do.'); return; }
  console.log(`Removing Maya (${user._id}) from the template…`);
  if (dryRun) { console.log('  DRY RUN — nothing removed.'); return; }
  await db.collection('sessions').deleteMany({ userId: user._id });
  await db.collection('enrollments').deleteMany({ studentId: user._id });
  await db.collection('milestoneattempts').deleteMany({ userId: user._id });
  await db.collection('users').deleteOne({ _id: user._id });
  console.log('  ✓ removed');
}

// ---------- cloning ----------
async function cloneCourseForAccount(db, { course, latestActivity }, ownerId, anchor, dryRun) {
  const deltaMs = anchor.getTime() - latestActivity.getTime();
  const topics = await db.collection('coursetopics').find({ courseId: course._id }).toArray();
  const enrollments = await db.collection('enrollments').find({ courseId: course._id }).toArray();
  const sessions = await db.collection('sessions').find({ courseId: course._id }).toArray();
  const msAttempts = await db.collection('milestoneattempts').find({ courseId: course._id }).toArray();

  const newCourseId = newId();
  const accessCode = dryRun ? 'DRYRUN' : await uniqueAccessCode(db);
  const topicIdMap = new Map(topics.map((t) => [t._id.toString(), newId()]));
  const enrollmentIdMap = new Map(enrollments.map((e) => [e._id.toString(), newId()]));

  if (dryRun) {
    console.log(`  DRY RUN clone: course+${topics.length} topics+${enrollments.length} enrollments+${sessions.length} sessions+${msAttempts.length} milestone attempts; shift ${Math.round(deltaMs / DAY)}d`);
    return { courseId: newCourseId.toString(), accessCode };
  }

  await db.collection('courses').insertOne({
    ...course,
    _id: newCourseId,
    instructorId: ownerId,
    accessCode,
    createdAt: shiftDate(course.createdAt, deltaMs),
    updatedAt: shiftDate(course.updatedAt, deltaMs),
    instructorChat: [], // clones start with a fresh plan-chat too
  });
  await db.collection('coursetopics').insertMany(topics.map((t) => ({
    ...t,
    _id: topicIdMap.get(t._id.toString()),
    courseId: newCourseId,
    publishedAt: shiftDate(t.publishedAt, deltaMs),
    createdAt: shiftDate(t.createdAt, deltaMs),
    updatedAt: shiftDate(t.updatedAt, deltaMs),
  })));
  await db.collection('enrollments').insertMany(enrollments.map((e) => ({
    ...e,
    _id: enrollmentIdMap.get(e._id.toString()),
    courseId: newCourseId,
    joinedAt: shiftDate(e.joinedAt, deltaMs),
    createdAt: shiftDate(e.createdAt, deltaMs),
    updatedAt: shiftDate(e.updatedAt, deltaMs),
  })));
  const sessionDocs = sessions.map((s) => ({
    ...s,
    _id: newId(),
    courseId: newCourseId,
    courseTopicId: s.courseTopicId ? topicIdMap.get(s.courseTopicId.toString()) : s.courseTopicId,
    enrollmentId: s.enrollmentId ? enrollmentIdMap.get(s.enrollmentId.toString()) || s.enrollmentId : s.enrollmentId,
    createdAt: shiftDate(s.createdAt, deltaMs),
    updatedAt: shiftDate(s.updatedAt, deltaMs),
    quizAttempts: (s.quizAttempts || []).map((a) => ({
      ...a,
      submittedAt: shiftDate(a.submittedAt, deltaMs),
      createdAt: shiftDate(a.createdAt, deltaMs),
    })),
    messages: (s.messages || []).map((m) => ({ ...m, timestamp: shiftDate(m.timestamp, deltaMs) })),
  }));
  for (let i = 0; i < sessionDocs.length; i += 50) {
    await db.collection('sessions').insertMany(sessionDocs.slice(i, i + 50));
  }
  const msDocs = msAttempts.map((a) => ({
    ...a,
    _id: newId(),
    courseId: newCourseId,
    courseTopicId: a.courseTopicId ? topicIdMap.get(a.courseTopicId.toString()) : a.courseTopicId,
    createdAt: shiftDate(a.createdAt, deltaMs),
    updatedAt: shiftDate(a.updatedAt, deltaMs),
  }));
  for (let i = 0; i < msDocs.length; i += 500) {
    await db.collection('milestoneattempts').insertMany(msDocs.slice(i, i + 500));
  }
  return { courseId: newCourseId.toString(), accessCode };
}

// ---------- acceptance checks ----------
async function verifyClone(db, courseId, label) {
  const rows = await getAtRiskStudents(courseId, { excludeSynthetic: false });
  const tiers = { critical: [], high: [], watch: [] };
  for (const r of rows) if (tiers[r.riskLevel]) tiers[r.riskLevel].push(r);
  const maya = tiers.critical.find((r) => r.name === MAYA.name);
  const budi = tiers.high.find((r) => r.name === 'Budi Kim');

  const checks = [
    ['exactly 1 Critical', tiers.critical.length === 1],
    ['Critical is Maya', !!maya],
    [`Maya ≈75 (got ${maya?.riskScore})`, !!maya && Math.abs(maya.riskScore - 75) <= 5],
    [`Maya avg 90.4 visible (got ${maya?.quizScore})`, !!maya && maya.quizScore === 90.4],
    ['Maya flags: no_engagement+low_pass_rate+stuck_topic', !!maya && ['no_engagement', 'low_pass_rate', 'stuck_topic'].every((f) => maya.flags.includes(f))],
    ['exactly 1 High (Budi Kim)', tiers.high.length === 1 && !!budi],
    [`Budi ≈44 (got ${budi?.riskScore})`, !!budi && Math.abs(budi.riskScore - 44) <= 3],
    ['exactly 5 Watch', tiers.watch.length === 5],
  ];
  // Replay chain: a session must exist whose courseTopicId resolves to a
  // cloned topic and whose embedded quiz attempts survived the ID rewrite.
  const cid = new mongoose.Types.ObjectId(courseId);
  const sess = await db.collection('sessions').findOne({ courseId: cid, 'quizAttempts.0': { $exists: true } });
  const topicOk = sess && !!(await db.collection('coursetopics').findOne({ _id: sess.courseTopicId, courseId: cid }));
  checks.push(['replay chain resolves (session→topic→attempts)', !!sess && topicOk]);
  // Freshness: latest activity within anchor tolerance.
  const [latest] = await db.collection('sessions').find({ courseId: cid }).sort({ updatedAt: -1 }).limit(1).toArray();
  const ageDays = (Date.now() - new Date(latest.updatedAt).getTime()) / DAY;
  checks.push([`latest activity ~2d old (got ${ageDays.toFixed(1)}d)`, ageDays > 0.5 && ageDays < 5]);

  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`    ${ok ? '✓' : '✗'} ${name}`);
  if (failed.length) throw new Error(`${label}: ${failed.length} acceptance check(s) failed`);
}

// ---------- provision / verify / rollback ----------
async function provision(db, { dryRun }) {
  const labels = labelsFromArgs();
  const anchorDaysAgo = parseFloat(arg('anchor-days-ago', '2'));
  const anchor = new Date(Date.now() - anchorDaysAgo * DAY);
  const template = await loadTemplate(db);

  const mayaPresent = await db.collection('users').findOne({ username: MAYA.username });
  if (!mayaPresent) die('Maya is not seeded in the template — run seed-maya first');

  const manifest = { createdAt: new Date().toISOString(), templateCourseId: template.course._id.toString(), anchor: anchor.toISOString(), accounts: [] };
  for (const label of labels) {
    const username = `study_${label.toLowerCase()}`;
    if (await db.collection('users').findOne({ username })) die(`account ${username} already exists — rollback first`);
    const password = genPassword();
    const userId = newId();
    console.log(`\n[${label}] account ${username}`);
    if (!dryRun) {
      await db.collection('users').insertOne({
        _id: userId,
        username,
        passwordHash: await hashPassword(password),
        name: `Participant ${label}`,
        role: 'instructor',
        profile: { isSynthetic: false, onboardingCompleted: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const clone = await cloneCourseForAccount(db, template, userId, anchor, dryRun);
    console.log(`[${label}] clone courseId=${clone.courseId} accessCode=${clone.accessCode}`);
    if (!dryRun) {
      console.log(`[${label}] acceptance checks:`);
      await verifyClone(db, clone.courseId, label);
    }
    manifest.accounts.push({ label, userId: userId.toString(), username, password, courseId: clone.courseId, accessCode: clone.accessCode });
  }

  if (!dryRun) {
    const file = path.join(__dirname, `study-manifest-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest written: ${file}`);
    console.log('KEEP IT SAFE — it contains the alias credentials and is the rollback key.');
    const courseList = manifest.accounts.map((a) => a.courseId).join(',');
    const userList = manifest.accounts.map((a) => a.userId).join(',');
    console.log('Probe-hook env values (Section 6 items 2-3):');
    console.log('  STUDY_PROBE=true');
    console.log(`  STUDY_PROBE_COURSES=${courseList}`);
    console.log(`  STUDY_PROBE_USERS=${userList}`);
    console.log('Cloud Run (the ^|^ prefix switches the delimiter — plain --update-env-vars would split these lists on their commas):');
    console.log(`  gcloud run services update studyassist-iitl-backend --region us-central1 --project llm-ed-studyassist --update-env-vars "^|^STUDY_PROBE=true|STUDY_PROBE_COURSES=${courseList}|STUDY_PROBE_USERS=${userList}"`);
  } else {
    console.log('\nDRY RUN complete — nothing written.');
  }
}

async function verifyManifest(db) {
  const file = arg('manifest') || die('--manifest required');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const acc of manifest.accounts) {
    console.log(`\n[${acc.label}] course ${acc.courseId}`);
    await verifyClone(db, acc.courseId, acc.label);
  }
  console.log('\nAll clones verified.');
}

async function rollback(db, { dryRun }) {
  const file = arg('manifest') || die('--manifest required');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const acc of manifest.accounts) {
    const cid = new mongoose.Types.ObjectId(acc.courseId);
    const uid = new mongoose.Types.ObjectId(acc.userId);
    console.log(`[${acc.label}] deleting clone ${acc.courseId} + account ${acc.username}`);
    if (dryRun) continue;
    await db.collection('milestoneattempts').deleteMany({ courseId: cid });
    await db.collection('sessions').deleteMany({ courseId: cid });
    await db.collection('enrollments').deleteMany({ courseId: cid });
    await db.collection('coursetopics').deleteMany({ courseId: cid });
    await db.collection('instructorstudentnotes').deleteMany({ courseId: cid });
    await db.collection('instructorchatsessions').deleteMany({ courseId: cid });
    // Cross-course assistant chats are scoped to the account (courseId: null)
    // and would otherwise orphan when the account is deleted.
    await db.collection('instructorchatsessions').deleteMany({ instructorId: uid });
    await db.collection('courses').deleteOne({ _id: cid });
    await db.collection('users').deleteOne({ _id: uid, role: 'instructor' }); // never a student
  }
  console.log(dryRun ? 'DRY RUN — nothing deleted.' : '✓ rollback complete (shared synthetic students untouched)');
}

// ---------- main ----------
(async () => {
  const cmd = process.argv[2];
  const dryRun = hasFlag('dry-run');
  const db = await connect();
  try {
    if (cmd === 'seed-maya') await seedMaya(db, { dryRun });
    else if (cmd === 'rollback-maya') await rollbackMaya(db, { dryRun });
    else if (cmd === 'provision') await provision(db, { dryRun });
    else if (cmd === 'verify') await verifyManifest(db);
    else if (cmd === 'rollback') await rollback(db, { dryRun });
    else die('usage: provisionStudyEnvironment.js <seed-maya|rollback-maya|provision|verify|rollback> [--dry-run] [--accounts P01-P14|--only LABEL] [--anchor-days-ago 2] [--manifest PATH]');
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

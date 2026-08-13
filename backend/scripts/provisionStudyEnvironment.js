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
 *   truncate       Cut a provisioned clone to the study's topic window:
 *                  keep topics 1-N published with all their sessions, quiz
 *                  attempts and transcripts; unpublish the rest and delete
 *                  the activity attached to them; then re-anchor. Takes a
 *                  label, a course id, or --all for every account in the
 *                  newest manifest. DATA-ONLY and idempotent — an already-cut
 *                  clone is detected and not cut twice. Transcript realism is
 *                  the scarce asset, which is why this truncates rather than
 *                  re-seeding a shorter course.
 *   prep-session   Run ~15 min before a participant session, one argument:
 *                  the label (P01) or the clone's course id. Re-anchors the
 *                  clone's dates, clears its Insights Assistant chat, then
 *                  verifies and prints GO / NO-GO. DATA-ONLY and idempotent:
 *                  it never re-clones and never changes an id, because
 *                  STUDY_PROBE_COURSES/USERS pin this clone's ids and a new
 *                  id would silently disable every probe. It also checks the
 *                  ids are actually IN the live probe allowlist and fires a
 *                  real probe, then deletes the test exchange.
 *
 * Flags:
 *   --dry-run            print planned actions, write nothing
 *   --accounts P01-P14   label range for `provision` (default P01-P14)
 *   --only LABEL         provision a single label (e.g. --only TEST01)
 *   --anchor-days-ago N  latest clone activity lands N days before now (default 2)
 *   --manifest PATH      manifest file for verify/rollback/truncate --all
 *   --cut-order N        truncate: keep topics with orderIndex < N (default 10)
 *   --service-url URL    Cloud Run base url for prep-session's probe test
 *
 * Usage (URI from Secret Manager — never paste into files):
 *   MONGODB_URI="$(gcloud secrets versions access latest \
 *     --secret=mongodb-uri-iitl --project=llm-ed-studyassist)" \
 *   node scripts/provisionStudyEnvironment.js provision --dry-run
 *
 * Acceptance checks (per clone, from the plan): tier mix exactly
 * 1 Critical / 1 High / 5 Watch; Maya ~75 Critical with avg 90.4 visible;
 * one High at ~44; session replay chain resolving. Deliberately NOT keyed to a
 * student's NAME: which synthetic student occupies the High tier depends on
 * how many topics are published, so a truncated clone can move it (at the
 * topic-10 cut it is Noah Yamamoto, not Budi Kim). The tier SHAPE is the
 * acceptance criterion; the occupant is not.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { hashPassword } = require('../utils/password');
const { computeRiskScore, getAtRiskStudents } = require('../services/milestoneAnalyticsService');
const { getCoursePerformanceSummary } = require('../services/analyticsService');
const { execFileSync } = require('child_process');

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
    // Pilot F19: the demo cohort's users all carry isSynthetic:false and no
    // personaTag, and the instructor UI renders a "SYN" badge from these — Maya
    // must be visually indistinguishable from the cohort, so she matches them.
    profile: { isSynthetic: false, onboardingCompleted: true },
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
  // Name-agnostic on purpose — see the header note. Truncating the course
  // changes which student sits in High without changing the tier shape.
  const high = tiers.high[0];

  const checks = [
    ['exactly 1 Critical', tiers.critical.length === 1],
    ['Critical is Maya', !!maya],
    [`Maya ≈75 (got ${maya?.riskScore})`, !!maya && Math.abs(maya.riskScore - 75) <= 5],
    [`Maya avg 90.4 visible (got ${maya?.quizScore})`, !!maya && maya.quizScore === 90.4],
    ['Maya flags: no_engagement+low_pass_rate+stuck_topic', !!maya && ['no_engagement', 'low_pass_rate', 'stuck_topic'].every((f) => maya.flags.includes(f))],
    ['exactly 1 High', tiers.high.length === 1 && !!high],
    [`High at ~44 (got ${high?.riskScore}${high ? `, ${high.name}` : ''})`, !!high && Math.abs(high.riskScore - 44) <= 3],
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

// ---------- shared study-shape checks ----------
/**
 * The data-shape acceptance the study depends on, in one place so `truncate`
 * and `prep-session` can never disagree about what "ready" means.
 * Returns { checks:[{name,ok,detail}], mix, maya, methods, rank, weakest }.
 */
async function dataShapeChecks(courseId) {
  const rows = await getAtRiskStudents(courseId, { excludeSynthetic: false });
  const mix = {};
  for (const r of rows) mix[r.riskLevel] = (mix[r.riskLevel] || 0) + 1;
  const maya = rows.find((r) => r.name === MAYA.name);

  const perf = await getCoursePerformanceSummary(courseId);
  const diff = (perf.quizByTopic || [])
    .filter((t) => t.firstAttemptPassRate != null)
    .sort((a, b) => a.firstAttemptPassRate - b.firstAttemptPassRate);
  const methods = diff.find((t) => /^methods/i.test(t.title));
  const rank = methods ? diff.indexOf(methods) + 1 : null;
  const weakest = diff[0] || null;

  const checks = [
    {
      name: 'tier mix 1 Critical / 1 High / 5 Watch / 14 Healthy',
      ok: mix.critical === 1 && mix.high === 1 && mix.watch === 5 && mix.healthy === 14,
      detail: `${mix.critical || 0}/${mix.high || 0}/${mix.watch || 0}/${mix.healthy || 0} over ${rows.length}`,
    },
    {
      name: 'Maya Critical ~75 with 90.4% visible',
      ok: !!maya && maya.riskLevel === 'critical' && Math.abs(maya.riskScore - 75) <= 5 && maya.quizScore === 90.4,
      detail: maya ? `${maya.riskLevel} ${Math.round(maya.riskScore)}, avg ${maya.quizScore}` : 'Maya not found',
    },
    {
      name: 'Methods ~63.2% at rank 4 of 10, Variables 57.9% weakest',
      ok: !!methods && Math.abs(methods.firstAttemptPassRate - 63.2) <= 3 && rank === 4 && diff.length === 10
          && !!weakest && /^variables/i.test(weakest.title) && Math.abs(weakest.firstAttemptPassRate - 57.9) <= 3,
      detail: methods
        ? `Methods ${methods.firstAttemptPassRate}% rank ${rank}/${diff.length}; weakest ${weakest.title} ${weakest.firstAttemptPassRate}%`
        : 'Methods ABSENT from the table',
    },
  ];
  return { checks, mix, maya, methods, rank, weakest, tableRows: diff.length };
}

// ---------- truncate (cut a provisioned clone to the study's topic window) ----------
/**
 * Keep topics [0, cutOrder) published with every session, quiz attempt and
 * transcript intact; unpublish the rest and delete the activity attached to
 * them. Then re-anchor.
 *
 * DATA-ONLY: no course, topic, user or enrollment id is created or rewritten,
 * because STUDY_PROBE_COURSES/USERS pin these ids. Transcript realism is the
 * scarce asset here, which is why this truncates rather than re-seeding.
 */
async function truncateClone(db, courseId, { cutOrder, anchorDays }) {
  const cid = new mongoose.Types.ObjectId(courseId);
  const topics = await db.collection('coursetopics').find({ courseId: cid }).sort({ orderIndex: 1 }).toArray();
  if (!topics.length) throw new Error('no topics found — wrong course id?');
  const keep = topics.filter((t) => (t.orderIndex ?? 0) < cutOrder);
  const drop = topics.filter((t) => (t.orderIndex ?? 0) >= cutOrder);
  const dropIds = drop.map((t) => t._id);

  const dropSessions = dropIds.length
    ? await db.collection('sessions').countDocuments({ courseId: cid, courseTopicId: { $in: dropIds } }) : 0;
  const stillPublished = drop.filter((t) => t.status === 'published').length;
  const alreadyCut = stillPublished === 0 && dropSessions === 0;

  let removed = { sessions: 0, milestoneAttempts: 0, unpublished: 0 };
  if (alreadyCut) {
    // Idempotent: nothing above the cut is published and nothing is attached
    // to it, so a second run must not delete anything or re-shift twice.
    removed.alreadyCut = true;
  } else {
    const dS = await db.collection('sessions').deleteMany({ courseId: cid, courseTopicId: { $in: dropIds } });
    const dM = await db.collection('milestoneattempts').deleteMany({ courseId: cid, courseTopicId: { $in: dropIds } });
    const uT = await db.collection('coursetopics').updateMany(
      { _id: { $in: dropIds } },
      { $set: { status: 'draft' }, $unset: { publishedAt: '' } }
    );
    removed = { sessions: dS.deletedCount, milestoneAttempts: dM.deletedCount, unpublished: uT.modifiedCount };
  }

  const anchorInfo = await reanchorClone(db, courseId, anchorDays);
  const publishedNow = await db.collection('coursetopics').countDocuments({ courseId: cid, status: 'published' });
  return { keep: keep.length, drop: drop.length, removed, anchorInfo, publishedNow, alreadyCut };
}

function newestManifest() {
  const explicit = arg('manifest');
  if (explicit) return { file: explicit, data: JSON.parse(fs.readFileSync(explicit, 'utf8')) };
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => /^study-manifest-.*\.json$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) die('no manifest found in scripts/');
  const file = path.join(dir, files[0].f);
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

async function truncateCmd(db) {
  const cutOrder = parseInt(arg('cut-order', '10'), 10);
  const anchorDays = parseFloat(arg('anchor-days-ago', '2'));
  const dryRun = hasFlag('dry-run');

  let targets;
  if (hasFlag('all')) {
    const { file, data } = newestManifest();
    console.log(`manifest: ${file}`);
    targets = data.accounts;
  } else {
    const t = process.argv[3];
    if (!t) die('usage: truncate <P01|courseId|--all> [--cut-order 10] [--anchor-days-ago 2] [--manifest PATH] [--dry-run]');
    const acct = findTarget(t);
    if (!acct) die(`no manifest entry found for "${t}"`);
    targets = [acct];
  }

  console.log(`cut at orderIndex ${cutOrder} (keep topics 1-${cutOrder}) · anchor ${anchorDays}d · ${targets.length} clone(s)${dryRun ? ' · DRY RUN' : ''}\n`);

  const results = [];
  for (const acct of targets) {
    process.stdout.write(`${acct.label} … `);
    try {
      if (dryRun) {
        const cid = new mongoose.Types.ObjectId(acct.courseId);
        const pub = await db.collection('coursetopics').countDocuments({ courseId: cid, status: 'published' });
        console.log(`would cut (currently ${pub} published)`);
        results.push({ label: acct.label, courseId: acct.courseId, dryRun: true });
        continue;
      }
      const cut = await truncateClone(db, acct.courseId, { cutOrder, anchorDays });
      const shape = await dataShapeChecks(acct.courseId);
      const publishedOk = cut.publishedNow === cutOrder;
      const checks = [
        { name: `exactly ${cutOrder} topics published`, ok: publishedOk, detail: `${cut.publishedNow} published` },
        ...shape.checks,
      ];
      const failed = checks.filter((c) => !c.ok);
      console.log(`${cut.alreadyCut ? 'already cut' : `cut −${cut.removed.sessions} sessions/−${cut.removed.milestoneAttempts} attempts`} · ${failed.length ? 'NO-GO' : 'GO'}`);
      results.push({ label: acct.label, courseId: acct.courseId, cut, shape, checks, failed });
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      results.push({ label: acct.label, courseId: acct.courseId, error: e.message });
    }
  }

  if (dryRun) return;

  // ---- summary table ----
  console.log(`\n${'='.repeat(104)}`);
  console.log('LABEL  PUB  TIER MIX (C/H/W/H)  MAYA            PROBE 2 (Methods)          VERDICT');
  console.log('='.repeat(104));
  for (const r of results) {
    if (r.error) { console.log(`${r.label.padEnd(6)} ${'—'.padEnd(4)} ${'—'.padEnd(19)} ${'—'.padEnd(15)} ${'—'.padEnd(26)} NO-GO (${r.error.slice(0, 30)})`); continue; }
    const m = r.shape.mix;
    const mix = `${m.critical || 0}/${m.high || 0}/${m.watch || 0}/${m.healthy || 0}`;
    const maya = r.shape.maya ? `${r.shape.maya.riskLevel.slice(0, 4)} ${Math.round(r.shape.maya.riskScore)} avg${r.shape.maya.quizScore}` : 'missing';
    const p2 = r.shape.methods ? `${r.shape.methods.firstAttemptPassRate}% rank ${r.shape.rank}/${r.shape.tableRows}` : 'ABSENT';
    const verdict = r.failed.length ? `NO-GO: ${r.failed[0].name}` : 'GO';
    console.log(`${r.label.padEnd(6)} ${String(r.cut.publishedNow).padEnd(4)} ${mix.padEnd(19)} ${maya.padEnd(15)} ${p2.padEnd(26)} ${verdict}`);
  }
  console.log('='.repeat(104));
  const bad = results.filter((r) => r.error || (r.failed && r.failed.length));
  if (bad.length === 0) {
    console.log(`ALL ${results.length} CLONES AT THE TOPIC-${cutOrder} SHAPE — GO`);
  } else {
    console.log(`${bad.length} of ${results.length} clone(s) NOT at the topic-${cutOrder} shape — NO-GO for those accounts:`);
    for (const r of bad) {
      if (r.error) { console.log(`  ${r.label}: ${r.error}`); continue; }
      for (const f of r.failed) console.log(`  ${r.label}: ${f.name} — ${f.detail}`);
    }
    process.exitCode = 1;
  }
}

// ---------- prep-session (run ~15 min before each participant session) ----------
/**
 * One command the moderator runs before handing a clone to a participant.
 *
 * Everything here is DATA-ONLY and idempotent: no re-clone, no new IDs, no env
 * change. That matters because STUDY_PROBE_COURSES / STUDY_PROBE_USERS pin the
 * clone's course and user IDs — re-cloning would silently disable all three
 * probes, which is exactly the failure this command exists to catch.
 */
const SERVICE_DEFAULTS = {
  service: 'studyassist-iitl-backend',
  region: 'us-central1',
  project: 'llm-ed-studyassist',
  url: 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app',
};
const PROBE_TRIGGER = 'what should I reteach next week?';
const PROBE_REPLY_SNIPPET = 'Methods has the lowest first-attempt pass rate at 63%';
const COLD_START_MS = 4000;

/** Find the clone by participant label (P01) or by course id, across manifests. */
function findTarget(target) {
  const dir = path.join(__dirname);
  const files = fs.readdirSync(dir)
    .filter((f) => /^study-manifest-.*\.json$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const acc of m.accounts || []) {
      if (String(acc.label) === String(target) || String(acc.courseId) === String(target)) {
        return { ...acc, manifest: f };
      }
    }
  }
  return null;
}

/**
 * Shift every timestamp uniformly so the latest activity lands anchorDays
 * before now. Relative spacing is preserved, so risk scores, the R1
 * new-enrollee grace and every per-topic metric come out unchanged.
 */
async function reanchorClone(db, courseId, anchorDays) {
  const cid = new mongoose.Types.ObjectId(courseId);
  const [sessions, msAll, enrolls, topics] = await Promise.all([
    db.collection('sessions').find({ courseId: cid }).toArray(),
    db.collection('milestoneattempts').find({ courseId: cid }).toArray(),
    db.collection('enrollments').find({ courseId: cid }).toArray(),
    db.collection('coursetopics').find({ courseId: cid }).toArray(),
  ]);
  let latest = 0;
  for (const s of sessions) {
    latest = Math.max(latest, new Date(s.updatedAt || 0).getTime());
    for (const a of (s.quizAttempts || [])) latest = Math.max(latest, new Date(a.submittedAt || a.createdAt || 0).getTime());
  }
  for (const m of msAll) latest = Math.max(latest, new Date(m.createdAt || 0).getTime());
  if (!latest) throw new Error('no activity found on this clone — wrong course id?');

  const wasDays = (Date.now() - latest) / DAY;
  const delta = (Date.now() - anchorDays * DAY) - latest;
  // Re-running minutes later is a no-op shift; skip the writes entirely.
  if (Math.abs(delta) < 60 * 1000) {
    console.log(`  already anchored (latest activity ${wasDays.toFixed(2)}d old) — no shift needed`);
    return { shiftedDays: 0, wasDays };
  }
  for (const s of sessions) {
    await db.collection('sessions').updateOne({ _id: s._id }, { $set: {
      createdAt: shiftDate(s.createdAt, delta),
      updatedAt: shiftDate(s.updatedAt, delta),
      quizAttempts: (s.quizAttempts || []).map((a) => ({
        ...a, submittedAt: shiftDate(a.submittedAt, delta), createdAt: shiftDate(a.createdAt, delta),
      })),
      messages: (s.messages || []).map((mm) => ({ ...mm, timestamp: shiftDate(mm.timestamp, delta) })),
    } });
  }
  for (const m of msAll) {
    await db.collection('milestoneattempts').updateOne({ _id: m._id }, {
      $set: { createdAt: shiftDate(m.createdAt, delta), updatedAt: shiftDate(m.updatedAt, delta) },
    });
  }
  for (const e of enrolls) {
    await db.collection('enrollments').updateOne({ _id: e._id }, { $set: {
      joinedAt: shiftDate(e.joinedAt, delta),
      createdAt: shiftDate(e.createdAt, delta),
      updatedAt: shiftDate(e.updatedAt, delta),
      ...(e.earliestActivity ? { earliestActivity: shiftDate(e.earliestActivity, delta) } : {}),
      ...(e.enrollmentCreatedAt ? { enrollmentCreatedAt: shiftDate(e.enrollmentCreatedAt, delta) } : {}),
    } });
  }
  for (const t of topics) {
    await db.collection('coursetopics').updateOne({ _id: t._id }, { $set: {
      ...(t.publishedAt ? { publishedAt: shiftDate(t.publishedAt, delta) } : {}),
      createdAt: shiftDate(t.createdAt, delta), updatedAt: shiftDate(t.updatedAt, delta),
    } });
  }
  console.log(`  shifted ${(delta / DAY).toFixed(2)}d — ${sessions.length} sessions, ${msAll.length} attempts, ${enrolls.length} enrollments, ${topics.length} topics`);
  return { shiftedDays: delta / DAY, wasDays };
}

/** Both the course-scoped chat and the account's cross-course (courseId:null) one. */
async function clearAssistantChat(db, courseId, userId) {
  const scoped = await db.collection('instructorchatsessions')
    .deleteMany({ courseId: new mongoose.Types.ObjectId(courseId) });
  const crossCourse = await db.collection('instructorchatsessions')
    .deleteMany({ instructorId: new mongoose.Types.ObjectId(userId), courseId: null });
  console.log(`  removed ${scoped.deletedCount} course-scoped + ${crossCourse.deletedCount} cross-course chat session(s)`);
  return scoped.deletedCount + crossCourse.deletedCount;
}

/** Read the LIVE service env, so a clone missing from the allowlist is caught. */
function readDeployedProbeEnv() {
  const out = execFileSync('gcloud', [
    'run', 'services', 'describe', arg('service', SERVICE_DEFAULTS.service),
    '--region', arg('region', SERVICE_DEFAULTS.region),
    '--project', arg('project', SERVICE_DEFAULTS.project),
    '--format=json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const spec = JSON.parse(out).spec.template.spec.containers[0];
  const env = {};
  for (const e of spec.env || []) env[e.name] = e.value;
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    enabled: String(env.STUDY_PROBE || '').toLowerCase() === 'true',
    courses: list(env.STUDY_PROBE_COURSES),
    users: list(env.STUDY_PROBE_USERS),
    revision: null,
  };
}

async function prepSession(db) {
  const target = process.argv[3];
  if (!target) die('usage: prep-session <P01|courseId> [--anchor-days-ago 2] [--service-url URL]');
  const acct = findTarget(target);
  if (!acct) die(`no manifest entry found for "${target}" (looked in scripts/study-manifest-*.json)`);
  const { courseId, userId, username, password, label } = acct;
  const baseUrl = arg('service-url', SERVICE_DEFAULTS.url).replace(/\/$/, '');
  const anchorDays = parseFloat(arg('anchor-days-ago', '2'));

  console.log(`\nPREP SESSION — ${label} (${username})`);
  console.log(`  course ${courseId}`);
  console.log(`  user   ${userId}`);
  console.log(`  manifest ${acct.manifest}\n`);

  console.log('1. RE-ANCHOR');
  const anchorInfo = await reanchorClone(db, courseId, anchorDays);

  console.log('\n2. CLEAR ASSISTANT CHAT');
  await clearAssistantChat(db, courseId, userId);

  console.log('\n3. VERIFY');
  const checks = [];
  const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`   ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

  // --- data shape: tier mix, probe 1, probe 2 ground truth ---
  // Shared with `truncate` so the two commands cannot disagree about what the
  // study needs from a clone.
  const shape = await dataShapeChecks(courseId);
  for (const c of shape.checks) add(c.name, c.ok, c.detail);

  // --- assistant chat empty ---
  const chatCount = await db.collection('instructorchatsessions').countDocuments({
    $or: [{ courseId: new mongoose.Types.ObjectId(courseId) }, { instructorId: new mongoose.Types.ObjectId(userId) }],
  });
  add('assistant chat empty', chatCount === 0, `${chatCount} chat session(s)`);

  // --- the check that catches an un-allowlisted clone ---
  let probeEnv = null;
  try { probeEnv = readDeployedProbeEnv(); } catch (e) { /* reported below */ }
  if (!probeEnv) {
    add('clone IDs present in the live STUDY_PROBE env', false, 'could not read the deployed service (gcloud)');
  } else {
    add('STUDY_PROBE enabled on the live service', probeEnv.enabled, `STUDY_PROBE=${probeEnv.enabled}`);
    add('course id in live STUDY_PROBE_COURSES', probeEnv.courses.includes(String(courseId)),
      `${probeEnv.courses.length} course(s) allowlisted`);
    add('user id in live STUDY_PROBE_USERS', probeEnv.users.includes(String(userId)),
      `${probeEnv.users.length} user(s) allowlisted`);
  }

  // --- probe actually fires (also the warm-up) ---
  const api = async (method, p, body, token) => {
    const res = await fetch(`${baseUrl}/v1${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${(json && json.error) || text.slice(0, 120)}`);
    return json && json.data !== undefined ? json.data : json;
  };

  let coldStartMs = null;
  try {
    const t0 = Date.now();
    const login = await api('POST', '/auth/login', { username, password });
    coldStartMs = Date.now() - t0;
    const reply = await api('POST', '/instructor/chat', { message: PROBE_TRIGGER, courseId }, login.accessToken);
    const text = String(reply.reply || reply.message || '');
    const noTools = !reply.toolCalls || reply.toolCalls.length === 0;
    // Summarise tool calls by NAME only. Dumping them verbatim buried the
    // verdict under ~11k characters of tool output, which is the last thing a
    // moderator needs fifteen minutes before a session.
    const toolNames = (reply.toolCalls || []).map((t) => t && t.name).filter(Boolean);
    add('probe 2 fires: canned Methods reply, zero tool calls',
      text.includes(PROBE_REPLY_SNIPPET) && noTools,
      text.includes(PROBE_REPLY_SNIPPET)
        ? `canned reply, ${toolNames.length} tool call(s)`
        : `NOT the canned reply — the real agent answered (${toolNames.length} tool call(s)${toolNames.length ? ': ' + toolNames.join(', ') : ''}). The probe is DISABLED for this course.`);
  } catch (e) {
    add('probe 2 fires: canned Methods reply, zero tool calls', false, e.message);
  }

  // The probe test just wrote an exchange; remove it so the chat is empty again.
  console.log('\n4. CLEAN UP THE PROBE TEST');
  await clearAssistantChat(db, courseId, userId);
  const finalChat = await db.collection('instructorchatsessions').countDocuments({
    $or: [{ courseId: new mongoose.Types.ObjectId(courseId) }, { instructorId: new mongoose.Types.ObjectId(userId) }],
  });
  add('assistant chat empty after the probe test', finalChat === 0, `${finalChat} chat session(s)`);

  // --- warm-up / cold start ---
  console.log('\n5. SERVICE WARM-UP');
  if (coldStartMs == null) {
    console.log('   could not measure (the API call failed above)');
  } else if (coldStartMs > COLD_START_MS) {
    console.log(`   COLD START DETECTED — first call took ${coldStartMs}ms.`);
    console.log('   The verify calls have now warmed it, but load the dashboard once before the participant arrives.');
  } else {
    console.log(`   service was already warm (first call ${coldStartMs}ms)`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${'='.repeat(64)}`);
  if (failed.length === 0) {
    console.log(`GO — ${label} is ready to hand to the participant`);
    console.log(`  course ${courseId} · access code ${acct.accessCode || 'n/a'} · login ${username}`);
  } else {
    console.log(`NO-GO — ${failed.length} check(s) failed:`);
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  console.log('='.repeat(64));
  if (failed.length) process.exitCode = 1;
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
    else if (cmd === 'truncate') await truncateCmd(db);
    else if (cmd === 'prep-session') await prepSession(db);
    else die('usage: provisionStudyEnvironment.js <seed-maya|rollback-maya|provision|verify|rollback|truncate|prep-session> [--dry-run] [--accounts P01-P14|--only LABEL] [--anchor-days-ago 2] [--manifest PATH]');
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

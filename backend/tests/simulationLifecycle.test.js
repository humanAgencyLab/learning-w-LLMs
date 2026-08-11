/**
 * Simulation Phase 2 lifecycle: stale-run watchdog, single-persona re-run, and
 * discard that reaps superseded accounts.
 *
 * These three exist because the runner is an in-process job on a service that
 * scales to zero. The failure they address is not hypothetical: a container
 * restart mid-run leaves a document in 'running' with nothing alive to finish
 * it, the instructor's card polls forever, and the one-active-run guard then
 * blocks that course from ever starting another simulation.
 */
const mongoose = require('mongoose');
const SimulationRun = require('../models/SimulationRun');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const {
  reapStaleRuns, retryStudent, discardRun, STALE_AFTER_MS,
} = require('../services/simulation/simulationRunService');

jest.mock('groq-sdk', () => ({
  Groq: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    responses: { create: jest.fn() },
  })),
}));

const oid = () => new mongoose.Types.ObjectId();
const minsAgo = (n) => new Date(Date.now() - n * 60 * 1000);

describe('simulation lifecycle', () => {
  const courseId = oid();
  const created = [];

  const makeRun = (over = {}) => SimulationRun.create({
    courseId,
    courseTopicId: oid(),
    instructorId: oid(),
    status: 'running',
    students: [
      { persona: 'earnest', status: 'completed', turns: 3 },
      { persona: 'boundary', status: 'running', stage: 'chatting' },
    ],
    ...over,
  }).then((r) => { created.push(r._id); return r; });

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ai_edu_app_test');
    }
  });

  afterAll(async () => {
    await SimulationRun.deleteMany({ courseId });
  });

  afterEach(async () => {
    await SimulationRun.deleteMany({ courseId });
  });

  describe('stale-run watchdog', () => {
    it('fails a run whose job died, and marks only the unfinished students', async () => {
      const run = await makeRun({ lastProgressAt: minsAgo(30) });
      const n = await reapStaleRuns({ courseId });
      expect(n).toBe(1);

      const after = await SimulationRun.findById(run._id).lean();
      expect(after.status).toBe('failed');
      expect(after.error).toMatch(/stalled/i);
      expect(after.finishedAt).toBeTruthy();
      // The student that genuinely finished keeps its result.
      expect(after.students[0].status).toBe('completed');
      expect(after.students[0].turns).toBe(3);
      expect(after.students[1].status).toBe('failed');
      expect(after.students[1].stage).toBe('stalled');
    });

    it('leaves a slow-but-alive run alone — it keys on progress, not on start time', async () => {
      // Started long ago, but beat recently: two students x an 8 minute budget
      // is legitimately slow and must never be reaped mid-flight.
      const run = await makeRun({ startedAt: minsAgo(60), lastProgressAt: minsAgo(1) });
      expect(await reapStaleRuns({ courseId })).toBe(0);
      expect((await SimulationRun.findById(run._id).lean()).status).toBe('running');
    });

    it('reaps a queued run that never recorded any progress at all', async () => {
      const run = await SimulationRun.create({
        courseId, courseTopicId: oid(), instructorId: oid(), status: 'queued',
        students: [{ persona: 'earnest', status: 'pending' }],
        lastProgressAt: null,
        createdAt: minsAgo(45),
      });
      created.push(run._id);
      // createdAt is set by timestamps, so force it to the past explicitly.
      await mongoose.connection.db.collection('simulationruns')
        .updateOne({ _id: run._id }, { $set: { createdAt: minsAgo(45) } });

      expect(await reapStaleRuns({ courseId })).toBe(1);
      expect((await SimulationRun.findById(run._id).lean()).status).toBe('failed');
    });

    it('never touches a run that already reached a terminal state', async () => {
      const run = await makeRun({ status: 'completed', lastProgressAt: minsAgo(999) });
      expect(await reapStaleRuns({ courseId })).toBe(0);
      expect((await SimulationRun.findById(run._id).lean()).status).toBe('completed');
    });

    it('uses a threshold longer than one student\'s wall-clock budget', () => {
      const { WALL_CLOCK_MS_PER_STUDENT } = require('../services/simulation/simulationRunService');
      expect(STALE_AFTER_MS).toBeGreaterThan(WALL_CLOCK_MS_PER_STUDENT);
    });
  });

  describe('re-run one failed persona', () => {
    it('refuses unless that student actually failed', async () => {
      const run = await makeRun({ status: 'completed', students: [
        { persona: 'earnest', status: 'completed' },
        { persona: 'boundary', status: 'completed' },
      ] });
      expect((await retryStudent(run._id, 'earnest')).code).toBe('NOT_FAILED');
    });

    it('refuses while the run is still active, and after it was discarded', async () => {
      const active = await makeRun({ status: 'running' });
      expect((await retryStudent(active._id, 'boundary')).code).toBe('RUN_ACTIVE');
      const gone = await makeRun({ status: 'discarded' });
      expect((await retryStudent(gone._id, 'boundary')).code).toBe('RUN_DISCARDED');
    });

    it('refuses an unknown persona', async () => {
      const run = await makeRun({ status: 'partial' });
      expect((await retryStudent(run._id, 'nope')).code).toBe('NO_SUCH_PERSONA');
    });

    it('resets only the failed student and keeps the other transcript intact', async () => {
      const oldUser = oid();
      const run = await makeRun({
        status: 'partial',
        students: [
          { persona: 'earnest', status: 'completed', turns: 4, userId: oid(), scoredQuizPct: 80 },
          { persona: 'boundary', status: 'failed', turns: 1, userId: oldUser, error: 'upstream 503' },
        ],
      });

      const res = await retryStudent(run._id, 'boundary');
      expect(res.ok).toBe(true);

      const after = await SimulationRun.findById(run._id).lean();
      // Untouched.
      expect(after.students[0].status).toBe('completed');
      expect(after.students[0].turns).toBe(4);
      expect(after.students[0].scoredQuizPct).toBe(80);
      // Reset, and pointed at a fresh account rather than resuming the old one:
      // /start RESUMES a session, so reuse would hand the tutor a half-finished
      // transcript and break comparability with other participants.
      expect(after.students[1].userId).toBeNull();
      expect(after.students[1].error).toBe('');
      expect(after.students[1].turns).toBe(0);
      expect(after.students[1].attempts).toBe(1);
      expect(after.students[1].supersededUserIds.map(String)).toEqual([String(oldUser)]);
      expect(after.status).toBe('running');
    });
  });

  describe('discard reaps superseded accounts too', () => {
    it('counts users from earlier attempts, not just the current one', async () => {
      const cur = await User.create({
        username: `sim_cur_${Date.now()}`, passwordHash: 'x'.repeat(60), name: 'Cur',
        email: `cur${Date.now()}@t.local`, profile: { isSimulation: true },
      });
      const old = await User.create({
        username: `sim_old_${Date.now()}`, passwordHash: 'x'.repeat(60), name: 'Old',
        email: `old${Date.now()}@t.local`, profile: { isSimulation: true },
      });
      const run = await makeRun({
        status: 'partial',
        students: [{
          persona: 'boundary', status: 'completed',
          userId: cur._id, supersededUserIds: [old._id], attempts: 2,
        }],
      });

      const dry = await discardRun(run._id, { dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.userIds.sort()).toEqual([String(cur._id), String(old._id)].sort());
      expect(dry.counts.users).toBe(2);
      // A dry run must not have deleted anything.
      expect(await User.countDocuments({ _id: { $in: [cur._id, old._id] } })).toBe(2);

      const real = await discardRun(run._id);
      expect(real.counts.users).toBe(2);
      expect(await User.countDocuments({ _id: { $in: [cur._id, old._id] } })).toBe(0);
      expect((await SimulationRun.findById(run._id).lean()).status).toBe('discarded');
      await Enrollment.deleteMany({ studentId: { $in: [cur._id, old._id] } });
    });
  });
});

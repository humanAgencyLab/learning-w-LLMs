const mongoose = require('mongoose');

/**
 * One "Run simulation" invocation (SIMULATION_FEATURE_PLAN.md Section 2).
 *
 * Replaces the live A5 role-play: two synthetic students work through one
 * module of a published topic against the REAL tutor over the real HTTP student
 * path, leaving genuine session transcripts and quiz attempts for the
 * instructor to read and judge against the instructions they wrote.
 *
 * The record is what makes a run re-runnable and discardable — discard deletes
 * exactly the users/enrollments/sessions/attempts listed here rather than every
 * synthetic user in the database.
 */
const SimulationStudentSchema = new mongoose.Schema(
  {
    persona: { type: String, enum: ['earnest', 'boundary'], required: true },
    displayName: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudySession', default: null },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    /** Human-readable progress line for the polling card. */
    stage: { type: String, default: '' },
    turns: { type: Number, default: 0 },
    /** Quiz answered by intent against the leaked key; both sides recorded. */
    intendedQuizCorrect: { type: Number, default: null },
    quizQuestionCount: { type: Number, default: null },
    scoredQuizPct: { type: Number, default: null },
    quizSkipped: { type: Boolean, default: false },
    /** Which tutor branch each verbatim probe landed in (grading is nondeterministic). */
    probeOutcomes: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
    /**
     * How many times this persona has been executed, including re-runs. A
     * re-run creates a NEW account and session rather than resuming the old
     * one — /start resumes an existing session, so reusing the account would
     * hand the tutor a half-finished transcript and make the second run
     * incomparable with every other participant's.
     */
    attempts: { type: Number, default: 0 },
    /** userIds from superseded attempts, so discard still reaps them. */
    supersededUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { _id: false }
);

const SimulationRunSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    courseTopicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', required: true },
    topicTitle: { type: String, default: '' },
    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'partial', 'failed', 'discarded'],
      default: 'queued',
      index: true,
    },
    /**
     * Course.globalInstructions as they stood at launch. The tutor re-reads
     * instructions every message, and A6 has the instructor revising them, so
     * the transcript must record what was actually being tested.
     */
    instructionsSnapshot: { type: String, default: '' },
    /**
     * Which tutor code path the run exercised, recorded so analysis can
     * condition on it (USE_MULTI_AGENT selects entirely different paths).
     */
    tutorPath: { type: String, default: '' },
    transport: { type: String, default: 'non-streaming' },
    students: { type: [SimulationStudentSchema], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    /**
     * Bumped on every persisted step. The runner is an in-process job, so a
     * container restart mid-run (Cloud Run scales to zero) leaves a document
     * stuck in 'running' with nothing left to finish it. The watchdog reads
     * this rather than startedAt so a slow-but-alive run is never reaped.
     */
    lastProgressAt: { type: Date, default: null },
    error: { type: String, default: '' },
    tokenEstimate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SimulationRunSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model('SimulationRun', SimulationRunSchema);

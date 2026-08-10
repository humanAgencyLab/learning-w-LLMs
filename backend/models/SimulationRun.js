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
    error: { type: String, default: '' },
    tokenEstimate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SimulationRunSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model('SimulationRun', SimulationRunSchema);

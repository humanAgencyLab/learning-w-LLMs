const mongoose = require('mongoose');

/**
 * A recorded instance of the tutor refusing a student request (Addition 1).
 *
 * Refusals are deliberately invisible to every learning analytic: a refused
 * turn records no MilestoneAttempt, increments no retry count, and advances no
 * milestone. That is correct — a refusal is not a wrong answer — but it means a
 * student who only ever triggers refusals leaves NO trace in the risk model.
 * This collection is that trace, and it is the instructor-facing record five of
 * six pilot personas asked for.
 */
const TutorRefusalEventSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    courseTopicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', default: null },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudySession', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** safety_floor = never allowed; instructor_constraint = this course's rule. */
    category: {
      type: String,
      enum: ['safety_floor', 'instructor_constraint'],
      required: true,
    },
    /** The instructor's own sentence that the request violated (verbatim), if any. */
    clause: { type: String, default: '', maxlength: 1000 },
    /** Short machine-written explanation shown to the instructor. */
    refusalReason: { type: String, default: '', maxlength: 1000 },
    /** What made the call — the deterministic pre-filter or the model gate. */
    detectedBy: { type: String, enum: ['prefilter', 'model'], required: true },
    /** Excerpt of the student's message, capped. Full text lives in the transcript. */
    studentMessage: { type: String, default: '', maxlength: 2000 },
    /** Milestone context for the instructor, recorded but NOT used in the decision. */
    milestoneText: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

TutorRefusalEventSchema.index({ courseId: 1, createdAt: -1 });
TutorRefusalEventSchema.index({ courseId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('TutorRefusalEvent', TutorRefusalEventSchema);

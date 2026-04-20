const MilestoneAttempt = require('../models/MilestoneAttempt');
const User = require('../models/User');

/**
 * Record a single milestone-answer attempt. Never throws — a failed write
 * should not break the chat flow. Called from chatRoutes after each
 * assessment analysis where the student actually answered (not a
 * clarification request).
 *
 * @param {Object} params
 * @param {Object} params.session  the Session document (or lean object)
 * @param {number} params.milestoneIndex
 * @param {string} [params.milestoneText]
 * @param {boolean} params.passed
 * @param {boolean} [params.autoAdvanced]
 * @param {number} [params.attemptNumber]
 * @returns {Promise<Object|null>} the saved attempt, or null on failure
 */
async function recordMilestoneAttempt({
  session,
  milestoneIndex,
  milestoneText = '',
  passed,
  autoAdvanced = false,
  attemptNumber = 1,
}) {
  try {
    if (!session || !session.userId || !session.courseId) return null;
    if (typeof milestoneIndex !== 'number' || milestoneIndex < 0) return null;

    // Cache isSynthetic on the row so analytics filtering is a single-collection query.
    let isSynthetic = false;
    try {
      const user = await User.findById(session.userId).select('profile.isSynthetic').lean();
      isSynthetic = !!(user && user.profile && user.profile.isSynthetic);
    } catch (_) {
      /* non-fatal */
    }

    const doc = await MilestoneAttempt.create({
      userId: session.userId,
      courseId: session.courseId,
      courseTopicId: session.courseTopicId || null,
      sessionId: session._id,
      moduleId: session.activeModuleId || null,
      milestoneIndex,
      milestoneText,
      passed: !!passed,
      autoAdvanced: !!autoAdvanced,
      attemptNumber: Math.max(1, attemptNumber),
      isSynthetic,
    });
    return doc;
  } catch (err) {
    console.warn('[milestoneAttemptService] record failed:', err?.message || err);
    return null;
  }
}

module.exports = { recordMilestoneAttempt };

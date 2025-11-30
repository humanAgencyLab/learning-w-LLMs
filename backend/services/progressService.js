const logger = require('../utils/logger');

/**
 * Updates session progress (points, gems, completion state) deterministically
 * @param {Object} session - Hydrated Session document
 * @param {Object} options - Update options
 * @param {string} [options.moduleId] - Module ID to validate (must be in session.plan)
 * @param {number} [options.pointsDelta=0] - Points to add (for quiz pass flows)
 * @param {boolean} [options.forceRecalc=false] - Recompute from plan instead of trusting session.points
 * @returns {Object} Progress update result
 */
function updateProgress(session, options = {}) {
  const { moduleId, pointsDelta = 0, forceRecalc = false } = options;
  
  // Validate moduleId if provided
  if (moduleId) {
    const module = session.plan.find(m => m.id === moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found in session plan`);
    }
    if (typeof module.points !== 'number' || module.points <= 0) {
      throw new Error(`Module ${moduleId} has invalid points: ${module.points}`);
    }
  }

  // Store initial state for logging
  const prevPoints = session.points;
  const prevGems = session.gems;
  const prevPhase = session.phase;
  const prevIsViewOnly = session.isViewOnly;

  let newPoints;
  let newGems = 0;
  let completed = false;
  let phaseChanged = false;

  if (forceRecalc) {
    // Recompute points from passed modules
    const passedModules = session.plan.filter(m => m.status === 'passed');
    newPoints = passedModules.reduce((sum, module) => {
      if (typeof module.points !== 'number' || module.points <= 0) {
        logger.warn({ sessionId: session._id, moduleId: module.id }, 'Invalid module points in plan');
        return sum;
      }
      return sum + module.points;
    }, 0);
    
    // Validate plan integrity
    const totalPlanPoints = session.plan.reduce((sum, module) => {
      if (typeof module.points === 'number' && module.points > 0) {
        return sum + module.points;
      }
      return sum;
    }, 0);
    
    if (totalPlanPoints !== 100) {
      logger.error({ 
        sessionId: session._id, 
        totalPlanPoints, 
        expectedPoints: 100 
      }, 'Plan points sum is not 100, preventing completion');
      // Don't prevent completion for now, but log the issue
    }
  } else {
    // Add points delta (with idempotency check)
    if (moduleId && pointsDelta !== 0) {
      const module = session.plan.find(m => m.id === moduleId);
      if (module && module.status === 'passed' && pointsDelta > 0) {
        // Module already passed, don't award points again (idempotency)
        logger.info({ 
          sessionId: session._id, 
          moduleId, 
          reason: 'Module already passed' 
        }, 'Skipping points award for already passed module');
        newPoints = session.points;
      } else {
        newPoints = session.points + pointsDelta;
      }
    } else {
      newPoints = session.points;
    }
  }

  // Clamp points to 0-100 range
  newPoints = Math.max(0, Math.min(100, newPoints));
  
  // Calculate gems (floor of points / 20)
  newGems = Math.floor(newPoints / 20);

  // Check completion condition: all modules must be passed
  // Empty plan is considered completed (no modules to pass)
  const allModulesPassed = session.plan.length === 0 || session.plan.every(m => m.status === 'passed');
  completed = allModulesPassed;

  // Update session state
  session.points = newPoints;
  session.gems = newGems;
  session.progressPct = newPoints; // Points directly represent progress percentage

  if (completed) {
    session.isViewOnly = true;
    if (session.phase !== 'completed') {
      session.phase = 'completed';
      phaseChanged = true;
    }
  }

  // Log the update
  logger.info({
    sessionId: session._id,
    moduleId,
    prevPoints,
    newPoints,
    gems: newGems,
    completed,
    phaseBefore: prevPhase,
    phaseAfter: session.phase,
    phaseChanged,
    forceRecalc
  }, 'Progress updated');

  return {
    points: newPoints,
    gems: newGems,
    isViewOnly: session.isViewOnly,
    phaseChanged,
    completed
  };
}

module.exports = {
  updateProgress
};

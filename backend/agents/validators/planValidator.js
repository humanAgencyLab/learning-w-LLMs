function validatePlan(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object'] };
  }

  if (!output.topic || typeof output.topic !== 'string' || output.topic.trim() === '') {
    errors.push('topic is required and must be a non-empty string');
  }

  const plan = output.plan;
  if (!Array.isArray(plan)) {
    return { valid: false, errors: ['plan must be an array of modules'] };
  }

  if (plan.length < 2 || plan.length > 8) {
    errors.push(`plan must have 2-8 modules, got ${plan.length}`);
  }

  for (let i = 0; i < plan.length; i++) {
    const mod = plan[i];
    if (!mod.moduleId) errors.push(`module ${i}: missing moduleId`);
    if (!mod.title || mod.title.trim() === '') errors.push(`module ${i}: missing title`);

    const targets = mod.targets;
    if (!Array.isArray(targets) || targets.length < 3 || targets.length > 6) {
      errors.push(`module ${i}: must have 3-6 targets (milestones), got ${targets?.length || 0}`);
    }

    if (typeof mod.points !== 'number' || mod.points <= 0) {
      errors.push(`module ${i}: points must be a positive number`);
    }
  }

  const totalPoints = plan.reduce((sum, m) => sum + (m.points || 0), 0);
  if (totalPoints < 90 || totalPoints > 110) {
    errors.push(`total points should be ~100, got ${totalPoints}`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validatePlan };

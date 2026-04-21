'use strict';

module.exports = {
  id: 'excellent',
  label: 'High-performing — passes most milestones first try',
  abilityFn: () => 0.88 + Math.random() * 0.08, // p(correct) in [0.88, 0.96]
  retryPolicy: {
    maxReflectionRetries: 1,
    maxChatTurnsPerMilestone: 2,
    giveUpProbability: 0.01,
  },
  quiz: {
    baseCorrectProb: 0.92,
    noiseStddev: 0.04,
  },
  reflection: {
    depth: 'concise-correct',
    confusionRate: 0.05,
  },
  personaSuffix: [
    'You are doing well in this material. You produce concise, accurate answers and rarely need retries.',
    'You occasionally make small precision errors but correct yourself. You do not ramble.',
  ].join(' '),
};

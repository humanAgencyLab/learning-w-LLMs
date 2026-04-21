'use strict';

module.exports = {
  id: 'average',
  label: 'Typical performer — mixed retries, typical scores',
  abilityFn: () => 0.60 + Math.random() * 0.12, // p(correct) in [0.60, 0.72]
  retryPolicy: {
    maxReflectionRetries: 2,
    maxChatTurnsPerMilestone: 4,
    giveUpProbability: 0.05,
  },
  quiz: {
    baseCorrectProb: 0.65,
    noiseStddev: 0.08,
  },
  reflection: {
    depth: 'medium',
    confusionRate: 0.22,
  },
  personaSuffix: [
    'You are a typical mid-range student. You get most things mostly right on the second try.',
    'You sometimes skip a detail and need to be nudged back. You are patient but not super thorough.',
  ].join(' '),
};

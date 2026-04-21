'use strict';

module.exports = {
  id: 'aboutToFail',
  label: 'Struggling — likely to drop or fail without intervention',
  abilityFn: () => 0.30 + Math.random() * 0.12, // p(correct) in [0.30, 0.42]
  retryPolicy: {
    maxReflectionRetries: 3,
    maxChatTurnsPerMilestone: 6,
    giveUpProbability: 0.20,
  },
  quiz: {
    baseCorrectProb: 0.35,
    noiseStddev: 0.08,
  },
  reflection: {
    depth: 'shallow',
    confusionRate: 0.55, // fraction of turns that explicitly ask for help
  },
  personaSuffix: [
    'You are currently struggling with this material. You often misread questions, produce half-formed',
    'explanations, and retry the same point in different words when corrected. You sometimes say "I',
    'don\'t really get this" or ask the tutor to rephrase. You never pretend to understand when you do not.',
  ].join(' '),
};

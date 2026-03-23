const { runAgent } = require('./framework/baseAgent');

const SYSTEM = `You are a curriculum designer. Given course context and strategy, propose draft topics with modules and milestones for an adaptive tutoring app.

Rules:
- Each topic has 1-8 modules; each module has 2-8 milestones (short, teachable bullets).
- moduleId must be unique per module (slug like "mod_intro_1").
- points per module: 5-25 integer.
- difficulty per module: intro | core | apply.
- order topics logically.

Return ONLY valid JSON:
{
  "topics": [
    {
      "title": "...",
      "objective": "...",
      "orderIndex": 0,
      "modules": [
        {
          "moduleId": "mod_1",
          "title": "...",
          "description": "...",
          "difficulty": "core",
          "points": 10,
          "milestones": [{ "text": "..." }, { "text": "..." }],
          "quizPattern": {
            "questionCount": 5,
            "cognitiveLevel": "understand",
            "constraints": ""
          }
        }
      ]
    }
  ]
}`;

/**
 * @param {object} opts
 * @param {string} opts.contextText - from courseContextService
 * @param {object} opts.planStrategy - course.planStrategy
 * @param {number} opts.topicCount - override count
 */
async function runTopicPlanGeneratorAgent({ contextText, planStrategy, topicCount }) {
  const count = topicCount ?? planStrategy?.topicCount ?? 4;
  const strategyType = planStrategy?.type || 'module_based';
  const notes = planStrategy?.customNotes || '';

  const userPrompt = `Planning strategy: ${strategyType}
Target topic count: ${count}
Instructor notes: ${notes}

Course material and instructions:
${contextText}

Generate exactly ${count} topics (or fewer only if material is too thin — prefer ${count}).`;

  return runAgent({
    taskName: 'topic_plan',
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens: 4000,
    temperature: 0.35
  });
}

module.exports = { runTopicPlanGeneratorAgent };

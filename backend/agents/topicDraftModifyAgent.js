const { runAgent } = require('./framework/baseAgent');

const SYSTEM = `You are a curriculum designer editing a SINGLE draft topic for an adaptive tutoring app.
You receive the topic's current JSON and an instructor modification request. Apply the changes.

Rules:
- Keep the same title unless the instructor explicitly asks to rename it.
- 1-8 modules per topic; each module has 2-8 milestones (short, teachable bullets).
- moduleId must be unique per module (slug like "mod_intro_1").
- points per module: 5-25 integer.
- difficulty per module: intro | core | apply. Judge against THIS COURSE's level
  (intro = first meeting the concept, core = standard competence, apply =
  synthesis/transfer). Do not reflexively tag the first module "intro", and do
  correct an existing plan whose tiers are clearly wrong for the material.
- For quizPattern.cognitiveLevel use only: remember | understand | apply | analyze | evaluate | create
- syllabusAnchors: keep existing ones unless the change logically requires updating them.

Return ONLY valid JSON — a single topic object:
{
  "title": "...",
  "objective": "...",
  "syllabusAnchors": ["..."],
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
}`;

/**
 * @param {object} opts
 * @param {object} opts.topic - current topic document (lean)
 * @param {string} opts.modificationRequest
 */
async function runTopicDraftModifyAgent({ topic, modificationRequest }) {
  const moduleSummary = (topic.modules || []).map((m, i) => {
    const ms = (m.milestones || []).map((s) => s.text).join('; ');
    return `  ${i + 1}. "${m.title}" (${m.difficulty}, ${m.points}pts) — milestones: ${ms}`;
  }).join('\n');

  const userPrompt = `Current topic:
Title: "${topic.title}"
Objective: "${topic.objective || ''}"
Syllabus anchors: ${(topic.syllabusAnchors || []).join(', ') || '(none)'}
Modules:
${moduleSummary || '  (none)'}

Instructor request:
"${modificationRequest}"

Apply the changes and return the updated topic JSON.`;

  return runAgent({
    taskName: 'topic_draft_modify',
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens: 3000,
    temperature: 0.3
  });
}

module.exports = { runTopicDraftModifyAgent };

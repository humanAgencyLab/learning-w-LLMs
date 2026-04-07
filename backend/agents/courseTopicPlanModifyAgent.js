const { runAgent } = require('./framework/baseAgent');

const SYSTEM = `You are a curriculum designer modifying an existing set of course topics for an adaptive tutoring app.
You receive the current topics (some may be approved/published and MUST NOT be changed), the instructor's chat history, the syllabus context, and a modification request.

Rules:
- The instructor's latest modification request OVERRIDES prior topic count, grouping, or structure unless it is physically impossible (e.g. conflicts with locked topics).
- Output the COMPLETE set of draft topics after applying the requested changes. Approved/published topics are shown for context but MUST NOT appear in your output.
- You may add, remove, rename, merge, or split draft topics as the instructor asks.
- Topic granularity: when topicBasis is provided (week/module/unit), you MUST output exactly the required number of draft topics where each topic corresponds to one numbered boundary of that basis; do NOT merge multiple numbered boundaries into one topic.
- Preserve syllabus coverage: the union of ALL topics (your output + the locked ones shown for context) must still cover the full scope of the primary syllabus.
- Syllabus filename grounding (critical for validation): in syllabusCoverageOverview, explicitly and verbatim mention each primary syllabus filename listed in the "Primary syllabus files" section of your prompt. (Reference-only files do not need to be named.)
- Each topic must include "syllabusAnchors": 1–6 short strings naming units/headings from the syllabus.
- Include "syllabusCoverageOverview" mapping all major syllabus areas to topic titles (including locked topics you did not output).
- Each topic title MUST be unique across the entire set (including locked ones).
- Each topic has 1-8 modules; each module has 2-8 milestones (short, teachable bullets).
- moduleId must be unique per module (slug like "mod_intro_1").
- points per module: 5-25 integer.
- difficulty per module: intro | core | apply.
- Order topics logically (orderIndex from 0).

For quizPattern.cognitiveLevel use only: remember | understand | apply | analyze | evaluate | create

Return ONLY valid JSON:
{
  "syllabusCoverageOverview": "string — full coverage map including locked topics",
  "topics": [
    {
      "title": "...",
      "objective": "...",
      "orderIndex": 0,
      "syllabusAnchors": ["Unit 2: ..."],
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
 * @param {string} opts.contextText
 * @param {object} opts.planStrategy
 * @param {string[]} opts.syllabusSourceNames
 * @param {string[]} opts.referenceSourceNames
 * @param {boolean} opts.truncated
 * @param {string[]} opts.outlineHints
 * @param {Array<{title:string, status:string, modules:any[]}>} opts.currentTopics
 * @param {Array<{role:string, content:string}>} opts.chatHistory
 * @param {string} opts.modificationRequest
 * @param {number} [opts.targetDraftTopicCount] - when set, output exactly this many drafts (1–20)
 * @param {boolean} [opts.perUnitRequested]
 * @param {string} [opts.topicBasis] - 'week'|'module'|'unit'|'segment'|'explicit'
 * @param {string} [opts.topicCountRationale]
 */
async function runCourseTopicPlanModifyAgent({
  contextText,
  planStrategy,
  syllabusSourceNames = [],
  referenceSourceNames = [],
  truncated = false,
  outlineHints = [],
  currentTopics = [],
  chatHistory = [],
  modificationRequest,
  targetDraftTopicCount,
  perUnitRequested = false,
  topicCountRationale = '',
  topicBasis = 'segment'
}) {
  const lockedTopics = currentTopics
    .filter((t) => t.status !== 'draft')
    .map((t, i) => `  [LOCKED ${t.status}] ${i + 1}. "${t.title}" — ${t.modules?.length || 0} modules`)
    .join('\n');

  const draftTopics = currentTopics
    .filter((t) => t.status === 'draft')
    .map((t, i) => {
      const mods = (t.modules || []).map((m) =>
        `    - ${m.title} (${m.difficulty}, ${m.points}pts, ${m.milestones?.length || 0} milestones)`
      ).join('\n');
      return `  [DRAFT] ${i + 1}. "${t.title}"\n${mods}`;
    })
    .join('\n');

  const chatBlock = chatHistory.length > 0
    ? `\nPrior instructor conversation:\n${chatHistory.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  const syllabusBlock = syllabusSourceNames.length > 0
    ? `Primary syllabus files:\n${syllabusSourceNames.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const requiredFilenameHeader =
    syllabusSourceNames.length > 0
      ? `\nCRITICAL: In your "syllabusCoverageOverview" string, you MUST include this exact substring (verbatim, including punctuation) somewhere near the start:\nPrimary syllabus files: ${syllabusSourceNames.join('; ')}\n`
      : '';

  const referenceBlock = referenceSourceNames.length > 0
    ? `Reference materials:\n${referenceSourceNames.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const hintsBlock = outlineHints.length > 0
    ? `\nOutline hints:\n${outlineHints.slice(0, 25).map((h) => `- ${h}`).join('\n')}\n`
    : '';

  const truncationNote = truncated
    ? '\nNote: Context may be truncated.\n'
    : '';

  const strategyType = planStrategy?.type || 'module_based';
  const notes = planStrategy?.customNotes || '';

  const countHint =
    typeof targetDraftTopicCount === 'number' &&
    targetDraftTopicCount >= 1 &&
    targetDraftTopicCount <= 20
      ? `\nREQUIRED number of draft topics in your JSON output: ${targetDraftTopicCount}. ${
          topicBasis === 'week' || topicBasis === 'module' || topicBasis === 'unit'
            ? `One topic per numbered ${topicBasis} — no merging across ${topicBasis} boundaries.`
            : perUnitRequested
              ? 'One topic per numbered unit — no merging.'
              : 'Match this count unless the modification request clearly asks for a different number.'
        }\n`
      : '';

  const rationaleBlock = topicCountRationale ? `\nTopic count guidance: ${topicCountRationale}\n` : '';

  const userPrompt = `Strategy: ${strategyType}
Instructor notes: ${notes}
${rationaleBlock}${countHint}${syllabusBlock}${requiredFilenameHeader}${referenceBlock}${truncationNote}${hintsBlock}
Current topics on this course:
${lockedTopics ? `Locked (approved/published — DO NOT include in your output, but reference in coverageOverview):\n${lockedTopics}\n` : 'No locked topics.\n'}
${draftTopics ? `Current drafts (these are what you will replace):\n${draftTopics}\n` : 'No current drafts.\n'}
${chatBlock}
Instructor's modification request:
"${modificationRequest}"

Course material and instructions:
${contextText}

Output the MODIFIED set of draft topics. Do not include locked topics in your output.`;

  const n = typeof targetDraftTopicCount === 'number' ? targetDraftTopicCount : 4;
  const maxTokens = Math.min(11000, 4200 + n * 500);

  return runAgent({
    taskName: 'topic_plan_modify',
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens,
    temperature: 0.35
  });
}

module.exports = { runCourseTopicPlanModifyAgent };

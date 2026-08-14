const { runAgent } = require('./framework/baseAgent');

/**
 * "Modify draft topics" as a CHANGE SET, not a regeneration.
 *
 * The previous contract had the model re-output the COMPLETE draft set and the
 * route delete-and-recreate every draft — so "add a topic on X" regenerated
 * (and usually mangled) every draft the instructor already had. The only
 * protection was approving topics first, and the UI had to warn "Modify
 * replaces all draft topics."
 *
 * Now the model emits only the operations the request requires:
 *   add    — a new draft topic
 *   update — replace ONE named existing draft with a revised version
 *   remove — delete ONE named existing draft
 * Untouched drafts get no operation and are left byte-identical. The route
 * applies each operation with a status:'draft' predicate, so approved and
 * published topics remain unreachable exactly as before (the same invariant
 * the per-topic ai-modify endpoint enforces with its NOT_DRAFT 409).
 */

const SYSTEM = `You are a curriculum designer modifying an existing set of course topics for an adaptive tutoring app.
You receive the current topics (drafts you may change; approved/published topics are LOCKED and immutable), the instructor's chat history, the syllabus context, and a modification request.

You output a CHANGE SET — only the operations the request requires. Topics you do not name in an operation are left exactly as they are.

Operations:
- {"op": "add", "topic": {...}} — create a new draft topic.
- {"op": "update", "target": "<exact current draft title>", "topic": {...}} — replace that one draft with the revised topic (output the FULL revised topic, not a fragment).
- {"op": "remove", "target": "<exact current draft title>"} — delete that one draft.

Rules:
- Emit the SMALLEST change set that satisfies the request. "Add a topic on X" is ONE add operation — do not also update or remove other drafts unless the request asks for it.
- "target" must EXACTLY match a title from the CURRENT DRAFTS list (copy it verbatim). Never target a LOCKED topic.
- The instructor's latest modification request OVERRIDES prior topic count, grouping, or structure unless it conflicts with locked topics.
- Preserve syllabus coverage: after your operations, the union of ALL topics (unchanged drafts + your adds/updates + locked topics) must still cover the full scope of the primary syllabus. Never remove a draft that alone covers a syllabus area unless a replacement covers it.
- Syllabus filename grounding (critical for validation): in syllabusCoverageOverview, explicitly and verbatim mention each primary syllabus filename listed in the "Primary syllabus files" section of your prompt. (Reference-only files do not need to be named.)
- Every add/update topic must include "syllabusAnchors": 1-6 short strings naming units/headings from the syllabus.
- Include "syllabusCoverageOverview" mapping all major syllabus areas to topic titles (unchanged drafts and locked topics included).
- Topic titles must stay unique across the entire set (including locked and unchanged topics).
- Each add/update topic has 1-8 modules; each module has 2-8 milestones (short, teachable bullets).
- moduleId must be unique per module (slug like "mod_intro_1").
- points per module: 5-25 integer.
- difficulty per module: intro | core | apply | challenge.

For quizPattern.cognitiveLevel use only: remember | understand | apply | analyze | evaluate | create

Return ONLY valid JSON:
{
  "syllabusCoverageOverview": "string — full coverage map including unchanged and locked topics",
  "operations": [
    {
      "op": "add",
      "topic": {
        "title": "...",
        "objective": "...",
        "syllabusAnchors": ["Unit 2: ..."],
        "modules": [
          {
            "moduleId": "mod_1",
            "title": "...",
            "description": "...",
            "difficulty": "core",
            "points": 10,
            "milestones": [{ "text": "..." }, { "text": "..." }],
            "quizPattern": { "questionCount": 5, "cognitiveLevel": "understand", "constraints": "" }
          }
        ]
      }
    },
    { "op": "update", "target": "<exact current draft title>", "topic": { ...same shape as add... } },
    { "op": "remove", "target": "<exact current draft title>" }
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
 * @param {number} [opts.targetDraftTopicCount] - when set, the draft set should hold this many topics AFTER the operations apply
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
      ? `\nAfter your operations are applied, the draft set should contain ${targetDraftTopicCount} topics. ${
          topicBasis === 'week' || topicBasis === 'module' || topicBasis === 'unit'
            ? `One topic per numbered ${topicBasis} — no merging across ${topicBasis} boundaries.`
            : perUnitRequested
              ? 'One topic per numbered unit — no merging.'
              : 'Match this count unless the modification request clearly asks for a different number.'
        } NEVER remove or rewrite drafts merely to hit this count — only remove what the request explicitly asks to remove.\n`
      : '';

  const rationaleBlock = topicCountRationale ? `\nTopic count guidance: ${topicCountRationale}\n` : '';

  const userPrompt = `Strategy: ${strategyType}
Instructor notes: ${notes}
${rationaleBlock}${countHint}${syllabusBlock}${requiredFilenameHeader}${referenceBlock}${truncationNote}${hintsBlock}
Current topics on this course:
${lockedTopics ? `Locked (approved/published — NEVER a "target"; reference only in coverageOverview):\n${lockedTopics}\n` : 'No locked topics.\n'}
${draftTopics ? `CURRENT DRAFTS (the only valid "target" values — copy titles EXACTLY):\n${draftTopics}\n` : 'No current drafts (only "add" operations are possible).\n'}
${chatBlock}
Instructor's modification request:
"${modificationRequest}"

Course material and instructions:
${contextText}

Output the CHANGE SET (operations only — do not re-output unchanged drafts).`;

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

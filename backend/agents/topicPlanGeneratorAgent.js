const { runAgent } = require('./framework/baseAgent');

const SYSTEM = `You are a curriculum designer. Given course context and strategy, propose draft topics with modules and milestones for an adaptive tutoring app.

Syllabus coverage guardrails (critical):
- Primary syllabus material defines WHAT must be taught and how topics partition the course. Use reference materials only to clarify, enrich examples, or fill gaps — do not replace the syllabus scope with side references.
- Read ALL instructor materials and global instructions end-to-end. Do not fixate on the opening sections only.
- Together, the topics must cover the full scope of the primary syllabus (every major chapter, unit, theme, or week it implies), without large gaps.
- Every topic must include "syllabusAnchors": 1–6 short strings naming specific units, headings, or learning outcomes drawn mainly from the primary syllabus text (verbatim or close paraphrase).
- You MUST include top-level "syllabusCoverageOverview": a structured paragraph (or short bullet list in prose) that names each major syllabus area and states which topic title covers it. Explicitly name each primary syllabus file listed in the user prompt where required. If the context was truncated, note that briefly in the overview.

Other rules:
- If the instructor requests one topic per syllabus unit (or per week/module), output exactly one topic per numbered segment — do NOT merge multiple units into a single topic unless the syllabus explicitly treats them as one block.
- Each topic title MUST be unique — never repeat the same topic or a near-duplicate title.
- Each topic has 1-8 modules; each module has 2-8 milestones (short, teachable bullets).
- moduleId must be unique per module (slug like "mod_intro_1").
- points per module: 5-25 integer.
- difficulty per module: intro | core | apply. Judge this against the LEVEL OF
  THIS COURSE, not against programming in general, and vary it to reflect what
  the module actually demands:
    intro  = orientation/definitions a student meets the concept with
    core   = the standard working competence of this course
    apply  = synthesis, non-obvious transfer, or multi-concept problem solving
  Do NOT make the first module of every topic "intro" by reflex. An upper-level
  course (data structures, databases, security) may legitimately have few or no
  intro modules; a late topic in any course is rarely intro. Advanced subject
  matter — graph traversal, sorting analysis, injection defence — should not
  be tagged intro.
- Order topics in a logical teaching sequence.

Return ONLY valid JSON:
{
  "syllabusCoverageOverview": "string — full-syllabus map: areas → topic titles",
  "topics": [
    {
      "title": "...",
      "objective": "...",
      "orderIndex": 0,
      "syllabusAnchors": ["Unit 2: ...", "Learning outcome ..."],
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

For quizPattern.cognitiveLevel you MUST use only one of:
remember | understand | apply | analyze | evaluate | create
(Bloom taxonomy; do not use other strings.)
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
 * @param {string[]} [opts.syllabusSourceNames] - primary syllabus filenames (coverage overview/anchors must reference each)
 * @param {string[]} [opts.referenceSourceNames] - optional reference filenames (use if helpful; no need to name in overview)
 * @param {boolean} [opts.truncated] - context hit char limit
 * @param {string[]} [opts.outlineHints] - headings/numbered cues from materials
 * @param {string} [opts.instructorIntent] - Topic Plan Chat / session instruction (must be honored alongside count)
 * @param {string} [opts.topicCountRationale] - human note for the model (e.g. why N topics)
 * @param {boolean} [opts.perUnitRequested] - strict one-topic-per-unit mode (legacy)
 * @param {string} [opts.topicBasis] - 'week'|'module'|'unit'|'segment'|'explicit'
 */
async function runTopicPlanGeneratorAgent({
  contextText,
  planStrategy,
  topicCount,
  syllabusSourceNames = [],
  referenceSourceNames = [],
  truncated = false,
  outlineHints = [],
  instructorIntent = '',
  topicCountRationale = '',
  perUnitRequested = false,
  topicBasis = 'segment'
}) {
  const count = topicCount ?? planStrategy?.topicCount ?? 4;
  const strategyType = planStrategy?.type || 'module_based';
  const notes = planStrategy?.customNotes || '';

  const syllabusBlock =
    syllabusSourceNames.length > 0
      ? `Primary syllabus files — drive topic scope; syllabusCoverageOverview and syllabusAnchors MUST explicitly tie to these filenames:\n${syllabusSourceNames.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  const requiredFilenameHeader =
    syllabusSourceNames.length > 0
      ? `\nCRITICAL: In your "syllabusCoverageOverview" string, you MUST include this exact substring (verbatim, including punctuation) somewhere near the start:\nPrimary syllabus files: ${syllabusSourceNames.join('; ')}\n`
      : '';

  const referenceBlock =
    referenceSourceNames.length > 0
      ? `Reference materials (optional context; use only as needed; do not need to be named in the overview):\n${referenceSourceNames.map((n) => `- ${n}`).join('\n')}\n`
      : '';

  const sourcesBlock =
    (syllabusBlock || referenceBlock)
      ? `${syllabusBlock}${referenceBlock}`
      : 'No separate source filenames (material may be instructions-only). Still map coverage to everything in the text.\n';

  const truncationNote = truncated
    ? '\nNote: Course context may be truncated for length. Cover every theme visible below; if the end of the syllabus is missing from the excerpt, distribute topics across the full visible span and mention truncation in syllabusCoverageOverview.\n'
    : '';

  const hintsBlock =
    outlineHints.length > 0
      ? `\nOutline / heading cues detected in the materials (ensure collective topic coverage spans these where relevant):\n${outlineHints.slice(0, 35).map((h) => `- ${h}`).join('\n')}\n`
      : '';

  const intentBlock =
    (instructorIntent || '').trim().length > 0
      ? `\nInstructor instructions for THIS plan (highest priority; follow exactly):\n${String(instructorIntent).trim()}\n`
      : '';

  const rationaleBlock = topicCountRationale
    ? `\nTopic count guidance: ${topicCountRationale}\n`
    : '';

  let granularityRule = '';
  if (topicBasis === 'week') {
    granularityRule = `You MUST output exactly ${count} distinct topics — one per major numbered syllabus week. Do NOT merge multiple weeks into one topic. Each topic's syllabusAnchors must name that week.\n`;
  } else if (topicBasis === 'module') {
    granularityRule = `You MUST output exactly ${count} distinct topics — one per major numbered syllabus module. Do NOT merge multiple modules into one topic. Each topic's syllabusAnchors must name that module.\n`;
  } else if (topicBasis === 'unit' || perUnitRequested) {
    granularityRule = `You MUST output exactly ${count} distinct topics — one per major numbered syllabus unit. Do NOT merge multiple units into one topic. Each topic's syllabusAnchors must name that unit.\n`;
  } else {
    granularityRule = `Output exactly ${count} distinct topics (or fewer only if the materials are too thin to justify ${count}; if fewer, say why in syllabusCoverageOverview). No duplicate titles.\n`;
  }

  const userPrompt = `Planning strategy: ${strategyType}
Target topic count: ${count}
Instructor notes: ${notes}
${rationaleBlock}${intentBlock}${sourcesBlock}${requiredFilenameHeader}${truncationNote}${hintsBlock}
Course material and instructions:
${contextText}

${granularityRule}The union of all topics must cover the full syllabus implied by the materials above.`;

  const maxTokens = Math.min(10000, 3800 + count * 450);

  return runAgent({
    taskName: 'topic_plan',
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens,
    temperature: 0.35
  });
}

module.exports = { runTopicPlanGeneratorAgent };

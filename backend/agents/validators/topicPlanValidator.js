const { z } = require('zod');

const MilestoneSchema = z.object({
  text: z.string().min(1).max(2000)
});

const ModuleSchema = z.object({
  moduleId: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().default(''),
  difficulty: z.enum(['intro', 'core', 'apply']).optional().default('core'),
  points: z.number().min(0).max(1000),
  milestones: z.array(MilestoneSchema).min(2).max(8),
  quizPattern: z.record(z.unknown()).optional()
});

const TopicPlanTopicSchema = z.object({
  title: z.string().min(1).max(300),
  objective: z.string().max(2000).optional().default(''),
  orderIndex: z.number().int().min(0).optional(),
  /** Grounding: syllabus units / headings this topic is responsible for (from instructor materials). */
  syllabusAnchors: z.array(z.string().min(4).max(400)).min(1).max(10),
  modules: z.array(ModuleSchema).min(1).max(8)
});

const TopicsPayloadSchema = z.object({
  /** Narrative map: major syllabus areas → which topics cover them (full coverage required). */
  syllabusCoverageOverview: z.string().min(60).max(4500),
  topics: z.array(TopicPlanTopicSchema).min(1).max(20)
});

/** Normalize for duplicate detection (case/whitespace insensitive). */
function normalizeTopicTitleKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Keep first occurrence per normalized title (LLMs often repeat the same topic).
 * @returns {{ topics: any[], duplicateTitlesRemoved: number }}
 */
function dedupeTopicsByTitle(topics) {
  const seen = new Set();
  const out = [];
  let duplicateTitlesRemoved = 0;
  for (const t of topics) {
    const key = normalizeTopicTitleKey(t.title);
    if (!key) {
      duplicateTitlesRemoved += 1;
      continue;
    }
    if (seen.has(key)) {
      duplicateTitlesRemoved += 1;
      continue;
    }
    seen.add(key);
    out.push(t);
  }
  return { topics: out, duplicateTitlesRemoved };
}

/** Filename / path stem for coverage checks (lowercase). */
function fileStemLower(name) {
  const base = String(name || '').split(/[/\\]/).pop() || '';
  return base.replace(/\.[^.]+$/, '').trim().toLowerCase();
}

/**
 * Ensure overview + anchors mention every primary syllabus source (not optional reference files).
 * @param {string[]} syllabusSourceNames - originalName or filename per syllabus-marked source
 * @param {string} overview
 * @param {{ title: string, objective?: string, syllabusAnchors?: string[] }[]} topics
 */
function validateSourceCoverage(syllabusSourceNames, overview, topics) {
  const names = (syllabusSourceNames || []).map(String).filter(Boolean);
  if (names.length === 0) return { ok: true, missing: [] };
  const blob = `${overview} ${topics
    .map((t) => [...(t.syllabusAnchors || []), t.title, t.objective || ''].join(' '))
    .join(' ')}`.toLowerCase();
  const missing = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.length >= 3 && blob.includes(lower)) continue;
    const stem = fileStemLower(name);
    if (stem.length >= 4 && blob.includes(stem)) continue;
    const words = lower.split(/\W+/).filter((w) => w.length >= 4);
    const hit = words.some((w) => blob.includes(w));
    if (!hit) missing.push(name);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * @param {unknown} data - parsed JSON from LLM
 * @param {object} [options]
 * @param {string[]} [options.syllabusSourceNames] - primary syllabus filenames; each must appear in overview/anchors when non-empty
 * @param {string[]} [options.sourceNames] - deprecated alias for syllabusSourceNames
 * @returns {{ valid: boolean, topics?: any[], syllabusCoverageOverview?: string, errors: string[], warnings?: string[], code?: string }}
 */
function validateTopicPlanPayload(data, options = {}) {
  const parsed = TopicsPayloadSchema.safeParse(data);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { valid: false, errors };
  }
  const syllabusCoverageOverview = parsed.data.syllabusCoverageOverview;
  const { topics, duplicateTitlesRemoved } = dedupeTopicsByTitle(parsed.data.topics);
  if (topics.length === 0) {
    return {
      valid: false,
      errors: ['All topics were removed as duplicate or empty titles']
    };
  }
  const syllabusNames =
    options.syllabusSourceNames != null ? options.syllabusSourceNames : options.sourceNames || [];
  const cov = validateSourceCoverage(syllabusNames, syllabusCoverageOverview, topics);
  if (!cov.ok) {
    return {
      valid: false,
      errors: [
        `Syllabus coverage guardrail: each primary syllabus file must be explicitly tied in syllabusCoverageOverview or syllabusAnchors. Missing or unreferenced syllabus source(s): ${cov.missing.join('; ')}. Reference-only files do not need to be named. Regenerate or mark the correct file(s) as "syllabus" on the course materials page.`
      ],
      code: 'SYLLABUS_COVERAGE_SOURCES'
    };
  }
  const warnings = [];
  if (duplicateTitlesRemoved > 0) {
    warnings.push(
      `Removed ${duplicateTitlesRemoved} duplicate topic title(s) from the model output (each topic must be unique).`
    );
  }
  return {
    valid: true,
    topics,
    syllabusCoverageOverview,
    errors: [],
    warnings
  };
}

/**
 * Validate a single-topic modification from TopicDraftModifyAgent.
 * @param {unknown} data - parsed JSON from LLM
 * @returns {{ valid: boolean, topic?: any, errors: string[] }}
 */
function validateSingleTopicPayload(data) {
  const parsed = TopicPlanTopicSchema.safeParse(data);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { valid: false, errors };
  }
  return { valid: true, topic: parsed.data, errors: [] };
}

module.exports = {
  validateTopicPlanPayload,
  validateSingleTopicPayload,
  TopicsPayloadSchema,
  TopicPlanTopicSchema,
  normalizeTopicTitleKey,
  dedupeTopicsByTitle,
  validateSourceCoverage,
  fileStemLower
};

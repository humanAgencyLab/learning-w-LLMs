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

/**
 * Repair pass (pilot finding P4): one over/under-sized module in one topic
 * used to discard the ENTIRE payload and surface a raw Zod path to the
 * instructor. Mechanically repairable violations are fixed here BEFORE the
 * strict parse; every fix is reported through the warnings channel so it
 * reaches the plan chat. The repair only ever REMOVES or SHORTENS model
 * output — it never invents content (no padded milestones, no synthesized
 * anchors). The one exception: a missing/non-numeric module `points` value
 * defaults to 100 rather than dropping an otherwise-sound module over a
 * cosmetic gamification number.
 *
 * Unrepairable-by-truncation policy: a module with fewer than 2 usable
 * milestones is dropped when sibling modules remain; a topic that ends up
 * with no modules or no usable syllabus anchors is dropped when sibling
 * topics remain; when nothing survives, validation fails with a readable
 * message (schema limits themselves are untouched — they are product
 * decisions, not the bug).
 */
const LIMITS = {
  topics: 20,
  modulesPerTopic: 8,
  milestonesPerModule: 8,
  minMilestonesPerModule: 2,
  anchorsPerTopic: 10,
  anchorMinLen: 4,
  anchorMaxLen: 400,
  titleMax: 300,
  objectiveMax: 2000,
  descriptionMax: 2000,
  milestoneTextMax: 2000,
  moduleIdMax: 80,
  overviewMax: 4500,
  pointsMax: 1000
};

/** Truncate to `max` chars at a word boundary when one exists reasonably close. */
function truncateAtWordBoundary(value, max) {
  const str = String(value);
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function repairTopic(topic, label, warnings) {
  if (!topic || typeof topic !== 'object') return null;
  const t = { ...topic };

  if (typeof t.title === 'string' && t.title.length > LIMITS.titleMax) {
    t.title = truncateAtWordBoundary(t.title, LIMITS.titleMax);
    warnings.push(`Shortened the title of ${label} to fit the ${LIMITS.titleMax}-character limit.`);
  }
  if (typeof t.objective === 'string' && t.objective.length > LIMITS.objectiveMax) {
    t.objective = truncateAtWordBoundary(t.objective, LIMITS.objectiveMax);
    warnings.push(`Shortened the objective of ${label} to fit the length limit.`);
  }

  // Syllabus anchors: shorten over-long ones, drop unusable ones, cap at 10.
  // A missing/non-array anchors field counts as "no usable anchors" so the
  // drop policy applies instead of sinking the whole payload at strict parse.
  {
    const originalAnchorCount = Array.isArray(t.syllabusAnchors) ? t.syllabusAnchors.length : 0;
    let anchors = (Array.isArray(t.syllabusAnchors) ? t.syllabusAnchors : [])
      .filter((a) => typeof a === 'string')
      .map((a) => (a.length > LIMITS.anchorMaxLen ? truncateAtWordBoundary(a, LIMITS.anchorMaxLen) : a));
    const usable = anchors.filter((a) => a.trim().length >= LIMITS.anchorMinLen);
    if (usable.length < originalAnchorCount) {
      warnings.push(`Dropped ${originalAnchorCount - usable.length} unusable syllabus anchor(s) from ${label}.`);
    }
    anchors = usable;
    if (anchors.length > LIMITS.anchorsPerTopic) {
      warnings.push(
        `Kept the first ${LIMITS.anchorsPerTopic} of ${anchors.length} syllabus anchors on ${label} (at most ${LIMITS.anchorsPerTopic} per topic).`
      );
      anchors = anchors.slice(0, LIMITS.anchorsPerTopic);
    }
    t.syllabusAnchors = anchors;
    if (anchors.length === 0) {
      warnings.push(`Dropped ${label} — it had no usable syllabus anchors to ground it.`);
      return null;
    }
  }

  // Modules: repair each first (so under-min drops don't count against the
  // cap), then keep the first 8 survivors.
  const modules = (Array.isArray(t.modules) ? t.modules : []).filter((m) => m && typeof m === 'object');
  const keptModules = [];
  for (const mod of modules) {
    const m = { ...mod };
    const modLabel = typeof m.title === 'string' && m.title.trim() ? `module "${truncateAtWordBoundary(m.title, 60)}"` : 'an untitled module';
    if (typeof m.moduleId === 'string' && m.moduleId.length > LIMITS.moduleIdMax) {
      m.moduleId = m.moduleId.slice(0, LIMITS.moduleIdMax);
    }
    if (typeof m.title === 'string' && m.title.length > LIMITS.titleMax) {
      m.title = truncateAtWordBoundary(m.title, LIMITS.titleMax);
      warnings.push(`Shortened a module title on ${label} to fit the length limit.`);
    }
    if (typeof m.description === 'string' && m.description.length > LIMITS.descriptionMax) {
      m.description = truncateAtWordBoundary(m.description, LIMITS.descriptionMax);
    }
    if (m.difficulty != null && !['intro', 'core', 'apply'].includes(m.difficulty)) {
      delete m.difficulty; // falls back to the schema default
    }
    // Always normalize points to an in-range NUMBER — Number("100") passes a
    // range check but the string would still sink the strict parse.
    const pts = Number(m.points);
    if (!Number.isFinite(pts)) {
      m.points = 100;
      warnings.push(`Set a default point value on ${modLabel} of ${label} (the AI omitted one).`);
    } else {
      m.points = Math.min(Math.max(pts, 0), LIMITS.pointsMax);
    }

    // Missing/non-array milestones counts as zero usable — drop policy applies.
    // The text filter mirrors the schema's min(1) exactly (length, not trim),
    // so payloads the schema already accepted are never altered here.
    let milestones = (Array.isArray(m.milestones) ? m.milestones : [])
      .filter((ms) => ms && typeof ms === 'object' && typeof ms.text === 'string' && ms.text.length > 0)
      .map((ms) => ({
        ...ms,
        text: ms.text.length > LIMITS.milestoneTextMax ? truncateAtWordBoundary(ms.text, LIMITS.milestoneTextMax) : ms.text
      }));
    if (milestones.length > LIMITS.milestonesPerModule) {
      warnings.push(
        `Trimmed ${modLabel} on ${label} to ${LIMITS.milestonesPerModule} milestones (the AI produced ${milestones.length}; each module holds at most ${LIMITS.milestonesPerModule}).`
      );
      milestones = milestones.slice(0, LIMITS.milestonesPerModule);
    }
    if (milestones.length < LIMITS.minMilestonesPerModule) {
      warnings.push(
        `Dropped ${modLabel} from ${label} — it had ${milestones.length === 0 ? 'no' : 'only ' + milestones.length} usable milestone(s); each module needs at least ${LIMITS.minMilestonesPerModule}.`
      );
      continue;
    }
    m.milestones = milestones;
    keptModules.push(m);
  }
  if (keptModules.length === 0) {
    warnings.push(`Dropped ${label} — none of its modules had the required ${LIMITS.minMilestonesPerModule}+ milestones.`);
    return null;
  }
  let finalModules = keptModules;
  if (finalModules.length > LIMITS.modulesPerTopic) {
    warnings.push(
      `Kept the first ${LIMITS.modulesPerTopic} of ${finalModules.length} usable modules on ${label} (at most ${LIMITS.modulesPerTopic} per topic).`
    );
    finalModules = finalModules.slice(0, LIMITS.modulesPerTopic);
  }
  t.modules = finalModules;
  return t;
}

/**
 * @param {unknown} data - parsed JSON from the model
 * @returns {{ data: unknown, warnings: string[] }} repaired copy + instructor-readable warnings
 */
function repairTopicPlanPayload(data) {
  const warnings = [];
  if (!data || typeof data !== 'object' || !Array.isArray(data.topics)) {
    return { data, warnings }; // shape is beyond mechanical repair; strict parse decides
  }
  const out = { ...data };
  if (typeof out.syllabusCoverageOverview === 'string' && out.syllabusCoverageOverview.length > LIMITS.overviewMax) {
    out.syllabusCoverageOverview = truncateAtWordBoundary(out.syllabusCoverageOverview, LIMITS.overviewMax);
    warnings.push('Shortened the coverage overview to fit the length limit.');
  }
  // Repair every topic FIRST, then keep the first 20 survivors — so unusable
  // early topics can't crowd salvageable ones out of the cap.
  const kept = [];
  out.topics.forEach((topic, i) => {
    const label =
      topic && typeof topic.title === 'string' && topic.title.trim()
        ? `topic "${truncateAtWordBoundary(topic.title, 60)}"`
        : `topic ${i + 1}`;
    if (!topic || typeof topic !== 'object') {
      warnings.push(`Dropped ${label} — it was empty in the model output.`);
      return;
    }
    const repaired = repairTopic(topic, label, warnings);
    if (repaired) kept.push(repaired);
  });
  let finalTopics = kept;
  if (finalTopics.length > LIMITS.topics) {
    warnings.push(
      `Kept the first ${LIMITS.topics} of ${finalTopics.length} usable topics (course plans hold at most ${LIMITS.topics}).`
    );
    finalTopics = finalTopics.slice(0, LIMITS.topics);
  }
  out.topics = finalTopics;
  return { data: out, warnings };
}

/** Instructor-readable failure copy (never a Zod path — pilot finding P4). */
const UNREADABLE_PLAN_MESSAGE =
  'The AI produced a plan the system could not use, even after automatic repair. This usually resolves on a fresh attempt: generate again (results vary between runs), or simplify the request — for example, fewer topics at once or fewer constraints per topic.';
const NOTHING_SALVAGEABLE_MESSAGE =
  'None of the generated topics were usable — each one was missing the required structure (every topic needs at least one module with 2–8 milestones and a syllabus anchor). Generate again, or simplify the request.';

/** Map the first strict-parse issue to a plain-language fragment for the log-adjacent message. */
function plainLanguageReason(zodError) {
  const issue = zodError?.errors?.[0];
  if (!issue) return null;
  const path = issue.path || [];
  if (path[0] === 'syllabusCoverageOverview') return 'The plan\'s syllabus coverage overview was missing or too short.';
  if (path[0] === 'topics' && path.length === 1) return 'The plan contained no topics list.';
  return null;
}

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
  const repaired = repairTopicPlanPayload(data);
  const repairWarnings = repaired.warnings;

  if (Array.isArray(data?.topics) && data.topics.length > 0 && repaired.data.topics.length === 0) {
    return {
      valid: false,
      errors: [NOTHING_SALVAGEABLE_MESSAGE],
      code: 'TOPIC_PLAN_INVALID',
      internalErrors: repairWarnings
    };
  }

  const parsed = TopicsPayloadSchema.safeParse(repaired.data);
  if (!parsed.success) {
    // Machine detail (Zod paths) stays server-side via internalErrors; the
    // instructor-facing errors are always readable (pilot finding P4).
    const internalErrors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    const reason = plainLanguageReason(parsed.error);
    return {
      valid: false,
      errors: [reason ? `${reason} ${UNREADABLE_PLAN_MESSAGE}` : UNREADABLE_PLAN_MESSAGE],
      code: 'TOPIC_PLAN_INVALID',
      internalErrors
    };
  }
  const syllabusCoverageOverview = parsed.data.syllabusCoverageOverview;
  const { topics, duplicateTitlesRemoved } = dedupeTopicsByTitle(parsed.data.topics);
  if (topics.length === 0) {
    return {
      valid: false,
      errors: ['Every generated topic duplicated another topic title. Generate again with a request for more distinct topics.'],
      code: 'TOPIC_PLAN_INVALID',
      internalErrors: ['All topics were removed as duplicate or empty titles']
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
  const warnings = [...repairWarnings];
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
  // Same repair-then-readable treatment as the full plan (this backs the
  // topic editor's AI Edit box, which had the identical raw-Zod-path problem).
  const warnings = [];
  const label =
    data && typeof data.title === 'string' && data.title.trim()
      ? `topic "${truncateAtWordBoundary(data.title, 60)}"`
      : 'this topic';
  const repaired = data && typeof data === 'object' ? repairTopic(data, label, warnings) : null;
  if (data && typeof data === 'object' && repaired === null) {
    return {
      valid: false,
      errors: [
        'The AI\'s edit removed too much of the topic\'s required structure (every topic needs at least one module with 2–8 milestones and a syllabus anchor). Try rephrasing the request, or edit the fields directly.'
      ],
      code: 'TOPIC_MODIFY_INVALID',
      internalErrors: warnings
    };
  }
  const parsed = TopicPlanTopicSchema.safeParse(repaired ?? data);
  if (!parsed.success) {
    const internalErrors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      valid: false,
      errors: [
        'The AI\'s edit did not match the required topic structure, even after automatic repair. Try rephrasing the request — results vary between attempts — or edit the fields directly.'
      ],
      code: 'TOPIC_MODIFY_INVALID',
      internalErrors
    };
  }
  return { valid: true, topic: parsed.data, errors: [], warnings };
}

module.exports = {
  validateTopicPlanPayload,
  validateSingleTopicPayload,
  repairTopicPlanPayload,
  truncateAtWordBoundary,
  TopicsPayloadSchema,
  TopicPlanTopicSchema,
  normalizeTopicTitleKey,
  dedupeTopicsByTitle,
  validateSourceCoverage,
  fileStemLower
};

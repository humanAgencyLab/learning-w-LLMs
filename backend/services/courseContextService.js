const { useBookSources } = require('../agents/framework/featureFlag');

/** Budget for syllabus + refs sent to topic-plan agents (override via env). */
const MAX_CONTEXT_CHARS = parseInt(process.env.COURSE_CONTEXT_MAX_CHARS || '56000', 10);

const MAX_PLAN_TOPICS = 20;

/**
 * Max unit/week/module index seen in text (for topic-count hints).
 * @param {string} text
 * @param {string[]} [hints]
 */
function inferSegmentCountFromText(text, hints = []) {
  const blob = `${String(text || '')}\n${(hints || []).join('\n')}`;
  const patterns = [
    /\bunits?\s*(\d+)\b/gi,
    /\bweeks?\s*(\d+)\b/gi,
    /\bmodules?\s*(\d+)\b/gi,
    /\bchapters?\s*(\d+)\b/gi,
    /\blectures?\s*(\d+)\b/gi
  ];
  let maxIdx = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(blob)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > 0 && n <= 40) maxIdx = Math.max(maxIdx, n);
    }
  }
  return maxIdx > 0 ? Math.min(maxIdx, MAX_PLAN_TOPICS) : 0;
}

/**
 * Infer count only from Unit labels when the instructor asks for unit granularity.
 * Supports:
 * - "Unit 1", "Units 2"
 * - ranges like "Units 1-6" / "Units 1–6"
 */
function inferUnitCountFromText(text, hints = []) {
  const blob = `${String(text || '')}\n${(hints || []).join('\n')}`;
  let maxUnit = 0;

  // Range: Units 1-6 / Units 1–6
  const rangeRe = /\bunits?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\b/gi;
  let m;
  while ((m = rangeRe.exec(blob)) !== null) {
    const end = parseInt(m[2], 10);
    if (!Number.isNaN(end) && end > 0 && end <= 40) maxUnit = Math.max(maxUnit, end);
  }

  // Individual labels: Unit 1 / Units 2:
  const singleRe = /\bunits?\s*(\d{1,2})\b/gi;
  rangeRe.lastIndex = 0;
  while ((m = singleRe.exec(blob)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 40) maxUnit = Math.max(maxUnit, n);
  }

  return maxUnit > 0 ? Math.min(maxUnit, MAX_PLAN_TOPICS) : 0;
}

/**
 * Infer count only from Week labels ("Week 1", "Weeks 2", "Weeks 1-6", ...).
 * @param {string} text
 * @param {string[]} [hints]
 */
function inferWeekCountFromText(text, hints = []) {
  const blob = `${String(text || '')}\n${(hints || []).join('\n')}`;
  let maxWeek = 0;

  // Range: Weeks 1-6 / Weeks 1–6
  const rangeRe = /\bweeks?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\b/gi;
  let m;
  while ((m = rangeRe.exec(blob)) !== null) {
    const end = parseInt(m[2], 10);
    if (!Number.isNaN(end) && end > 0 && end <= 40) maxWeek = Math.max(maxWeek, end);
  }

  // Individual labels: Week 1 / Weeks 2:
  const singleRe = /\bweeks?\s*(\d{1,2})\b/gi;
  rangeRe.lastIndex = 0;
  while ((m = singleRe.exec(blob)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 40) maxWeek = Math.max(maxWeek, n);
  }

  return maxWeek > 0 ? Math.min(maxWeek, MAX_PLAN_TOPICS) : 0;
}

/**
 * Infer count only from Module labels ("Module 1", "Modules 2", "Modules 1-6", ...).
 * @param {string} text
 * @param {string[]} [hints]
 */
function inferModuleCountFromText(text, hints = []) {
  const blob = `${String(text || '')}\n${(hints || []).join('\n')}`;
  let maxModule = 0;

  // Range: Modules 1-6 / Modules 1–6
  const rangeRe = /\bmodules?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\b/gi;
  let m;
  while ((m = rangeRe.exec(blob)) !== null) {
    const end = parseInt(m[2], 10);
    if (!Number.isNaN(end) && end > 0 && end <= 40) maxModule = Math.max(maxModule, end);
  }

  // Individual labels: Module 1 / Modules 2:
  const singleRe = /\bmodules?\s*(\d{1,2})\b/gi;
  rangeRe.lastIndex = 0;
  while ((m = singleRe.exec(blob)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 40) maxModule = Math.max(maxModule, n);
  }

  return maxModule > 0 ? Math.min(maxModule, MAX_PLAN_TOPICS) : 0;
}

/**
 * Explicit "8 topics" / "generate 6" in instructor message.
 * @param {string} msg
 * @returns {number | null}
 */
function parseExplicitTopicCountFromMessage(msg) {
  if (!msg || typeof msg !== 'string') return null;
  const lower = msg.toLowerCase();
  // Be conservative: only treat a number as an explicit topic count when it appears
  // in a directive context (otherwise we can accidentally pick up "10 topics" from
  // "why you created 10 topics" while the user intended a different count).
  const patterns = [
    // "Create/Generate exactly N topics" style
    /\b(?:exactly|create|generate|produce|split\s+into)\b\s*(\d{1,2})\s+(?:topics?|drafts?)\b/i,
    // "topic count should be N" style
    /\btopic(?:\s+count)?\s+(?:should\s+be|must\s+be|=)\s*(\d{1,2})\b/i,
    // "topic should be N" style (without the word "count")
    /\btopic\s+should\s+be\s*(\d{1,2})\b/i,
    // "need N topics" style
    /\b(?:need|want|require|prefer)\s*(\d{1,2})\s+(?:topics?|drafts?)\b/i,
    // GENERAL "<N> topics" anywhere in the request.
    //
    // The four patterns above only fire when the number sits IMMEDIATELY after
    // one of a handful of verbs, so ordinary phrasings were silently dropped
    // and the generator fell back to its default of 4 — which is exactly the
    // "asked for 10, got 4" report. Measured misses included "make 10 topics",
    // "give me 10 topics", "break the course into 10 topics", "10 topics
    // please", and — worst, because it is the UI's own default message with a
    // count appended — "Generate the initial topic plan from the syllabus.
    // Please make it 10 topics."
    //
    // The narrowness was there to avoid reading a count out of NARRATIVE text
    // ("you created 10 topics, why?"), so that guard moves to REPORTING_CONTEXT
    // below rather than being enforced by verb allowlisting.
    /(\d{1,2})\s+(?:topics?|drafts?)\b/i
  ];

  // Phrases that mean the number DESCRIBES existing output rather than
  // requesting new output. Checked against the text just before the match.
  const REPORTING_CONTEXT =
    /\b(?:created|generated|produced|made|built|drafted|returned|gave|got|have|has|had|there\s+(?:are|were)|currently|already|only|just|why|instead\s+of|rather\s+than|not)\s*$/i;
  // If the chat includes multiple numbers (e.g. assistant says "Created 10 topics"
  // then later "topic should be 6"), we should pick the *latest* explicit count.
  let best = null;
  let bestPos = -1;

  for (const re of patterns) {
    const flags = re.flags && re.flags.includes('g') ? re.flags : `${re.flags || ''}g`;
    const globalRe = new RegExp(re.source, flags);
    let m;
    while ((m = globalRe.exec(lower)) !== null) {
      const n = parseInt(m[1], 10);
      // Skip counts that describe what already exists ("you created 10 topics").
      const before = lower.slice(Math.max(0, m.index - 24), m.index);
      if (REPORTING_CONTEXT.test(before)) continue;
      // "why did you make 10 topics?" asks ABOUT the output; "please make 10
      // topics" asks FOR it. Only the interrogative disqualifies, so the verb
      // itself stays usable in a request.
      if (/\b(?:why|how\s+come)\b/i.test(lower.slice(0, m.index))) continue;
      if (n >= 1 && n <= MAX_PLAN_TOPICS && m.index != null && m.index >= bestPos) {
        bestPos = m.index;
        best = n;
      }
    }
  }

  return best;
}

/**
 * Instructor asked for one topic per unit / no merging.
 * @param {string} msg
 */
function inferOnePerUnitRequested(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return (
    /one\s+(topic\s+)?per\s+unit/.test(lower) ||
    /each\s+unit\s+as\s+(a\s+)?(separate\s+)?topic/.test(lower) ||
    /every\s+(single\s+)?unit\s+as\s+(a\s+)?(single\s+)?topic/.test(lower) ||
    /one\s+topic\s+per\s+(week|module|chapter|lecture)/.test(lower) ||
    /do\s+not\s+merge\s+units?/.test(lower) ||
    /don'?t\s+merge\s+units?/.test(lower) ||
    /split\s+into\s+separate\s+topics?/.test(lower) ||
    /separate\s+topic\s+(for\s+)?each\s+unit/.test(lower) ||
    /\btreat\s+.{0,100}\bunits?\b/.test(lower) ||
    /consider\s+each\s+unit\s+(as\s+)?(an\s+)?(individual|its\s+own|separate|single)\s+topic/.test(lower) ||
    /each\s+unit\s+(is\s+)?(a\s+)?(topic|its\s+own\s+topic)/.test(lower)
  );
}

function inferOnePerWeekRequested(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return (
    /one\s+(topic\s+)?per\s+week/.test(lower) ||
    /each\s+week\s+(as\s+)?(a\s+)?topic/.test(lower) ||
    /every\s+week\s+(as\s+)?(a\s+)?topic/.test(lower) ||
    /do\s+not\s+merge\s+weeks?/.test(lower) ||
    /split\s+into\s+separate\s+weeks?/.test(lower)
  );
}

function inferOnePerModuleRequested(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return (
    /one\s+(topic\s+)?per\s+module/.test(lower) ||
    /each\s+module\s+(as\s+)?(a\s+)?topic/.test(lower) ||
    /every\s+module\s+(as\s+)?(a\s+)?topic/.test(lower) ||
    /do\s+not\s+merge\s+modules?/.test(lower) ||
    /split\s+into\s+separate\s+modules?/.test(lower)
  );
}

/** @param {unknown} v @returns {number|null} */
function normalizeOptionalTopicMax(v) {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return null;
  return Math.min(Math.max(n, 1), MAX_PLAN_TOPICS);
}

/**
 * Pick target topic count for plan generate/modify.
 * @param {object} o
 * @param {number} [o.bodyTopicCount] - optional API body override (1–20)
 * @param {number} [o.planStrategyTopicCount] - course.planStrategy.topicCount
 * @param {number|null|undefined} [o.planStrategyTopicCountMax] - optional ceiling
 * @param {string} o.instructorMessage
 * @param {string} o.contextText
 * @param {string[]} o.outlineHints
 * @returns {{ target: number, inferredSegments: number, rationale: string, perUnitRequested: boolean, strictDraftCount: boolean, cappedByMax: boolean }}
 */
function resolveTopicPlanTargetCount({
  bodyTopicCount,
  planStrategyTopicCount,
  planStrategyTopicCountMax,
  instructorMessage,
  contextText,
  outlineHints
}) {
  const base = Math.min(
    Math.max(parseInt(String(planStrategyTopicCount), 10) || 4, 1),
    MAX_PLAN_TOPICS
  );
  const fromMsg = parseExplicitTopicCountFromMessage(instructorMessage);

  const unitRequested = inferOnePerUnitRequested(instructorMessage);
  const weekRequested = inferOnePerWeekRequested(instructorMessage);
  const moduleRequested = inferOnePerModuleRequested(instructorMessage);

  // Hierarchy default: Week > Module > Unit.
  const weekCount = inferWeekCountFromText(contextText, outlineHints);
  const moduleCount = inferModuleCountFromText(contextText, outlineHints);
  const unitCount = inferUnitCountFromText(contextText, outlineHints);

  let topicBasis = 'segment';
  let inferred;
  if (fromMsg == null && weekRequested) {
    topicBasis = 'week';
    inferred = weekCount || 0;
  } else if (fromMsg == null && moduleRequested) {
    topicBasis = 'module';
    inferred = moduleCount || 0;
  } else if (fromMsg == null && unitRequested) {
    topicBasis = 'unit';
    inferred = unitCount || 0;
  } else if (fromMsg == null) {
    if (weekCount > 0) {
      topicBasis = 'week';
      inferred = weekCount;
    } else if (moduleCount > 0) {
      topicBasis = 'module';
      inferred = moduleCount;
    } else if (unitCount > 0) {
      topicBasis = 'unit';
      inferred = unitCount;
    } else {
      // Fallback when the syllabus doesn't use these labels.
      topicBasis = 'segment';
      inferred = inferSegmentCountFromText(contextText, outlineHints);
    }
  } else {
    // Explicit topic count overrides inferred basis.
    topicBasis = 'explicit';
    inferred = 0;
  }

  let bodyN = null;
  if (bodyTopicCount != null && bodyTopicCount !== '' && !Number.isNaN(Number(bodyTopicCount))) {
    bodyN = Math.min(Math.max(Math.round(Number(bodyTopicCount)), 1), MAX_PLAN_TOPICS);
  }

  let target = base;
  let rationale = `course topic count setting (${base})`;

  if (bodyN != null) {
    target = bodyN;
    rationale = `topic count from request (${bodyN})`;
  } else if (fromMsg != null) {
    target = fromMsg;
    rationale = `instructor message specified ${fromMsg} topics`;
  } else if (inferred > 0) {
    target = Math.max(base, inferred);
    rationale =
      inferred > base
        ? `raised from ${base} to ${target} to align with syllabus hierarchy (${topicBasis}: detected up to ${inferred})`
        : `topic count ${target} (hierarchy detected: ${inferred} ${topicBasis})`;
  } else if (unitRequested || weekRequested || moduleRequested) {
    const which = weekRequested ? 'Week' : moduleRequested ? 'Module' : 'Unit';
    rationale = `${which}-level granularity requested but no matching labels detected; using course setting (${base})`;
  }

  target = Math.min(Math.max(target, 1), MAX_PLAN_TOPICS);

  const maxCap = normalizeOptionalTopicMax(planStrategyTopicCountMax);
  let cappedByMax = false;
  if (maxCap != null && target > maxCap) {
    target = maxCap;
    cappedByMax = true;
    rationale = `${rationale} — capped at course maximum (${maxCap} topics)`;
  }

  /**
   * When true, modify flow passes exact draft count to the agent.
   * Only strict when the instructor explicitly requests a granularity (or an explicit topic count).
   * If the instructor did not ask for that granularity, allow the modify agent to adjust topic count.
   */
  const strictDraftCount =
    bodyN != null ||
    fromMsg != null ||
    ((unitRequested || weekRequested || moduleRequested) && inferred > 0);

  return {
    target,
    inferredSegments: inferred,
    rationale,
    perUnitRequested: unitRequested,
    topicBasis,
    strictDraftCount,
    cappedByMax
  };
}

/**
 * Effective role for a source subdocument (handles legacy docs without `role`).
 * @param {{ role?: string }} src
 * @param {number} sourceListLength
 * @returns {'syllabus'|'reference'}
 */
function effectiveSourceRole(src, sourceListLength) {
  if (src.role === 'syllabus' || src.role === 'reference') return src.role;
  if (sourceListLength <= 1) return 'syllabus';
  return 'reference';
}

/**
 * Names of sources that count as primary syllabus for coverage guardrails.
 * @param {Array<{ originalName?: string, filename?: string, role?: string }>} sources
 * @returns {string[] | null} null if ≥2 files and none marked syllabus (instructor must tag)
 */
function syllabusSourceNamesForGuardrail(sources) {
  const list = sources || [];
  if (list.length === 0) return [];
  /** Single uploaded file always defines coverage scope (even if tagged "reference"). */
  if (list.length === 1) {
    const n = list[0].originalName || list[0].filename;
    return n ? [n] : [];
  }
  const names = [];
  for (const s of list) {
    if (effectiveSourceRole(s, list.length) === 'syllabus') {
      const n = s.originalName || s.filename;
      if (n) names.push(n);
    }
  }
  if (names.length === 0) return null;
  return names;
}

/**
 * Reference source names (for agent prompt only).
 */
function referenceSourceNamesForPrompt(sources) {
  const list = sources || [];
  return list
    .filter((s) => effectiveSourceRole(s, list.length) === 'reference')
    .map((s) => s.originalName || s.filename)
    .filter(Boolean);
}

/**
 * Order sources: syllabus blocks first, then references (within char budget).
 */
function orderedSourcesForContext(sources) {
  const list = [...(sources || [])];
  const L = list.length;
  const primary = list.filter((s) => effectiveSourceRole(s, L) === 'syllabus');
  const refs = list.filter((s) => effectiveSourceRole(s, L) === 'reference');
  return [...primary, ...refs];
}

/**
 * Concatenate course sources + global instructions for LLM context with a rough char budget.
 *
 * @param {import('mongoose').Document} course - Course doc with sources[]
 * @param {object} [opts]
 * @param {string} [opts.extraInstructions]
 * @returns {{ contextText: string, truncated: boolean, sourceCount: number }}
 */
/**
 * Render a ready book source's chapter map (BOOK_GROUNDED_COURSES_PLAN.md
 * Section 4a) — 3-8k tokens covering the WHOLE book, in place of the first
 * 56k characters of raw text. Only reachable when USE_BOOK_SOURCES is on.
 */
function renderBookMapBlock(src, kind) {
  const map = src.bookMap;
  const lines = [
    `### Source (${kind} — full-book structure map): ${src.originalName || src.filename}`,
    `This book was ingested in full (${src.pageCount || '?'} pages, ${map.chapters.length} chapters). The map below covers the ENTIRE book.`,
    'When generating topics for this course, follow the book\'s own chapter progression and set each topic\'s syllabusAnchors to machine-usable chapter references of the form "ch:<index>" (e.g. "ch:3") for every chapter the topic covers, alongside any prose anchors.',
    '',
  ];
  for (const ch of map.chapters) {
    const pagePart = ch.pageStart != null ? ` (pp. ${ch.pageStart}-${ch.pageEnd})` : '';
    lines.push(`Chapter ${ch.index}: ${ch.title}${pagePart}`);
    if (ch.sections?.length) lines.push(`  Sections: ${ch.sections.join('; ')}`);
    if (ch.summary) lines.push(`  Summary: ${ch.summary}`);
  }
  return lines.join('\n');
}

function buildCourseContext(course, opts = {}) {
  const extra = (opts.extraInstructions || '').trim();
  const globalInstr = (course.globalInstructions || '').trim();
  const parts = [];
  if (globalInstr) parts.push(`### Instructor global instructions\n${globalInstr}`);
  if (extra) parts.push(`### Additional instructions\n${extra}`);

  let used = parts.join('\n\n').length;
  let truncated = false;
  const sources = course.sources || [];
  const ordered = orderedSourcesForContext(sources);
  const L = sources.length;

  for (const src of ordered) {
    const eff = effectiveSourceRole(src, L);
    const kind = eff === 'syllabus' ? 'Primary syllabus' : 'Reference (optional)';
    // Book-map branch (flag-gated): a ready ingested book contributes its
    // chapter map instead of truncated raw text. With the flag off this
    // branch is unreachable and output is byte-identical to the pre-feature
    // behavior (locked by tests/fixtures/buildCourseContext.baseline.json).
    const block = (useBookSources() && src.ingestStatus === 'ready' && src.bookMap?.chapters?.length)
      ? renderBookMapBlock(src, kind)
      : `### Source (${kind}): ${src.originalName || src.filename}\n${(src.extractedText || '').trim()}`;
    if (used + block.length > MAX_CONTEXT_CHARS) {
      const room = Math.max(0, MAX_CONTEXT_CHARS - used - 100);
      if (room > 200) {
        parts.push(block.slice(0, room) + '\n[...truncated...]');
        truncated = true;
      } else {
        truncated = true;
      }
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return {
    contextText: parts.join('\n\n'),
    truncated,
    sourceCount: sources.length
  };
}

/**
 * Pull lightweight outline cues from concatenated context (headings / numbered items).
 * Used to steer topic generation toward full-syllabus coverage.
 *
 * @param {string} contextText
 * @param {number} [maxHints=30]
 * @returns {string[]}
 */
function extractOutlineHints(contextText, maxHints = 60) {
  if (!contextText || typeof contextText !== 'string') return [];
  const hints = [];
  const lines = contextText.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,3}\s+\S/.test(t)) {
      hints.push(t.replace(/^#+\s+/, '').slice(0, 200));
    } else if (/^\d+\.\s+\S/.test(t) && t.length < 180) {
      hints.push(t.slice(0, 200));
    } else if (/^unit\s+\d+/i.test(t) && t.length < 200) {
      hints.push(t.slice(0, 200));
    } else if (/^week\s+\d+/i.test(t) && t.length < 200) {
      hints.push(t.slice(0, 200));
    } else if (/^module\s+\d+/i.test(t) && t.length < 200) {
      hints.push(t.slice(0, 200));
    }
    if (hints.length >= maxHints) break;
  }
  return hints;
}

module.exports = {
  buildCourseContext,
  MAX_CONTEXT_CHARS,
  MAX_PLAN_TOPICS,
  extractOutlineHints,
  effectiveSourceRole,
  syllabusSourceNamesForGuardrail,
  referenceSourceNamesForPrompt,
  orderedSourcesForContext,
  inferSegmentCountFromText,
  inferUnitCountFromText,
  parseExplicitTopicCountFromMessage,
  inferOnePerUnitRequested,
  resolveTopicPlanTargetCount,
  normalizeOptionalTopicMax
};

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const Enrollment = require('../models/Enrollment');
const Session = require('../models/Session');
const QuizAttempt = require('../models/QuizAttempt');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner, requireCourseTopicOwner } = require('../middleware/instructorOwnership');
const { extractTextFromFile } = require('../services/materialExtractionService');
const {
  buildCourseContext,
  extractOutlineHints,
  syllabusSourceNamesForGuardrail,
  referenceSourceNamesForPrompt,
  resolveTopicPlanTargetCount
} = require('../services/courseContextService');
const { runTopicPlanGeneratorAgent } = require('../agents/topicPlanGeneratorAgent');
const { runCourseTopicPlanModifyAgent } = require('../agents/courseTopicPlanModifyAgent');
const { runTopicDraftModifyAgent } = require('../agents/topicDraftModifyAgent');
const { validateTopicPlanPayload, validateSingleTopicPayload, normalizeTopicTitleKey } = require('../agents/validators/topicPlanValidator');
const { runIngestion } = require('../services/bookIngestionService');
const { useBookSources } = require('../agents/framework/featureFlag');
const logger = require('../utils/logger');

/** Chapter indices of ready ingested books (for ch:N anchor validation), or null. */
function bookChapterIndicesFor(course) {
  if (!useBookSources()) return null;
  const ready = (course.sources || []).filter((s) => s.ingestStatus === 'ready' && s.bookMap?.chapters?.length);
  if (!ready.length) return null;
  const indices = new Set();
  for (const src of ready) for (const ch of src.bookMap.chapters) indices.add(ch.index);
  return [...indices];
}

/**
 * Build the one-shot retry nudge appended to the model prompt when a plan
 * fails validation (pilot P4: generation is nondeterministic, so retry once
 * with the validation feedback before surfacing anything to the instructor).
 * Machine detail (Zod paths in internalErrors) is fine HERE — it goes to the
 * model, never to the instructor.
 */
function topicPlanRetryNudge(validated, syllabusNames) {
  if (validated.code === 'SYLLABUS_COVERAGE_SOURCES') {
    const missingNames = (syllabusNames || []).filter(Boolean);
    return missingNames.length > 0
      ? `\n\nIMPORTANT RETRY: Your previous output failed because it did not explicitly reference these primary syllabus filenames in syllabusCoverageOverview or syllabusAnchors: ${missingNames.join(
          '; '
        )}. Re-output valid JSON and ensure syllabusCoverageOverview includes the exact substring: "Primary syllabus files: ${missingNames.join('; ')}".`
      : '\n\nIMPORTANT RETRY: Your previous output failed the syllabus filename coverage guardrail. Re-output valid JSON and explicitly reference the primary syllabus filename(s) in syllabusCoverageOverview.';
  }
  const detail = (validated.internalErrors || validated.errors || []).slice(0, 5).join('; ');
  return `\n\nIMPORTANT RETRY: Your previous output failed structural validation: ${detail}. Structural rules: at most 20 topics, each with a UNIQUE title; each topic needs 1-8 modules and 1-10 syllabusAnchors; each module needs exactly 2-8 milestones (never fewer than 2, never more than 8); syllabusCoverageOverview must be 60-4500 characters. Re-output the FULL corrected JSON payload.`;
}

const COURSE_UPLOAD_DIR = process.env.COURSE_UPLOAD_DIR
  ? path.resolve(process.env.COURSE_UPLOAD_DIR)
  : path.join(__dirname, '../uploads/course-materials');

if (!fs.existsSync(COURSE_UPLOAD_DIR)) {
  fs.mkdirSync(COURSE_UPLOAD_DIR, { recursive: true });
}

const courseFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, COURSE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const base = `${req.params.courseId}_${Date.now()}_${path.basename(file.originalname)}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, base);
  }
});

const MAX_SOURCES_PER_COURSE = 10;
const MAX_BATCH_UPLOAD_BYTES = 15 * 1024 * 1024;
// Books (pdf/epub/docx) get a larger per-file cap; kept under Cloud Run's
// 32MB request limit. Non-book batches are still policed at 15MB in-handler.
const MAX_BOOK_FILE_BYTES = 30 * 1024 * 1024;

const courseUpload = multer({
  storage: courseFileStorage,
  limits: { fileSize: MAX_BOOK_FILE_BYTES, files: MAX_SOURCES_PER_COURSE }
});

function collectCourseUploadFiles(req) {
  const out = [];
  if (req.files?.files?.length) out.push(...req.files.files);
  if (req.files?.file?.length) out.push(...req.files.file);
  return out;
}

function parseSourceRoles(body, fileCount) {
  let roles = [];
  try {
    const r = body?.roles;
    if (typeof r === 'string' && r.trim()) {
      roles = JSON.parse(r);
    } else if (Array.isArray(r)) {
      roles = r;
    }
  } catch {
    roles = [];
  }
  const out = [];
  for (let i = 0; i < fileCount; i++) {
    const v = roles[i];
    if (v === 'syllabus' || v === 'reference') out.push(v);
    else out.push(i === 0 ? 'syllabus' : 'reference');
  }
  return out;
}

function unlinkQuiet(p) {
  fs.unlink(p, () => {});
}

const router = express.Router();
router.use(requireAuth, requireRole('instructor'));

const QUIZ_COGNITIVE_LEVELS = new Set([
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'
]);
const QUIZ_QUESTION_TYPES = new Set(['conceptual', 'applied', 'recall', 'analytical']);

/**
 * Coerce LLM quizPattern output to values Mongoose accepts.
 */
function sanitizeQuizPattern(qp) {
  if (!qp || typeof qp !== 'object') return {};
  const out = {};
  if (typeof qp.questionCount === 'number' && !Number.isNaN(qp.questionCount)) {
    out.questionCount = Math.min(10, Math.max(3, Math.round(qp.questionCount)));
  }
  if (qp.cognitiveLevel != null && qp.cognitiveLevel !== '') {
    const c = String(qp.cognitiveLevel).toLowerCase().trim();
    out.cognitiveLevel = QUIZ_COGNITIVE_LEVELS.has(c) ? c : 'understand';
  }
  if (Array.isArray(qp.questionTypes) && qp.questionTypes.length > 0) {
    out.questionTypes = qp.questionTypes
      .map((t) => ({
        type: QUIZ_QUESTION_TYPES.has(t?.type) ? t.type : 'conceptual',
        weight: typeof t?.weight === 'number' ? Math.min(100, Math.max(0, t.weight)) : 25
      }))
      .filter((t) => t.type);
  }
  if (qp.difficultyMix && typeof qp.difficultyMix === 'object') {
    out.difficultyMix = {
      easy: Math.min(100, Math.max(0, Number(qp.difficultyMix.easy) || 30)),
      medium: Math.min(100, Math.max(0, Number(qp.difficultyMix.medium) || 50)),
      hard: Math.min(100, Math.max(0, Number(qp.difficultyMix.hard) || 20))
    };
  }
  if (qp.constraints != null) {
    out.constraints = String(qp.constraints).trim().slice(0, 1000);
  }
  return out;
}

function normalizeModules(modules) {
  return (modules || []).map((m, i) => {
    const moduleId = m.moduleId && String(m.moduleId).trim()
      ? String(m.moduleId).trim()
      : `mod_${new mongoose.Types.ObjectId().toString()}_${i}`;
    const milestones = (m.milestones || []).map((ms) => ({ text: String(ms.text || '').trim() })).filter((ms) => ms.text);
    const rawPattern = m.quizPattern && typeof m.quizPattern === 'object' ? m.quizPattern : {};
    const quizPattern = sanitizeQuizPattern(rawPattern);
    return {
      moduleId,
      title: String(m.title || `Module ${i + 1}`).trim(),
      description: String(m.description || '').trim(),
      difficulty: ['intro', 'core', 'apply'].includes(m.difficulty) ? m.difficulty : 'core',
      points: typeof m.points === 'number' ? m.points : 10,
      milestones: milestones.length >= 2 ? milestones : [
        { text: 'Objective A' },
        { text: 'Objective B' }
      ],
      quizPattern: Object.keys(quizPattern).length ? quizPattern : {}
    };
  });
}

/** POST /v1/instructor/courses */
router.post('/courses', async (req, res, next) => {
  try {
    const { title, description, globalInstructions, planStrategy } = req.body || {};
    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'title is required', code: 'VALIDATION_ERROR' });
    }
    const course = await Course.create({
      instructorId: req.userId,
      title: String(title).trim(),
      description: String(description || '').trim(),
      globalInstructions: String(globalInstructions || '').trim(),
      planStrategy: planStrategy && typeof planStrategy === 'object' ? planStrategy : undefined
    });
    res.status(201).json({ success: true, data: { course } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses */
router.get('/courses', async (req, res, next) => {
  try {
    const courses = await Course.find({ instructorId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { courses } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId */
router.get('/courses/:courseId', requireCourseOwner, async (req, res) => {
  res.json({ success: true, data: { course: req.course } });
});

/** PATCH /v1/instructor/courses/:courseId */
router.patch('/courses/:courseId', requireCourseOwner, async (req, res, next) => {
  try {
    const { title, description, status, globalInstructions, planStrategy } = req.body || {};
    if (title != null) req.course.title = String(title).trim();
    if (description != null) req.course.description = String(description).trim();
    if (status != null && ['draft', 'active', 'archived'].includes(status)) req.course.status = status;
    if (globalInstructions != null) req.course.globalInstructions = String(globalInstructions).trim();
    if (planStrategy != null && typeof planStrategy === 'object') {
      const prev = req.course.planStrategy?.toObject
        ? req.course.planStrategy.toObject()
        : { ...(req.course.planStrategy || {}) };
      const merged = { ...prev, ...planStrategy };
      if (merged.topicCountMax === '' || merged.topicCountMax === null) {
        delete merged.topicCountMax;
      } else if (merged.topicCountMax !== undefined) {
        merged.topicCountMax = Math.min(20, Math.max(1, Math.round(Number(merged.topicCountMax))));
      }
      if (merged.topicCount != null && merged.topicCount !== '') {
        merged.topicCount = Math.min(20, Math.max(1, Math.round(Number(merged.topicCount))));
      }
      const floor = merged.topicCount ?? prev.topicCount ?? 4;
      if (merged.topicCountMax != null && merged.topicCountMax < floor) {
        return res.status(400).json({
          success: false,
          error: 'Maximum topics must be greater than or equal to minimum topics.',
          code: 'VALIDATION_ERROR'
        });
      }
      req.course.planStrategy = merged;
    }
    await req.course.save();
    res.json({ success: true, data: { course: req.course } });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/archive */
router.post('/courses/:courseId/archive', requireCourseOwner, async (req, res, next) => {
  try {
    req.course.status = 'archived';
    await req.course.save();
    res.json({ success: true, data: { course: req.course } });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /v1/instructor/courses/:courseId
 * Hard-delete course, topics, enrollments, and associated sessions so students lose access immediately.
 */
router.delete('/courses/:courseId', requireCourseOwner, async (req, res, next) => {
  try {
    const courseId = req.course._id;

    const courseTopics = await CourseTopic.find({ courseId }).select('_id').lean();
    const topicIds = courseTopics.map((t) => t._id);

    const sessions = await Session.find({ courseId }).select('_id').lean();
    const sessionIds = sessions.map((s) => s._id);

    if (sessionIds.length) {
      // Best-effort: remove persisted quiz attempts so there are no dangling references.
      await QuizAttempt.deleteMany({ sessionId: { $in: sessionIds } });
    }
    if (sessions.length) {
      await Session.deleteMany({ courseId });
    }

    if (topicIds.length) {
      await CourseTopic.deleteMany({ courseId });
      // Also clean up topic-scoped sessions (if any were created with courseId null).
      await Session.deleteMany({ courseTopicId: { $in: topicIds } });
    }

    await Enrollment.deleteMany({ courseId });
    await req.course.deleteOne();

    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/sources — batch upload (field "files" or legacy "file"), max 10 files / 15MB total */
router.post(
  '/courses/:courseId/sources',
  requireCourseOwner,
  courseUpload.fields([
    { name: 'files', maxCount: MAX_SOURCES_PER_COURSE },
    { name: 'file', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const rawFiles = collectCourseUploadFiles(req);
      if (rawFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one file is required (multipart field "files" or legacy "file")',
          code: 'VALIDATION_ERROR'
        });
      }
      if (rawFiles.length > MAX_SOURCES_PER_COURSE) {
        rawFiles.forEach((f) => unlinkQuiet(f.path));
        return res.status(400).json({
          success: false,
          error: `At most ${MAX_SOURCES_PER_COURSE} files per request`,
          code: 'TOO_MANY_FILES'
        });
      }
      // Size rules: book formats (pdf/epub/docx) may use the larger per-file
      // cap; plain-text materials keep the original batch budget. The book cap
      // stays under Cloud Run's 32MB request limit deliberately.
      const isBookFormat = (f) => /\.(pdf|epub|docx)$/i.test(f.originalname || '');
      const nonBookBytes = rawFiles.filter((f) => !isBookFormat(f)).reduce((s, f) => s + (f.size || 0), 0);
      if (nonBookBytes > MAX_BATCH_UPLOAD_BYTES) {
        rawFiles.forEach((f) => unlinkQuiet(f.path));
        return res.status(413).json({
          success: false,
          error: `Total upload size for non-book files exceeds ${MAX_BATCH_UPLOAD_BYTES / (1024 * 1024)}MB`,
          code: 'PAYLOAD_TOO_LARGE'
        });
      }
      const currentCount = (req.course.sources || []).length;
      if (currentCount + rawFiles.length > MAX_SOURCES_PER_COURSE) {
        rawFiles.forEach((f) => unlinkQuiet(f.path));
        return res.status(400).json({
          success: false,
          error: `This course already has ${currentCount} file(s). You can have at most ${MAX_SOURCES_PER_COURSE} total.`,
          code: 'SOURCE_LIMIT'
        });
      }

      const roles = parseSourceRoles(req.body, rawFiles.length);
      const createdDocs = [];

      for (let i = 0; i < rawFiles.length; i++) {
        const f = rawFiles[i];
        const filePath = f.path;
        const mimeType = f.mimetype || 'application/octet-stream';
        let extractedText = '';
        let wordCount = 0;
        let pdfPageCount = 0;
        try {
          const ex = await extractTextFromFile(filePath, mimeType);
          extractedText = ex.text;
          wordCount = ex.wordCount;
          pdfPageCount = ex.pageCount || 0;
        } catch (exErr) {
          logger.warn({ err: exErr.message, courseId: req.params.courseId }, 'Extraction failed; storing metadata only');
        }
        // Scanned-PDF detection (book plan Section 2): a scan "succeeds" with
        // an empty text layer, then breaks topic generation two screens away.
        // Fail loudly HERE with a message the instructor can act on. No OCR
        // in this phase.
        const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(f.originalname || '');
        if (isPdf && pdfPageCount >= 5 && wordCount / pdfPageCount < 20) {
          rawFiles.forEach((file) => unlinkQuiet(file.path));
          return res.status(422).json({
            success: false,
            error:
              `"${f.originalname}" appears to be a scanned PDF (page images without a text layer — ` +
              `only ${wordCount} readable words across ${pdfPageCount} pages). Text cannot be extracted from scans. ` +
              'Upload a digital PDF or an EPUB of this document instead.',
            code: 'SCANNED_PDF'
          });
        }
        createdDocs.push({
          filename: f.filename,
          originalName: f.originalname,
          mimeType,
          sizeBytes: f.size || 0,
          extractedText,
          wordCount,
          chunkCount: 0,
          role: roles[i]
        });
      }

      req.course.sources.push(...createdDocs);
      await req.course.save();
      const added = req.course.sources.slice(-rawFiles.length);
      const single = rawFiles.length === 1;
      res.status(201).json({
        success: true,
        data: single ? { source: added[0], sources: added } : { sources: added }
      });
    } catch (e) {
      next(e);
    }
  }
);

/** PATCH /v1/instructor/courses/:courseId/sources/:sourceId — e.g. set role syllabus | reference */
router.patch('/courses/:courseId/sources/:sourceId', requireCourseOwner, async (req, res, next) => {
  try {
    const sid = req.params.sourceId;
    const doc = req.course.sources.id(sid);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Source not found', code: 'NOT_FOUND' });
    }
    const { role } = req.body || {};
    if (role === 'syllabus' || role === 'reference') {
      doc.role = role;
      await req.course.save();
    }
    res.json({ success: true, data: { source: doc } });
  } catch (e) {
    next(e);
  }
});

/** DELETE /v1/instructor/courses/:courseId/sources/:sourceId */
router.delete('/courses/:courseId/sources/:sourceId', requireCourseOwner, async (req, res, next) => {
  try {
    const sid = req.params.sourceId;
    const doc = req.course.sources.id(sid);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Source not found', code: 'NOT_FOUND' });
    }
    const filePath = path.join(COURSE_UPLOAD_DIR, doc.filename);
    req.course.sources.pull({ _id: sid });
    await req.course.save();
    fs.unlink(filePath, () => {});
    res.json({ success: true, data: { removed: true } });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /v1/instructor/courses/:courseId/sources/:sourceId/ingest
 * Book ingestion (BOOK_GROUNDED_COURSES_PLAN.md Phase 1). Flag-gated; runs
 * the staged pipeline in-request (a 500-page digital book completes well
 * inside the Cloud Run window) and doubles as the retry endpoint — stages
 * are idempotent. The client polls the course GET for ingestStatus.
 */
router.post('/courses/:courseId/sources/:sourceId/ingest', requireCourseOwner, async (req, res, next) => {
  try {
    if (!useBookSources()) {
      return res.status(403).json({
        success: false,
        error: 'Book ingestion is not enabled on this deployment.',
        code: 'FEATURE_DISABLED'
      });
    }
    const src = req.course.sources.id(req.params.sourceId);
    if (!src) {
      return res.status(404).json({ success: false, error: 'Source not found', code: 'NOT_FOUND' });
    }
    if (['extracting', 'structuring', 'embedding'].includes(src.ingestStatus)) {
      return res.status(409).json({ success: false, error: 'Ingestion is already running for this source.', code: 'INGEST_RUNNING' });
    }
    const filePath = path.join(COURSE_UPLOAD_DIR, src.filename);
    try {
      await fs.promises.access(filePath);
    } catch {
      return res.status(410).json({
        success: false,
        error: 'The uploaded file is no longer on disk (instance storage is ephemeral). Re-upload the file, then ingest.',
        code: 'FILE_MISSING'
      });
    }
    const result = await runIngestion({
      courseId: req.course._id,
      sourceId: src._id,
      filePath,
      mimeType: src.mimeType,
      originalName: src.originalName
    });
    if (!result.ok) {
      return res.status(422).json({ success: false, error: result.error, code: result.code });
    }
    res.json({ success: true, data: { report: result.report } });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /v1/instructor/courses/:courseId/book-coverage
 * Chapter-to-module coverage (plan Section 6): every chapter of each ready
 * book, which topics/modules anchor to it (via machine-usable "ch:N"
 * anchors), an explicit "Not covered" bucket, and topics carrying no chapter
 * anchors at all. Anchors are edited through the existing topic PATCH.
 */
router.get('/courses/:courseId/book-coverage', requireCourseOwner, async (req, res, next) => {
  try {
    const books = (req.course.sources || []).filter(
      (s) => s.ingestStatus === 'ready' && s.bookMap?.chapters?.length
    );
    if (!books.length) {
      return res.json({ success: true, data: { books: [], planContextTruncated: req.course.planContextTruncated ?? null } });
    }
    const topics = await CourseTopic.find({ courseId: req.course._id })
      .select('title status syllabusAnchors modules.title orderIndex updatedAt')
      .sort({ orderIndex: 1 })
      .lean();
    const parseCh = (a) => {
      const m = String(a).trim().match(/^ch:(\d+)(?:\.\d+)?$/i);
      return m ? Number(m[1]) : null;
    };
    const data = books.map((src) => {
      const chapters = src.bookMap.chapters.map((ch) => {
        const coveredBy = topics
          .filter((t) => (t.syllabusAnchors || []).some((a) => parseCh(a) === ch.index))
          .map((t) => ({
            topicId: t._id,
            title: t.title,
            status: t.status,
            modules: (t.modules || []).map((m) => m.title)
          }));
        return {
          index: ch.index,
          title: ch.title,
          pageStart: ch.pageStart,
          pageEnd: ch.pageEnd,
          summary: ch.summary,
          coveredBy
        };
      });
      return {
        sourceId: src._id,
        name: src.originalName,
        generatedAt: src.bookMap.generatedAt,
        ingestReport: src.ingestReport || null,
        chapters,
        notCovered: chapters.filter((c) => c.coveredBy.length === 0).map((c) => ({ index: c.index, title: c.title })),
        topicsWithoutChapterAnchors: topics
          .filter((t) => !(t.syllabusAnchors || []).some((a) => parseCh(a) != null))
          .map((t) => ({ topicId: t._id, title: t.title }))
      };
    });
    res.json({ success: true, data: { books: data, planContextTruncated: req.course.planContextTruncated ?? null } });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/topics */
router.get('/courses/:courseId/topics', requireCourseOwner, async (req, res, next) => {
  try {
    const topics = await CourseTopic.find({ courseId: req.course._id }).sort({ orderIndex: 1, createdAt: 1 }).lean();
    res.json({ success: true, data: { topics } });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/topics */
router.post('/courses/:courseId/topics', requireCourseOwner, async (req, res, next) => {
  try {
    const { title, objective, modules, orderIndex } = req.body || {};
    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'title is required', code: 'VALIDATION_ERROR' });
    }
    let mods = normalizeModules(modules);
    if (mods.length === 0) {
      mods = normalizeModules([{
        title: 'Module 1',
        description: 'Edit in topic editor',
        difficulty: 'core',
        points: 10,
        milestones: [{ text: 'First objective' }, { text: 'Second objective' }]
      }]);
    }
    const maxOrder = await CourseTopic.findOne({ courseId: req.course._id }).sort({ orderIndex: -1 }).select('orderIndex').lean();
    const nextOrder = typeof orderIndex === 'number' ? orderIndex : (maxOrder ? maxOrder.orderIndex + 1 : 0);
    const topic = await CourseTopic.create({
      courseId: req.course._id,
      title: String(title).trim(),
      objective: String(objective || '').trim(),
      orderIndex: nextOrder,
      status: 'draft',
      modules: mods,
      updatedBy: req.userId
    });
    res.status(201).json({ success: true, data: { topic } });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/generate-topics */
router.post('/courses/:courseId/generate-topics', requireCourseOwner, async (req, res, next) => {
  try {
    const body = req.body || {};
    const topicCountOverride = body.topicCount != null ? Number(body.topicCount) : undefined;
    const chatHint = typeof body.message === 'string' ? body.message.trim() : '';
    const instruct = chatHint || 'Generate draft topics from the syllabus.';

    const { contextText, truncated } = buildCourseContext(req.course, {
      extraInstructions: instruct
    });
    if (!contextText || contextText.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Upload sources or add global instructions before generating topics',
        code: 'INSUFFICIENT_CONTEXT'
      });
    }
    const syllabusNames = syllabusSourceNamesForGuardrail(req.course.sources || []);
    if (syllabusNames === null) {
      return res.status(400).json({
        success: false,
        error:
          'This course has multiple materials but none are marked as the primary syllabus. Open Course Materials, set at least one file to "Syllabus" (others can stay "Reference"), then generate again.',
        code: 'SYLLABUS_REQUIRED'
      });
    }
    const referenceNames = referenceSourceNamesForPrompt(req.course.sources || []);
    const outlineHints = extractOutlineHints(contextText);
    let resolved = resolveTopicPlanTargetCount({
      bodyTopicCount: topicCountOverride,
      planStrategyTopicCount: req.course.planStrategy?.topicCount,
      planStrategyTopicCountMax: req.course.planStrategy?.topicCountMax,
      instructorMessage: instruct,
      contextText,
      outlineHints
    });
    // Book-backed courses (flag-gated): "one topic per chapter" targets the
    // ingested book's chapter count. The shared resolver knows Unit/Week
    // labels only, and extending it globally would change non-book behavior.
    const bookChaptersForCount = bookChapterIndicesFor(req.course);
    if (bookChaptersForCount && topicCountOverride == null && /per\s+chapter/i.test(instruct)) {
      const n = Math.min(bookChaptersForCount.length, 20);
      resolved = { ...resolved, target: n, rationale: `one topic per chapter of the ingested book (${bookChaptersForCount.length} chapters)`, perUnitRequested: true, inferredSegments: bookChaptersForCount.length };
    }

    let raw = await runTopicPlanGeneratorAgent({
      contextText,
      planStrategy: req.course.planStrategy,
      topicCount: resolved.target,
      syllabusSourceNames: syllabusNames,
      referenceSourceNames: referenceNames,
      truncated,
      outlineHints,
      instructorIntent: instruct,
      topicCountRationale: resolved.rationale,
      perUnitRequested: resolved.perUnitRequested,
      topicBasis: resolved.topicBasis
    });

    let validated = validateTopicPlanPayload(raw, { syllabusSourceNames: syllabusNames, bookChapters: bookChapterIndicesFor(req.course) });

    // Auto-retry once on ANY validation failure (coverage guardrail or
    // structure the repair pass couldn't save), with feedback in the prompt.
    if (!validated.valid) {
      logger.warn(
        { courseId: req.course._id.toString(), code: validated.code, internalErrors: validated.internalErrors || validated.errors },
        'topic plan failed validation; retrying once with feedback'
      );
      const retryNudge = topicPlanRetryNudge(validated, syllabusNames);

      raw = await runTopicPlanGeneratorAgent({
        contextText,
        planStrategy: req.course.planStrategy,
        topicCount: resolved.target,
        syllabusSourceNames: syllabusNames,
        referenceSourceNames: referenceNames,
        truncated,
        outlineHints,
        instructorIntent: `${instruct}${retryNudge}`,
        topicCountRationale: resolved.rationale,
        perUnitRequested: resolved.perUnitRequested,
        topicBasis: resolved.topicBasis
      });

      validated = validateTopicPlanPayload(raw, { syllabusSourceNames: syllabusNames, bookChapters: bookChapterIndicesFor(req.course) });
    }

    if (!validated.valid) {
      logger.warn(
        { courseId: req.course._id.toString(), code: validated.code, internalErrors: validated.internalErrors || validated.errors },
        'topic plan failed validation after retry'
      );
      return res.status(422).json({
        success: false,
        error: validated.errors?.[0] || 'Generated plan failed validation',
        code: validated.code || 'TOPIC_PLAN_INVALID',
        details: validated.errors
      });
    }

    // Record whether this plan was generated from truncated context — the
    // coverage view surfaces it (the instructor was previously never told).
    Course.updateOne({ _id: req.course._id }, { $set: { planContextTruncated: truncated } }).catch(() => {});
    const delDrafts = await CourseTopic.deleteMany({ courseId: req.course._id, status: 'draft' });
    const draftRemovalCount = delDrafts.deletedCount || 0;
    const maxOrderDoc = await CourseTopic.findOne({ courseId: req.course._id }).sort({ orderIndex: -1 }).select('orderIndex').lean();
    let baseOrder = maxOrderDoc ? maxOrderDoc.orderIndex + 1 : 0;
    const existingTopics = await CourseTopic.find({ courseId: req.course._id }).select('title').lean();
    const takenTitleKeys = new Set(existingTopics.map((d) => normalizeTopicTitleKey(d.title)));
    const warnings = [...(validated.warnings || [])];
    if (draftRemovalCount > 0) {
      warnings.unshift(
        `Removed ${draftRemovalCount} draft topic${draftRemovalCount === 1 ? '' : 's'} before generating new drafts. Approved or published topics were kept.`
      );
    }
    warnings.push(`Topic target: ${resolved.target} — ${resolved.rationale}.`);
    if (truncated) {
      warnings.push(
        'Syllabus text was truncated for the AI context budget. Set COURSE_CONTEXT_MAX_CHARS or use shorter syllabus files for full coverage.'
      );
    }
    if (resolved.cappedByMax) {
      warnings.push(
        'Topic count was limited by your course "maximum topics" setting. Raise or clear the max to allow more drafts.'
      );
    }
    const created = [];
    let orderOffset = 0;
    for (let i = 0; i < validated.topics.length; i++) {
      const t = validated.topics[i];
      const key = normalizeTopicTitleKey(t.title);
      if (takenTitleKeys.has(key)) {
        warnings.push(`Skipped "${t.title}" — a topic with the same title already exists on this course.`);
        continue;
      }
      takenTitleKeys.add(key);
      const mods = normalizeModules(t.modules);
      const topic = await CourseTopic.create({
        courseId: req.course._id,
        title: t.title,
        objective: t.objective || '',
        orderIndex: baseOrder + orderOffset,
        status: 'draft',
        modules: mods,
        syllabusAnchors: Array.isArray(t.syllabusAnchors) ? t.syllabusAnchors.slice(0, 12) : [],
        updatedBy: req.userId,
        changeNotes: 'AI-generated draft'
      });
      created.push(topic);
      orderOffset += 1;
    }
    if (created.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No new topics to create — every generated title matched an existing topic on this course.',
        code: 'NO_TOPICS_CREATED',
        details: { warnings }
      });
    }
    res.status(201).json({
      success: true,
      data: {
        topics: created,
        ...(validated.syllabusCoverageOverview
          ? { coverageOverview: validated.syllabusCoverageOverview }
          : {}),
        ...(warnings.length ? { warnings } : {})
      }
    });
  } catch (e) {
    next(e);
  }
});

/** GET /v1/instructor/courses/:courseId/topics/:topicId */
router.get('/courses/:courseId/topics/:topicId', requireCourseTopicOwner, async (req, res) => {
  res.json({ success: true, data: { topic: req.courseTopic } });
});

/** PATCH /v1/instructor/courses/:courseId/topics/:topicId */
router.patch('/courses/:courseId/topics/:topicId', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const { title, objective, modules, orderIndex, changeNotes, status, syllabusAnchors } = req.body || {};
    const topic = req.courseTopic;
    if (title != null) topic.title = String(title).trim();
    if (objective != null) topic.objective = String(objective).trim();
    if (typeof orderIndex === 'number') topic.orderIndex = orderIndex;
    if (changeNotes != null) topic.changeNotes = String(changeNotes).trim();
    if (modules != null) topic.modules = normalizeModules(modules);
    if (syllabusAnchors != null) {
      const list = Array.isArray(syllabusAnchors)
        ? syllabusAnchors
        : String(syllabusAnchors).split(/\n/);
      topic.syllabusAnchors = list
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 12);
    }
    if (status != null && ['draft', 'approved', 'published', 'unpublished'].includes(status)) {
      if (!topic.canTransitionTo(status)) {
        return res.status(409).json({
          success: false,
          error: `Invalid status transition ${topic.status} → ${status}`,
          code: 'INVALID_STATUS_TRANSITION'
        });
      }
      topic.status = status;
      if (status === 'published') topic.publishedAt = new Date();
    }
    topic.updatedBy = req.userId;
    await topic.save();
    res.json({ success: true, data: { topic } });
  } catch (e) {
    next(e);
  }
});

/** DELETE /v1/instructor/courses/:courseId/topics/:topicId */
router.delete('/courses/:courseId/topics/:topicId', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const courseId = req.course._id;
    const topicId = req.courseTopic._id;

    const sessions = await Session.find({ courseId, courseTopicId: topicId }).select('_id').lean();
    const sessionIds = sessions.map((s) => s._id);
    if (sessionIds.length) {
      await QuizAttempt.deleteMany({ sessionId: { $in: sessionIds } });
    }
    if (sessionIds.length) {
      await Session.deleteMany({ courseId, courseTopicId: topicId });
    }

    await req.courseTopic.deleteOne();
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
});

/** POST .../approve */
router.post('/courses/:courseId/topics/:topicId/approve', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const topic = req.courseTopic;
    if (!topic.canTransitionTo('approved')) {
      return res.status(409).json({
        success: false,
        error: `Cannot approve from status ${topic.status}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }
    topic.status = 'approved';
    topic.updatedBy = req.userId;
    await topic.save();
    res.json({ success: true, data: { topic } });
  } catch (e) {
    next(e);
  }
});

/** POST .../publish */
router.post('/courses/:courseId/topics/:topicId/publish', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const topic = req.courseTopic;
    if (!topic.canTransitionTo('published')) {
      return res.status(409).json({
        success: false,
        error: `Cannot publish from status ${topic.status}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }
    topic.status = 'published';
    topic.publishedAt = new Date();
    topic.version = (topic.version || 1) + 1;
    topic.updatedBy = req.userId;
    await topic.save();
    res.json({ success: true, data: { topic } });
  } catch (e) {
    next(e);
  }
});

/** POST .../unpublish */
router.post('/courses/:courseId/topics/:topicId/unpublish', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const topic = req.courseTopic;
    if (!topic.canTransitionTo('unpublished')) {
      return res.status(409).json({
        success: false,
        error: `Cannot unpublish from status ${topic.status}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }
    topic.status = 'unpublished';
    topic.updatedBy = req.userId;
    await topic.save();
    res.json({ success: true, data: { topic } });
  } catch (e) {
    next(e);
  }
});

// ─── Course-level chat-based modify ─────────────────────────────────────────

/** GET /v1/instructor/courses/:courseId/topic-plan/chat — persisted chat history */
router.get('/courses/:courseId/topic-plan/chat', requireCourseOwner, async (req, res) => {
  const chat = req.course.instructorChat || [];
  res.json({
    success: true,
    data: {
      messages: chat,
      latestCoverageOverview: req.course.latestCoverageOverview || ''
    }
  });
});

/**
 * Shared logic: build context, run an agent, validate, persist drafts + chat.
 * Returns { topics, coverageOverview, warnings } or throws a response.
 */
async function runTopicPlanPipeline(req, res, { instructorMessage, kind }) {
  const course = req.course;
  const bodyTopicCount = req.body?.topicCount;
  const genDefault = 'Generate the initial topic plan from the syllabus.';
  const instructForResolve =
    kind === 'generate'
      ? (String(instructorMessage || '').trim() || genDefault)
      : String(instructorMessage || '').trim();

  const contextExtra =
    kind === 'generate'
      ? instructForResolve
      : instructForResolve
        ? `Latest plan modification request:\n${instructForResolve}`
        : '';

  const { contextText, truncated } = buildCourseContext(course, {
    extraInstructions: contextExtra
  });
  if (!contextText || contextText.length < 50) {
    return res.status(400).json({
      success: false,
      error: 'Upload sources or add global instructions before generating topics',
      code: 'INSUFFICIENT_CONTEXT'
    });
  }

  const syllabusNames = syllabusSourceNamesForGuardrail(course.sources || []);
  if (syllabusNames === null) {
    return res.status(400).json({
      success: false,
      error: 'This course has multiple materials but none are marked as the primary syllabus. Set at least one file to "Syllabus", then try again.',
      code: 'SYLLABUS_REQUIRED'
    });
  }
  const referenceNames = referenceSourceNamesForPrompt(course.sources || []);
  const outlineHints = extractOutlineHints(contextText);

  let resolved = resolveTopicPlanTargetCount({
    bodyTopicCount,
    planStrategyTopicCount: course.planStrategy?.topicCount,
    planStrategyTopicCountMax: course.planStrategy?.topicCountMax,
    instructorMessage: instructForResolve,
    contextText,
    outlineHints
  });
  // Book-backed courses (flag-gated): "one topic per chapter" targets the
  // ingested book's chapter count (see the generate-topics route note).
  const pipelineBookChapters = bookChapterIndicesFor(req.course);
  if (pipelineBookChapters && bodyTopicCount == null && /per\s+chapter/i.test(instructForResolve)) {
    const n = Math.min(pipelineBookChapters.length, 20);
    resolved = { ...resolved, target: n, rationale: `one topic per chapter of the ingested book (${pipelineBookChapters.length} chapters)`, perUnitRequested: true, inferredSegments: pipelineBookChapters.length };
  }

  const allTopics = await CourseTopic.find({ courseId: course._id }).sort({ orderIndex: 1 }).lean();

  let raw;
  if (kind === 'generate') {
    raw = await runTopicPlanGeneratorAgent({
      contextText,
      planStrategy: course.planStrategy,
      topicCount: resolved.target,
      syllabusSourceNames: syllabusNames,
      referenceSourceNames: referenceNames,
      truncated,
      outlineHints,
      instructorIntent: instructForResolve,
      topicCountRationale: resolved.rationale,
      perUnitRequested: resolved.perUnitRequested,
      topicBasis: resolved.topicBasis
    });
  } else {
    raw = await runCourseTopicPlanModifyAgent({
      contextText,
      planStrategy: course.planStrategy,
      syllabusSourceNames: syllabusNames,
      referenceSourceNames: referenceNames,
      truncated,
      outlineHints,
      currentTopics: allTopics,
      chatHistory: (course.instructorChat || []).slice(-10),
      modificationRequest: instructForResolve,
      targetDraftTopicCount: resolved.strictDraftCount ? resolved.target : undefined,
      perUnitRequested: resolved.perUnitRequested,
      topicCountRationale: resolved.rationale,
      topicBasis: resolved.topicBasis
    });
  }

  const validated = validateTopicPlanPayload(raw, { syllabusSourceNames: syllabusNames, bookChapters: bookChapterIndicesFor(req.course) });
  let finalValidated = validated;

  // Auto-retry once on ANY validation failure, with feedback in the prompt.
  if (!finalValidated.valid) {
    logger.warn(
      { courseId: course._id.toString(), code: finalValidated.code, internalErrors: finalValidated.internalErrors || finalValidated.errors },
      'topic plan failed validation; retrying once with feedback'
    );
    const retryNudge = topicPlanRetryNudge(finalValidated, syllabusNames);

    if (kind === 'generate') {
      raw = await runTopicPlanGeneratorAgent({
        contextText,
        planStrategy: course.planStrategy,
        topicCount: resolved.target,
        syllabusSourceNames: syllabusNames,
        referenceSourceNames: referenceNames,
        truncated,
        outlineHints,
        instructorIntent: `${instructForResolve}${retryNudge}`,
        topicCountRationale: resolved.rationale,
        perUnitRequested: resolved.perUnitRequested,
        topicBasis: resolved.topicBasis
      });
    } else {
      raw = await runCourseTopicPlanModifyAgent({
        contextText,
        planStrategy: course.planStrategy,
        syllabusSourceNames: syllabusNames,
        referenceSourceNames: referenceNames,
        truncated,
        outlineHints,
        currentTopics: allTopics,
        chatHistory: (course.instructorChat || []).slice(-10),
        modificationRequest: `${instructForResolve}${retryNudge}`,
        targetDraftTopicCount: resolved.strictDraftCount ? resolved.target : undefined,
        perUnitRequested: resolved.perUnitRequested,
        topicCountRationale: resolved.rationale,
        topicBasis: resolved.topicBasis
      });
    }

    finalValidated = validateTopicPlanPayload(raw, { syllabusSourceNames: syllabusNames, bookChapters: bookChapterIndicesFor(req.course) });
  }

  if (!finalValidated.valid) {
    logger.warn(
      { courseId: course._id.toString(), code: finalValidated.code, internalErrors: finalValidated.internalErrors || finalValidated.errors },
      'topic plan failed validation after retry'
    );
    return res.status(422).json({
      success: false,
      error: finalValidated.errors?.[0] || 'Generated plan failed validation',
      code: finalValidated.code || 'TOPIC_PLAN_INVALID',
      details: finalValidated.errors
    });
  }

  Course.updateOne({ _id: course._id }, { $set: { planContextTruncated: truncated } }).catch(() => {});
  const delDrafts = await CourseTopic.deleteMany({ courseId: course._id, status: 'draft' });
  const draftRemovalCount = delDrafts.deletedCount || 0;

  const maxOrderDoc = await CourseTopic.findOne({ courseId: course._id }).sort({ orderIndex: -1 }).select('orderIndex').lean();
  let baseOrder = maxOrderDoc ? maxOrderDoc.orderIndex + 1 : 0;

  const existingTopics = await CourseTopic.find({ courseId: course._id }).select('title').lean();
  const takenTitleKeys = new Set(existingTopics.map((d) => normalizeTopicTitleKey(d.title)));

  const warnings = [...(finalValidated.warnings || [])];
  if (draftRemovalCount > 0) {
    warnings.unshift(
      `Replaced ${draftRemovalCount} draft topic${draftRemovalCount === 1 ? '' : 's'}. Approved/published topics kept.`
    );
  }
  warnings.push(`Topic target: ${resolved.target} — ${resolved.rationale}.`);
  if (truncated) {
    warnings.push(
      'Syllabus text was truncated for the AI context budget. For best results, shorten very long PDFs, split materials, or set COURSE_CONTEXT_MAX_CHARS higher in .env.'
    );
  }
  if (resolved.perUnitRequested && resolved.inferredSegments === 0) {
    warnings.push(
      'You asked for one topic per unit, but no Unit/Week numbers were detected in the extracted text. Ensure the syllabus uses labels like "Unit 1" or add an explicit number (e.g. "6 topics") in your message.'
    );
  }
  if (resolved.cappedByMax) {
    warnings.push(
      'Topic count was limited by your course "maximum topics" setting. Raise or clear the max to allow more drafts.'
    );
  }

  const created = [];
  let orderOffset = 0;
  for (const t of finalValidated.topics) {
    const key = normalizeTopicTitleKey(t.title);
    if (takenTitleKeys.has(key)) {
      warnings.push(`Skipped "${t.title}" — already exists.`);
      continue;
    }
    takenTitleKeys.add(key);
    const mods = normalizeModules(t.modules);
    const topic = await CourseTopic.create({
      courseId: course._id,
      title: t.title,
      objective: t.objective || '',
      orderIndex: baseOrder + orderOffset,
      status: 'draft',
      modules: mods,
      syllabusAnchors: Array.isArray(t.syllabusAnchors) ? t.syllabusAnchors.slice(0, 12) : [],
      updatedBy: req.userId,
      changeNotes: kind === 'generate' ? 'AI-generated draft' : 'AI-modified draft'
    });
    created.push(topic);
    orderOffset += 1;
  }

  if (created.length === 0) {
    return res.status(422).json({
      success: false,
      error: 'No new topics created — every generated title matched an existing topic.',
      code: 'NO_TOPICS_CREATED',
      details: { warnings }
    });
  }

  const assistantMessage = finalValidated.syllabusCoverageOverview
    ? `Created ${created.length} topic${created.length !== 1 ? 's' : ''}.\n\n${finalValidated.syllabusCoverageOverview}`
    : `Created ${created.length} topic${created.length !== 1 ? 's' : ''}.`;

  course.instructorChat = course.instructorChat || [];
  course.instructorChat.push(
    { role: 'instructor', content: instructForResolve, metadata: { kind } },
    { role: 'assistant', content: assistantMessage, metadata: { kind, topicCount: created.length } }
  );
  if (finalValidated.syllabusCoverageOverview) {
    course.latestCoverageOverview = finalValidated.syllabusCoverageOverview;
  }
  await course.save();

  return res.status(201).json({
    success: true,
    data: {
      topics: created,
      assistantMessage,
      ...(finalValidated.syllabusCoverageOverview ? { coverageOverview: finalValidated.syllabusCoverageOverview } : {}),
      ...(warnings.length ? { warnings } : {})
    }
  });
}

/** POST /v1/instructor/courses/:courseId/topic-plan/generate */
router.post('/courses/:courseId/topic-plan/generate', requireCourseOwner, async (req, res, next) => {
  try {
    const message = String(req.body?.message || 'Generate the initial topic plan.').trim();
    await runTopicPlanPipeline(req, res, {
      instructorMessage: message,
      kind: 'generate'
    });
  } catch (e) {
    next(e);
  }
});

/** POST /v1/instructor/courses/:courseId/topic-plan/modify */
router.post('/courses/:courseId/topic-plan/modify', requireCourseOwner, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'A modification message is required',
        code: 'VALIDATION_ERROR'
      });
    }
    await runTopicPlanPipeline(req, res, {
      instructorMessage: message,
      kind: 'modify'
    });
  } catch (e) {
    next(e);
  }
});

// ─── Topic-level AI modify (draft only) ─────────────────────────────────────

/** POST /v1/instructor/courses/:courseId/topics/:topicId/ai-modify */
router.post('/courses/:courseId/topics/:topicId/ai-modify', requireCourseTopicOwner, async (req, res, next) => {
  try {
    const topic = req.courseTopic;
    if (topic.status !== 'draft') {
      return res.status(409).json({
        success: false,
        error: 'Only draft topics can be modified by AI. Approved/published topics are locked.',
        code: 'NOT_DRAFT'
      });
    }
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'A modification message is required',
        code: 'VALIDATION_ERROR'
      });
    }

    let raw = await runTopicDraftModifyAgent({
      topic: topic.toObject(),
      modificationRequest: message
    });

    let validated = validateSingleTopicPayload(raw);

    // Auto-retry once with validation feedback (same policy as plan generation).
    if (!validated.valid) {
      logger.warn(
        { topicId: topic._id.toString(), internalErrors: validated.internalErrors || validated.errors },
        'AI topic edit failed validation; retrying once with feedback'
      );
      const detail = (validated.internalErrors || validated.errors || []).slice(0, 5).join('; ');
      raw = await runTopicDraftModifyAgent({
        topic: topic.toObject(),
        modificationRequest: `${message}\n\nIMPORTANT RETRY: Your previous output failed structural validation: ${detail}. Rules: the topic needs 1-8 modules and 1-10 syllabusAnchors; each module needs exactly 2-8 milestones. Re-output the FULL corrected topic JSON.`
      });
      validated = validateSingleTopicPayload(raw);
    }

    if (!validated.valid) {
      logger.warn(
        { topicId: topic._id.toString(), internalErrors: validated.internalErrors || validated.errors },
        'AI topic edit failed validation after retry'
      );
      return res.status(422).json({
        success: false,
        error: validated.errors?.[0] || 'AI output failed validation',
        code: 'TOPIC_MODIFY_INVALID',
        details: validated.errors
      });
    }

    const t = validated.topic;
    topic.title = t.title;
    topic.objective = t.objective || '';
    topic.syllabusAnchors = Array.isArray(t.syllabusAnchors) ? t.syllabusAnchors.slice(0, 12) : topic.syllabusAnchors;
    topic.modules = normalizeModules(t.modules);
    topic.changeNotes = `AI-modified: ${message.slice(0, 120)}`;
    topic.updatedBy = req.userId;
    await topic.save();

    res.json({
      success: true,
      data: { topic, ...(validated.warnings?.length ? { warnings: validated.warnings } : {}) }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

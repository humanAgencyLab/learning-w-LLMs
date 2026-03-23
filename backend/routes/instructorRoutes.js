const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseTopic = require('../models/CourseTopic');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleAuth');
const { requireCourseOwner, requireCourseTopicOwner } = require('../middleware/instructorOwnership');
const { extractTextFromFile } = require('../services/materialExtractionService');
const { buildCourseContext } = require('../services/courseContextService');
const { runTopicPlanGeneratorAgent } = require('../agents/topicPlanGeneratorAgent');
const { validateTopicPlanPayload } = require('../agents/validators/topicPlanValidator');
const logger = require('../utils/logger');

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

const courseUpload = multer({
  storage: courseFileStorage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

const router = express.Router();
router.use(requireAuth, requireRole('instructor'));

function normalizeModules(modules) {
  return (modules || []).map((m, i) => {
    const moduleId = m.moduleId && String(m.moduleId).trim()
      ? String(m.moduleId).trim()
      : `mod_${new mongoose.Types.ObjectId().toString()}_${i}`;
    const milestones = (m.milestones || []).map((ms) => ({ text: String(ms.text || '').trim() })).filter((ms) => ms.text);
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
      quizPattern: m.quizPattern && typeof m.quizPattern === 'object' ? m.quizPattern : {}
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
    if (planStrategy != null && typeof planStrategy === 'object') req.course.planStrategy = { ...req.course.planStrategy, ...planStrategy };
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

/** POST /v1/instructor/courses/:courseId/sources */
router.post('/courses/:courseId/sources', requireCourseOwner, courseUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file is required (field name: file)', code: 'VALIDATION_ERROR' });
    }
    const filePath = req.file.path;
    const mimeType = req.file.mimetype || 'application/octet-stream';
    let extractedText = '';
    let wordCount = 0;
    try {
      const ex = await extractTextFromFile(filePath, mimeType);
      extractedText = ex.text;
      wordCount = ex.wordCount;
    } catch (exErr) {
      logger.warn({ err: exErr.message, courseId: req.params.courseId }, 'Extraction failed; storing metadata only');
    }

    req.course.sources.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType,
      sizeBytes: req.file.size || 0,
      extractedText,
      wordCount,
      chunkCount: 0
    });
    await req.course.save();
    const src = req.course.sources[req.course.sources.length - 1];
    res.status(201).json({ success: true, data: { source: src } });
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
    const topicCount = req.body?.topicCount != null ? Number(req.body.topicCount) : undefined;
    const { contextText } = buildCourseContext(req.course);
    if (!contextText || contextText.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Upload sources or add global instructions before generating topics',
        code: 'INSUFFICIENT_CONTEXT'
      });
    }
    const raw = await runTopicPlanGeneratorAgent({
      contextText,
      planStrategy: req.course.planStrategy,
      topicCount
    });
    const validated = validateTopicPlanPayload(raw);
    if (!validated.valid) {
      return res.status(422).json({
        success: false,
        error: 'Generated plan failed validation',
        code: 'TOPIC_PLAN_INVALID',
        details: validated.errors
      });
    }
    const maxOrderDoc = await CourseTopic.findOne({ courseId: req.course._id }).sort({ orderIndex: -1 }).select('orderIndex').lean();
    let baseOrder = maxOrderDoc ? maxOrderDoc.orderIndex + 1 : 0;
    const created = [];
    for (let i = 0; i < validated.topics.length; i++) {
      const t = validated.topics[i];
      const mods = normalizeModules(t.modules);
      const topic = await CourseTopic.create({
        courseId: req.course._id,
        title: t.title,
        objective: t.objective || '',
        orderIndex: baseOrder + i,
        status: 'draft',
        modules: mods,
        updatedBy: req.userId,
        changeNotes: 'AI-generated draft'
      });
      created.push(topic);
    }
    res.status(201).json({ success: true, data: { topics: created } });
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
    const { title, objective, modules, orderIndex, changeNotes, status } = req.body || {};
    const topic = req.courseTopic;
    if (title != null) topic.title = String(title).trim();
    if (objective != null) topic.objective = String(objective).trim();
    if (typeof orderIndex === 'number') topic.orderIndex = orderIndex;
    if (changeNotes != null) topic.changeNotes = String(changeNotes).trim();
    if (modules != null) topic.modules = normalizeModules(modules);
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
    if (req.courseTopic.status !== 'draft') {
      return res.status(409).json({
        success: false,
        error: 'Only draft topics can be deleted',
        code: 'INVALID_DELETE'
      });
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

module.exports = router;

const mongoose = require('mongoose');
const { DIFFICULTY_TIERS, DEFAULT_DIFFICULTY } = require('../constants/difficulty');

const QuizPatternSchema = new mongoose.Schema({
  questionCount: { type: Number, default: 5, min: 3, max: 10 },
  questionTypes: [{
    type: { type: String, enum: ['conceptual', 'applied', 'recall', 'analytical'], required: true },
    weight: { type: Number, required: true, min: 0, max: 100 }
  }],
  difficultyMix: {
    easy: { type: Number, default: 30, min: 0, max: 100 },
    medium: { type: Number, default: 50, min: 0, max: 100 },
    hard: { type: Number, default: 20, min: 0, max: 100 }
  },
  cognitiveLevel: {
    type: String,
    // Revised Bloom's taxonomy (LLMs often return "evaluate" / "create")
    enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],
    default: 'understand'
  },
  constraints: { type: String, trim: true, maxlength: 1000, default: '' }
}, { _id: false });

const MilestoneSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true }
}, { _id: false });

const ModuleSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  difficulty: { type: String, enum: [...DIFFICULTY_TIERS], default: DEFAULT_DIFFICULTY },
  points: { type: Number, required: true, min: 0 },
  milestones: {
    type: [MilestoneSchema],
    validate: {
      validator: function (v) {
        return v.length >= 2 && v.length <= 8;
      },
      message: 'A module must have between 2 and 8 milestones'
    }
  },
  quizPattern: { type: QuizPatternSchema, default: () => ({}) }
}, { _id: false });

const CourseTopicSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
  objective: { type: String, trim: true, maxlength: 2000, default: '' },
  /** Short phrases tying the topic to instructor syllabus/source material (AI drafts). */
  syllabusAnchors: {
    type: [{ type: String, trim: true, maxlength: 400 }],
    validate: {
      validator: function (v) {
        return !Array.isArray(v) || v.length <= 12;
      },
      message: 'At most 12 syllabus anchor strings'
    }
  },
  orderIndex: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'approved', 'published', 'unpublished'],
    default: 'draft'
  },
  version: { type: Number, default: 1, min: 1 },
  modules: {
    type: [ModuleSchema],
    validate: {
      validator: function (v) {
        return v.length >= 1 && v.length <= 8;
      },
      message: 'A topic must have between 1 and 8 modules'
    }
  },
  changeNotes: { type: String, trim: true, maxlength: 1000, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null }
}, { timestamps: true });

CourseTopicSchema.index({ courseId: 1, orderIndex: 1 });
CourseTopicSchema.index({ courseId: 1, status: 1 });

CourseTopicSchema.methods.canTransitionTo = function (newStatus) {
  const allowed = {
    draft: ['approved'],
    approved: ['published', 'draft'],
    published: ['unpublished'],
    unpublished: ['published']
  };
  return (allowed[this.status] || []).includes(newStatus);
};

module.exports = mongoose.model('CourseTopic', CourseTopicSchema);

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Generate a unique access code for course enrollment.
 */
function generateAccessCode() {
  return crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
}

const CourseSchema = new mongoose.Schema({
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  accessCode: {
    type: String,
    unique: true,
    default: generateAccessCode
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },
  sources: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    extractedText: { type: String, default: '' },
    chunkCount: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    /** Primary syllabus drives topic coverage; reference = optional context for the agent. */
    role: {
      type: String,
      enum: ['syllabus', 'reference'],
      default: 'reference'
    },
    // --- Book ingestion (BOOK_GROUNDED_COURSES_PLAN.md; inert until the
    // USE_BOOK_SOURCES flag is on and an ingest run is triggered) ---
    ingestStatus: {
      type: String,
      enum: ['none', 'pending', 'extracting', 'structuring', 'embedding', 'ready', 'failed'],
      default: 'none'
    },
    ingestError: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    chapterCount: { type: Number, default: 0 },
    contentHash: { type: String, default: '' },
    /**
     * Chapter tree + per-chapter extractive summaries. For ready book sources
     * this map — a few thousand tokens — replaces extractedText in
     * buildCourseContext, so the plan generator sees the whole book's
     * skeleton instead of the first 56k characters.
     * chapters: [{ index, title, pageStart, pageEnd, sections: [String], summary }]
     */
    bookMap: { type: mongoose.Schema.Types.Mixed, default: null },
    /**
     * Ingestion report (plan Section 6): what was actually understood, shown
     * on the source card. { pagesRead, wordsExtracted, chaptersFound,
     * chunksIndexed, embeddedChunks, structureSource, caveats: [String],
     * skipped: [String], finishedAt }
     */
    ingestReport: { type: mongoose.Schema.Types.Mixed, default: null }
  }],
  globalInstructions: {
    type: String,
    trim: true,
    maxlength: 5000,
    default: ''
  },
  /**
   * Whether the last topic-plan generation ran on truncated context (the 56k
   * cap). Surfaced in the book coverage view — the instructor was previously
   * never told (book plan Section 7).
   */
  planContextTruncated: { type: Boolean, default: null },
  planStrategy: {
    type: {
      type: String,
      enum: ['week_based', 'module_based'],
      default: 'module_based'
    },
    topicCount: { type: Number, min: 1, max: 20, default: 4 },
    /** Optional ceiling for AI topic-plan target (≥ topicCount when set). */
    topicCountMax: { type: Number, min: 1, max: 20, required: false },
    weekCount: { type: Number, min: 1, max: 16, default: null },
    customNotes: { type: String, trim: true, maxlength: 2000, default: '' }
  },
  /** Persisted instructor chat for generate/modify flows (newest last). */
  instructorChat: [{
    _id: false,
    role: { type: String, enum: ['instructor', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    createdAt: { type: Date, default: Date.now },
    metadata: {
      kind: { type: String, enum: ['generate', 'modify'] },
      topicCount: { type: Number },
      _id: false
    }
  }],
  latestCoverageOverview: { type: String, trim: true, maxlength: 5000, default: '' }
}, { timestamps: true });

CourseSchema.index({ instructorId: 1, createdAt: -1 });
CourseSchema.index({ accessCode: 1 }, { unique: true });
CourseSchema.index({ status: 1 });

CourseSchema.pre('save', async function (next) {
  if (this.isNew && !this.accessCode) {
    this.accessCode = generateAccessCode();
  }
  next();
});

module.exports = mongoose.model('Course', CourseSchema);
module.exports.generateAccessCode = generateAccessCode;

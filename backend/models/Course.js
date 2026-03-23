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
    uploadedAt: { type: Date, default: Date.now }
  }],
  globalInstructions: {
    type: String,
    trim: true,
    maxlength: 5000,
    default: ''
  },
  planStrategy: {
    type: {
      type: String,
      enum: ['week_based', 'module_based'],
      default: 'module_based'
    },
    topicCount: { type: Number, min: 1, max: 20, default: 4 },
    weekCount: { type: Number, min: 1, max: 16, default: null },
    customNotes: { type: String, trim: true, maxlength: 2000, default: '' }
  }
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

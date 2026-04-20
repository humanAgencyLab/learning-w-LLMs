const mongoose = require('mongoose');

const EnrollmentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'dropped'],
    default: 'active'
  },
  priorKnowledge: {
    selfRating: {
      type: String,
      enum: ['none', 'beginner', 'intermediate', 'advanced'],
      default: 'none'
    },
    relevantExperience: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    specificGoals: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    // Persona-aligned fields (Phase 2). Mirror User.profile so instructor analytics can group.
    programmingExposure: {
      type: String,
      enum: ['none', 'some', 'lots', 'unknown'],
      default: 'unknown'
    },
    motivationType: {
      type: String,
      enum: ['grade', 'curiosity', 'career', 'requirement', 'unknown'],
      default: 'unknown'
    },
    selfConfidence: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    }
  }
}, {
  timestamps: true
});

EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', EnrollmentSchema);

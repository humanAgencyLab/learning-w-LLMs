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
    }
  }
}, {
  timestamps: true
});

EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', EnrollmentSchema);

const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudySession',
    required: true
  },
  stage: {
    type: Number,
    required: true,
    min: 1,
    max: 4
  },
  questions: [{
    question: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['mcq', 'short_answer'],
      required: true
    },
    options: [{
      type: String
    }],
    correctAnswer: {
      type: String,
      required: true
    },
    points: {
      type: Number,
      default: 1
    }
  }],
  answers: [{
    questionIndex: {
      type: Number,
      required: true
    },
    answer: {
      type: String,
      required: true
    },
    isCorrect: {
      type: Boolean,
      default: false
    },
    points: {
      type: Number,
      default: 0
    }
  }],
  score: {
    type: Number,
    default: 0
  },
  passed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Quiz', QuizSchema);
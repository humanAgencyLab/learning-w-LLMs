const mongoose = require('mongoose');

const QuizAttemptSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudySession',
    required: true
  },
  quizId: {
    type: String,
    required: true,
    unique: true
  },
  stage: {
    type: Number,
    required: true,
    min: 1,
    max: 4
  },
  topic: {
    type: String,
    required: false,
    default: 'General Learning'
  },
  questions: [{
    question: {
      type: String,
      required: true
    },
    options: [{
      type: String,
      required: true
    }],
    correctAnswer: {
      type: Number,
      required: true,
      min: 0
    },
    explanation: {
      type: String,
      required: false
    }
  }],
  answers: [{
    questionIndex: {
      type: Number,
      required: true
    },
    selectedAnswer: {
      type: Number,
      required: true
    },
    isCorrect: {
      type: Boolean,
      required: true
    }
  }],
  score: {
    type: Number,
    required: false,
    min: 0,
    max: 1
  },
  passed: {
    type: Boolean,
    required: false,
    default: false
  },
  feedback: {
    type: String,
    required: false
  },
  completedAt: {
    type: Date,
    required: false
  },
  timeSpent: {
    type: Number,
    required: false,
    default: 0 // in seconds
  }
}, { 
  timestamps: true 
});

// Index for efficient queries
QuizAttemptSchema.index({ sessionId: 1, createdAt: -1 });
QuizAttemptSchema.index({ quizId: 1 });

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
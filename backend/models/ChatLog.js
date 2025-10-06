const mongoose = require('mongoose');

const ChatLogSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudySession',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  isUser: {
    type: Boolean,
    required: true
  },
  type: {
    type: String,
    required: false,
    default: 'text'
  },
  topic: {
    type: String,
    required: false
  },
  stage: {
    type: Number,
    required: false,
    default: 1
  },
  aiModel: {
    type: String,
    required: false,
    default: 'gpt-4o-mini'
  },
  // SRL Fields
  phase: {
    type: String,
    enum: ['assessment', 'learning', 'quiz', 'feedback'],
    required: false,
    default: 'assessment'
  },
  moduleId: {
    type: String,
    required: false,
    default: null
  },
  stateDelta: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChatLog', ChatLogSchema);
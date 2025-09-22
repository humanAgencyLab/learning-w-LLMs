const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: false
  },
  sessionSummary: {
    type: String,
    required: false,
    default: ''
  },
  isComplete: {
    type: Boolean,
    required: true,
    default: false
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('StudySession', StudySessionSchema);
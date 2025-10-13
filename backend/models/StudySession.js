const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema({
  // SRL Core Fields
  topic: {
    type: String,
    required: false,
    default: 'General Learning'
  },
  goal: {
    type: String,
    required: false,
    default: ''
  },
  priorKnowledge: {
    type: String,
    required: false,
    default: ''
  },
  learningStyle: {
    type: String,
    enum: ['hands_on', 'theory', 'mixed'],
    required: false,
    default: 'mixed'
  },
  
  // Learning Plan
  plan: [{
    id: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['locked', 'in_progress', 'complete'],
      default: 'locked'
    },
    milestones: [{
      type: String
    }],
    completedMilestones: [{
      type: Number
    }]
  }],
  
  // Conversation Summary for Token Efficiency
  conversation_summary: {
    type: String,
    required: false,
    default: ''
  },
  lastSummaryUpdate: {
    type: Date,
    required: false
  },
  
  // Plan Locking - Once confirmed, plan cannot be changed during learning
  planLocked: {
    type: Boolean,
    required: false,
    default: false
  },
  
  // Current State
  currentModuleId: {
    type: String,
    required: false,
    default: null
  },
  
  // Progress Tracking
  progress: {
    overallPct: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    modulePct: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // History Tracking
  stageHistory: [{
    moduleId: {
      type: String,
      required: true
    },
    fromStatus: {
      type: String,
      enum: ['locked', 'in_progress', 'complete'],
      required: true
    },
    toStatus: {
      type: String,
      enum: ['locked', 'in_progress', 'complete'],
      required: true
    },
    at: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Assessment History
  assessmentHistory: [{
    q: {
      type: String,
      required: true
    },
    a: {
      type: String,
      required: true
    },
    at: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Quiz State
  quiz: {
    moduleId: {
      type: String,
      required: false,
      default: null
    },
    items: [{
      id: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['mcq', 'short'],
        required: true
      },
      stem: {
        type: String,
        required: true
      },
      choices: [{
        type: String
      }],
      answerKey: {
        type: String,
        required: false
      }
    }],
    submitted: {
      type: Boolean,
      default: false
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: false
    },
    passed: {
      type: Boolean,
      required: false
    }
  },
  
  // Legacy fields for backwards compatibility
  sessionSummary: {
    type: String,
    required: false,
    default: ''
  },
  notes: {
    type: String,
    required: false,
    default: ''
  },
  currentStage: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    max: 4
  },
  stageConfidence: {
    type: Number,
    required: false,
    min: 0,
    max: 1,
    default: 0.5
  },
  lastAssessmentAt: {
    type: Date,
    required: false
  },
  milestonesStatus: {
    type: Object,
    default: () => ({})
  },
  pendingQuizId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  eligibleForQuiz: {
    type: Boolean,
    default: false
  },
  milestones: {
    type: Object,
    default: () => ({
      1: { M1: 'locked', M2: 'locked' },
      2: { M1: 'locked', M2: 'locked' },
      3: { M1: 'locked', M2: 'locked' },
      4: { M1: 'locked', M2: 'locked' }
    })
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
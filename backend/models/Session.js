const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  // Core session fields
  phase: {
    type: String,
    enum: ['pre', 'assessing', 'planning', 'learning', 'quizzing', 'quiz', 'feedback', 'completed'],
    required: true,
    default: 'pre'
  },
  planApproved: {
    type: Boolean,
    required: false,
    default: false
  },
  clarifyCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 2
  },
  mode: {
    type: String,
    enum: ['studying', 'reviewing', 'testing'],
    required: true,
    default: 'studying'
  },
  topic: {
    type: String,
    required: true,
    default: 'General Learning'
  },
  chatTitle: {
    type: String,
    required: false,
    default: ''
  },
  
  // Learning plan (array of 4 modules)
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
      enum: ['locked', 'in_progress', 'passed'],
      default: 'locked'
    },
    milestones: [{
      text: {
        type: String,
        required: true
      },
      completed: {
        type: Boolean,
        required: true,
        default: false
      }
    }],
    completedMilestones: [{
      type: Number
    }],
    points: {
      type: Number,
      required: true,
      min: 0
    },
    difficulty: {
      type: String,
      enum: ['intro', 'core', 'apply', 'challenge'],
      default: 'core'
    }
  }],
  
  // Current state
  activeModuleId: {
    type: String,
    required: false,
    default: null
  },
  
  // Progress tracking
  points: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  gems: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  isViewOnly: {
    type: Boolean,
    required: true,
    default: false
  },
  isFavorite: {
    type: Boolean,
    required: false,
    default: false
  },
  progressPct: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Messages array
  messages: [{
    id: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      // Includes fields like: intent, phaseAtSend, etc.
      // intent: 'learning' | 'general' | 'admin'
      // phaseAtSend: 'pre' | 'assessing' | 'learning' | 'quizzing' | 'feedback' | 'completed'
    }
  }],
  
  // User profile (required in production)
  profile: {
    source: {
      type: String,
      enum: ['dummy', 'user'],
      required: true,
      default: 'dummy'
    },
    name: {
      type: String,
      required: true,
      minlength: 1
    },
    background: {
      type: String,
      required: true,
      minlength: 1
    },
    goals: [{
      type: String,
      required: true,
      minlength: 1
    }],
    strengths: [{
      type: String,
      required: true,
      minlength: 1
    }],
    gaps: [{
      type: String,
      required: true,
      minlength: 1
    }],
    timePerDayMins: {
      type: Number,
      required: true,
      min: 10,
      max: 480 // 8 hours max
    },
    preferredStyle: {
      type: String,
      enum: ['examples-first', 'theory-first', 'mixed'],
      required: true,
      default: 'examples-first'
    },
    lastUpdated: {
      type: Date,
      required: true,
      default: Date.now
    },
    // Enhanced profile fields (from onboarding flow)
    skillLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: false
    },
    learningType: {
      type: String,
      enum: ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'],
      required: false
    },
    major: {
      type: String,
      enum: ['Computer Science', 'Mathematics', 'Data Science', 'Engineering', 'Other'],
      required: false
    },
    currentCourses: [{
      type: String
    }],
    daysPerWeek: {
      type: Number,
      min: 1,
      max: 7
    },
    minutesPerSession: {
      type: Number,
      min: 10,
      max: 120
    },
    recentTopics: [{
      type: String
    }],
    selfRating: {
      type: String,
      enum: ['None', 'Basic', 'Intermediate', 'Advanced']
    },
    primaryGoal: {
      type: String,
      enum: ['Master Basics', 'Exam Prep', 'Revise Gaps', 'Project Help', 'Interview Prep']
    },
    defaultMode: {
      type: String,
      enum: ['Studying', 'Revision']
    },
    explanationLength: {
      type: String,
      enum: ['Concise', 'Balanced', 'Detailed']
    },
    examplesPreference: {
      type: String,
      enum: ['Few', 'Many']
    },
    language: {
      type: String,
      default: 'English'
    },
    codeLanguagePreference: {
      type: String,
      enum: ['Python', 'JavaScript', 'C++', 'None']
    }
  },
  
  // Quiz attempts
  quizAttempts: [{
    id: {
      type: String,
      required: true
    },
    moduleId: {
      type: String,
      required: function() {
        // moduleId is required for regular quizzes, optional for revision quizzes
        return !this.isRevision;
      }
    },
    attemptNo: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: ['draft', 'submitted'],
      required: true
    },
    items: [{
      id: {
        type: String,
        required: true
      },
      text: {
        type: String,
        required: true
      },
      options: [{
        type: String,
        required: true
      }],
      correctIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3
      }
    }],
    answers: [{
      id: {
        type: String,
        required: true
      },
      userIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3
      }
    }],
    scorePct: {
      type: Number,
      min: 0,
      max: 100
    },
    passed: {
      type: Boolean
    },
    pointsEarned: {
      type: Number,
      min: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    submittedAt: {
      type: Date
    },
    isRevision: {
      type: Boolean,
      default: false
    },
    revisionTopic: {
      type: String
    }
  }],
  
  // User reference (required - all sessions must belong to a user)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Chat cadence tracking
  meta: {
    countSinceLastCheck: {
      type: Number,
      default: 0,
      min: 0
    },
    outstandingCheck: {
      type: String,
      default: null
    },
    summaryVersion: {
      type: Number,
      default: 0,
      min: 0
    },
    summarizedUpToIndex: {
      type: Number,
      default: 0,
      min: 0
    },
    // Track assessment clarification attempts (resets when entering learning phase)
    assessClarifyCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 2
    },
    // Structured context summary (JSON string)
    contextSummary: {
      type: String,
      default: null
    },
    contextSummaryUpdated: {
      type: Date,
      default: null
    },
    // Milestone tracking
    currentMilestoneIndex: {
      type: Number,
      default: 0,
      min: 0
    },
    milestoneBeingTaught: {
      type: Boolean,
      default: false
    },
    milestoneRetryCount: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    milestonesToReview: {
      type: [Number],
      default: []
    }
  }
}, { 
  timestamps: true 
});

// Indexes for performance
SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ phase: 1 });
SessionSchema.index({ topic: 1 });

module.exports = mongoose.model('Session', SessionSchema);

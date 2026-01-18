const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: [/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  passwordHash: {
    type: String,
    required: true,
    select: false // Don't return password in queries by default
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  avatarUrl: {
    type: String,
    default: null // Will store URL/path to avatar image
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null,
    select: false
  },
  passwordResetToken: {
    type: String,
    default: null,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  preferences: {
    defaultModel: {
      type: String,
      enum: ['llama-3.1-8b', 'llama-3.1-70b', 'mixtral-8x7b'],
      default: 'llama-3.1-8b'
    },
    explanationLength: {
      type: String,
      enum: ['concise', 'balanced', 'detailed'],
      default: 'balanced'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    fontSize: {
      type: Number,
      min: 10,
      max: 50,
      default: 16
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  profile: {
    source: {
      type: String,
      enum: ['user'],
      default: 'user'
    },
    mobile: {
      type: String,
      default: '',
      trim: true
    },
    background: {
      type: String,
      default: ''
    },
    goals: [{
      type: String
    }],
    strengths: [{
      type: String
    }],
    gaps: [{
      type: String
    }],
    timePerDayMins: {
      type: Number,
      min: 10,
      max: 480,
      default: 30
    },
    preferredStyle: {
      type: String,
      enum: ['examples-first', 'theory-first', 'mixed'],
      default: 'mixed'
    },
    // Enhanced fields from onboarding
    skillLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      default: 'Beginner'
    },
    learningType: {
      type: String,
      enum: ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'],
      default: 'Visual'
    },
    major: {
      type: String,
      default: ''
    },
    currentCourses: [{
      type: String
    }],
    daysPerWeek: {
      type: Number,
      min: 1,
      max: 7,
      default: 3
    },
    minutesPerSession: {
      type: Number,
      min: 5,
      default: 30
    },
    recentTopics: [{
      type: String
    }],
    selfRating: {
      type: String,
      default: ''
    },
    primaryGoal: {
      type: String,
      default: ''
    },
    defaultMode: {
      type: String,
      enum: ['Studying', 'Revision'],
      default: 'Studying'
    },
    explanationLength: {
      type: String,
      enum: ['Concise', 'Balanced', 'Detailed'],
      default: 'Balanced'
    },
    examplesPreference: {
      type: String,
      enum: ['None', 'Few', 'Many'],
      default: 'Many'
    },
    language: {
      type: String,
      default: 'English'
    },
    onboardingCompleted: {
      type: Boolean,
      default: false
    }
  },
  certificates: [{
    certificateId: {
      type: String,
      required: true
    },
    topic: {
      type: String,
      required: true
    },
    sessionId: {
      type: String,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  }],
  stats: {
    pointsTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    gemsTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    trophiesTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    sessionsCompleted: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Indexes
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ emailVerificationToken: 1 }, { sparse: true });
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });
// Note: certificateId uniqueness is handled at application level, not via index
// to avoid issues with null values in the certificates array

// Method to get user without sensitive fields
UserSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.passwordHash;
  delete userObject.emailVerificationToken;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  return userObject;
};

// Method to update last login
UserSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

module.exports = mongoose.model('User', UserSchema);








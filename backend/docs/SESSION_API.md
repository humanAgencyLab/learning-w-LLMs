# Session API Documentation

## Overview

The Session API provides endpoints for managing learning sessions with comprehensive data persistence, validation, and logging.

## Profile Management (Phase 2)

**Important:** Until user onboarding exists, the server automatically injects a realistic dummy profile for all new sessions. This dummy profile is designed to be authoritative for Assessment logic and includes:

- **Source**: Always `'dummy'` for Phase 2
- **Realistic Data**: CS student background with specific goals, strengths, and gaps
- **Assessment-Ready**: Contains all fields needed for learning assessment
- **Consistent**: Same dummy profile used across all sessions

The dummy profile ensures that Assessment logic can immediately begin working with meaningful user context without requiring user input. Assessment may ask up to 2 clarifying questions if the profile seems insufficient for the specific topic.

## Endpoints

### POST /v1/assessment

Creates a personalized learning plan based on user profile and request.

**Request Body:**
```json
{
  "sessionId": "session-object-id",
  "userMessage": "I want to learn JavaScript programming",
  "mode": "studying",
  "profile": {
    "source": "user",
    "name": "John Doe",
    "background": "Frontend developer with 2 years experience",
    "goals": ["Master React", "Learn Node.js backend development"],
    "strengths": ["HTML/CSS", "JavaScript basics", "React components"],
    "gaps": ["Node.js", "Database design", "API development"],
    "timePerDayMins": 60,
    "preferredStyle": "theory-first",
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response - Plan Generated (200):**
```json
{
  "success": true,
  "data": {
    "topic": "JavaScript Fundamentals",
    "chatTitle": "Learn JS from Scratch",
    "plan": [
      {
        "moduleId": "1",
        "title": "Variables and Data Types",
        "points": 30,
        "difficulty": "intro"
      },
      {
        "moduleId": "2", 
        "title": "Functions and Scope",
        "points": 40,
        "difficulty": "core"
      },
      {
        "moduleId": "3",
        "title": "Objects and Arrays", 
        "points": 30,
        "difficulty": "apply"
      }
    ],
    "nextPhase": "learning"
  }
}
```

**Response - Clarifying Questions (200):**
```json
{
  "success": true,
  "clarify": true,
  "questions": [
    "What specific aspect of programming do you want to focus on?",
    "Are you more interested in web development or data science?"
  ]
}
```

**Key Features:**
- **Profile-First Logic**: Uses session profile to tailor the learning plan
- **Dynamic Modules**: 2-8 modules with points summing to exactly 100
- **Clarifying Questions**: Up to 2 questions for vague topics before plan generation
- **Strict JSON**: Robust parsing with retry logic for malformed responses
- **State Machine**: Only allows assessment in 'pre' or 'assessing' phases
- **Atomic Updates**: Session updates are atomic and idempotent

**Validation Rules:**
- Module titles must be content-specific (not "Module 1", "Part 2", etc.)
- Points must sum to exactly 100 across all modules
- No single module can exceed 60 points
- Module IDs must be sequential strings starting from "1"
- Topic and chatTitle cannot contain emojis or markdown

**Error Responses:**
- **400**: Invalid input, missing profile, or validation failed
- **404**: Session not found
- **409**: Illegal phase transition (e.g., calling from 'learning' phase)
- **502**: Assessment service unavailable or JSON parsing failed

### POST /v1/sessions

Creates a new learning session.

**Request Body:**
```json
{
  "topic": "JavaScript Programming",
  "chatTitle": "Learning JS Basics",
  "phase": "pre",
  "mode": "studying",
  "profile": {
    "source": "user",
    "name": "John Doe",
    "background": "Frontend developer with 2 years experience",
    "goals": ["Master React", "Learn Node.js backend development"],
    "strengths": ["HTML/CSS", "JavaScript basics", "React components"],
    "gaps": ["Node.js", "Database design", "API development"],
    "timePerDayMins": 60,
    "preferredStyle": "theory-first",
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  },
  "userId": "optional-user-id"
}
```

**Note:** If no profile is provided, the server will automatically inject a realistic dummy profile with `source: 'dummy'`. Until onboarding exists, this dummy profile is authoritative for Assessment logic.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "session-id",
    "phase": "pre",
    "mode": "studying",
    "topic": "JavaScript Programming",
    "chatTitle": "Learning JS Basics",
    "plan": [],
    "activeModuleId": null,
    "points": 0,
    "gems": 0,
    "isViewOnly": false,
    "progressPct": 0,
    "profile": {
      "source": "dummy",
      "name": "Alex",
      "background": "2nd-year CS undergrad",
      "goals": ["Pass Algorithms midterm", "Understand graph traversal well enough to explain it"],
      "strengths": ["arrays", "big-O basics", "sorting fundamentals"],
      "gaps": ["graph traversal", "BFS vs DFS tradeoffs", "recurrence intuition"],
      "timePerDayMins": 30,
      "preferredStyle": "examples-first",
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### GET /v1/sessions/:id

Fetches a complete session by ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "session-id",
    "phase": "learning",
    "mode": "studying",
    "topic": "JavaScript Programming",
    "chatTitle": "Learning JS Basics",
    "plan": [...],
    "activeModuleId": "m1",
    "points": 100,
    "gems": 50,
    "isViewOnly": false,
    "progressPct": 25,
    "messages": [...],
    "profile": {...},
    "quizAttempts": [...],
    "userId": "user-id",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### POST /v1/sessions/:id/resume

Returns a minimal hydrate payload for resuming a session.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "phase": "learning",
    "mode": "studying",
    "topic": "JavaScript Programming",
    "chatTitle": "Learning JS Basics",
    "plan": [...],
    "activeModuleId": "m1",
    "points": 100,
    "gems": 50,
    "isViewOnly": false,
    "progressPct": 25,
    "lastMessages": [...], // Last 20 messages only
    "profile": {...}
  }
}
```

## Data Models

### Session Schema

```javascript
{
  phase: String, // 'pre', 'planning', 'learning', 'quiz', 'feedback', 'completed'
  mode: String, // 'studying', 'reviewing', 'testing'
  topic: String,
  chatTitle: String,
  plan: [{
    id: String,
    title: String,
    description: String,
    status: String, // 'locked', 'in_progress', 'complete'
    milestones: [String],
    completedMilestones: [Number]
  }],
  activeModuleId: String,
  points: Number,
  gems: Number,
  isViewOnly: Boolean,
  progressPct: Number, // 0-100
  messages: [{
    id: String,
    role: String, // 'user', 'assistant'
    content: String,
    timestamp: Date,
    metadata: Object
  }],
  profile: {
    source: String, // 'dummy', 'user'
    name: String,
    background: String,
    goals: [String],
    strengths: [String],
    gaps: [String],
    timePerDayMins: Number, // 10-480 minutes
    preferredStyle: String, // 'examples-first', 'theory-first', 'mixed'
    lastUpdated: Date
  },
  quizAttempts: [{
    id: String,
    moduleId: String,
    questions: [...],
    score: Number,
    passed: Boolean,
    completedAt: Date
  }],
  userId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## Validation

All inputs are validated using Zod schemas:

- **Topic**: 1-200 characters
- **Chat Title**: Max 200 characters
- **Phase**: Must be one of the enum values
- **Mode**: Must be one of the enum values
- **Profile**: 
  - `source`: Must be 'dummy' or 'user'
  - `name`: 1-100 characters, required
  - `background`: 1-500 characters, required
  - `goals`: Array of 1+ strings, each 1-200 characters
  - `strengths`: Array of 1+ strings, each 1-200 characters
  - `gaps`: Array of 1+ strings, each 1-200 characters
  - `timePerDayMins`: 10-480 minutes
  - `preferredStyle`: Must be one of the enum values
- **Session ID**: Must be valid MongoDB ObjectId format

## Error Handling

- **400**: Invalid input data or malformed session ID
- **404**: Session not found
- **500**: Internal server error

All errors include structured response format:
```json
{
  "success": false,
  "error": "Error message",
  "details": [...] // For validation errors
}
```

## Logging

Uses Pino logger with request IDs for structured logging:

```javascript
{
  "level": "info",
  "time": "2024-01-01T00:00:00.000Z",
  "requestId": "uuid",
  "msg": "Session created successfully",
  "sessionId": "session-id",
  "duration": 150
}
```

## Testing

Run tests with:
```bash
npm test
npm run test:watch
npm run test:coverage
```

Or use the test runner script:
```bash
./run-tests.sh
```

## Dependencies

- **mongoose**: MongoDB ODM
- **zod**: Schema validation
- **pino**: Structured logging
- **express**: Web framework
- **supertest**: HTTP testing
- **jest**: Test framework

# 🎓 Study Assist - Project Onboarding Guide

## What Is This Project?

**Study Assist** is an intelligent, LLM-powered learning platform that provides personalized, adaptive teaching through chat-based interactions. The system uses Self-Regulated Learning (SRL) principles to guide students through structured learning paths with milestones, assessments, and quizzes.

### Core Purpose
- **Personalized Learning**: AI tutor adapts to each student's learning style, background, and goals
- **Structured Progression**: Students follow a milestone-based learning path (modules → milestones → quizzes)
- **Interactive Teaching**: Chat-based interface for natural, conversational learning
- **Progress Tracking**: Real-time progress updates, points, gems, and trophies

---

## 🏗️ Architecture Overview

### Tech Stack

**Frontend:**
- React 18 with Create React App
- Zustand for state management
- Tailwind CSS for styling
- React Router for navigation

**Backend:**
- Node.js + Express.js
- MongoDB (Mongoose) for data persistence
- Groq API (Llama models) for LLM interactions
- JWT for authentication (planned)

**Key Libraries:**
- `groq-sdk`: Groq API client
- `mongoose`: MongoDB ODM
- `zod`: Schema validation
- `helmet`: Security headers
- `express-rate-limit`: Rate limiting

---

## 📁 Project Structure

```
learning-w-LLMs/
├── backend/                    # Express.js backend API
│   ├── models/                 # MongoDB schemas (Session, Quiz, etc.)
│   ├── routes/                 # API route handlers
│   │   ├── chatRoutes.js       # Main chat interaction endpoint
│   │   ├── assessmentRoutes.js # Assessment phase handling
│   │   ├── quizRoutes.js       # Quiz generation and submission
│   │   ├── sessionRoutes.js    # Session management
│   │   └── healthRoutes.js     # Health checks
│   ├── middleware/             # Request processing middleware
│   │   ├── contextControl.js  # Conversation context management
│   │   ├── validationHardening.js # Input validation & sanitization
│   │   ├── rateLimiter.js     # Rate limiting
│   │   └── logging.js         # Request/error logging
│   ├── prompts/               # LLM prompt templates
│   │   ├── systemPrompt.js    # Main SRL system prompt
│   │   ├── teacher_prompt.js  # Teaching content generation
│   │   ├── conversation_manager.js # Conversation flow decisions
│   │   ├── assessment_analyzer.js # Answer assessment
│   │   └── srl_assessment_prompt.js # Initial assessment
│   ├── services/              # Business logic
│   │   └── progressService.js # Progress calculation
│   ├── utils/                 # Utility functions
│   │   ├── apiRetry.js        # API retry logic
│   │   └── responseValidator.js # Response validation
│   ├── validation/            # Input validation schemas
│   ├── server.js             # Server entry point
│   └── app.js                # Express app configuration
│
├── frontend/my-app/          # React frontend
│   ├── src/
│   │   ├── Pages/            # Main page components
│   │   │   ├── ChatInterface.jsx # Main chat UI
│   │   │   ├── LandingPage.jsx
│   │   │   └── ...
│   │   ├── components/        # Reusable components
│   │   │   ├── ModuleProgressPanel.jsx # Right sidebar progress
│   │   │   ├── QuizModal.jsx
│   │   │   └── ...
│   │   ├── state/            # Zustand stores
│   │   │   └── sessionStore.js # Session state management
│   │   ├── lib/              # API clients
│   │   │   ├── chatApi.js    # Chat API calls
│   │   │   └── assessmentApi.js # Assessment API calls
│   │   └── App.js            # Root component
│   └── public/               # Static assets
│
└── docs/                     # Documentation
    ├── TEACHING_SYSTEM_DOCUMENTATION.md
    ├── TEACHING_SYSTEM_QUICK_REFERENCE.md
    └── Production_Readiness_Roadmap.md
```

---

## 🔄 Learning Flow (SRL System)

The system follows a **Self-Regulated Learning (SRL)** flow with distinct phases:

### Phase 1: Pre-Assessment (`pre`)
- User starts a new session
- System greets and asks initial question
- Determines learning intent

### Phase 2: Assessment (`assessing`)
- System asks 1-3 focused questions
- Gathers: topic, goals, prior knowledge, learning style
- When sufficient info OR user says "go ahead" → creates plan

### Phase 3: Planning (`planning`)
- System generates a complete learning plan:
  - **3-6 modules** (e.g., "Introduction to Python", "Data Structures", "Functions")
  - Each module has **3-6 milestones** (e.g., "Install Python", "Write Hello World")
  - Each module has **points** (typically 100 points total, split across modules)
- Plan displayed in chat with clear structure
- User can approve, modify, or request changes
- When approved → moves to learning phase

### Phase 4: Learning (`learning`) ⭐ **CORE TEACHING PHASE**
- System teaches **one milestone at a time**
- Each teaching response follows **uniform structure**:
  1. **Introduction/Acknowledgment** (1-3 sentences)
     - First milestone: "On Module X (Title), we will cover [summary]. Let's start with [milestone]."
     - Other milestones: "That's correct! You've completed: [milestone]. Now let's move on to: [next milestone]."
  2. **Teaching Content** (150-200 words, MANDATORY)
     - Explanations, examples, code snippets, key concepts
     - Same depth for all milestones
     - Must teach completely - cannot skip or announce without teaching
  3. **Assessment Question** (EXACTLY ONE, ending with ?)
     - About the milestone topic just taught
     - Can be any format (free-text, multiple-choice concept, etc.)
- Student answers question
- System analyzes answer using LLM (no keyword matching)
- **Four assessment scenarios:**
  - **Scenario A**: Correct + milestone complete → Move to next milestone
  - **Scenario B**: Correct but needs clarification → Provide deeper explanation
  - **Scenario C**: Incorrect (first time) → Re-explain topic differently
  - **Scenario D**: Incorrect (second time) → Brief explanation, then move forward
- Milestones progress **sequentially** (0 → 1 → 2 → ...)
- Progress updates: `completedMilestones[]` array, `progressPct`, `points`, `gems`
- When ALL milestones in module complete → moves to quiz phase

### Phase 5: Quiz (`quiz` or `quizzing`)
- System generates 3-7 questions (mostly MCQ + 1-2 short-answer)
- Questions test understanding of module content
- User submits answers
- System grades with AI or rubric
- **≥70% to pass**
- **On PASS**: Module marked complete, next module unlocked, return to learning
- **On FAIL**: Move to feedback phase

### Phase 6: Feedback (`feedback`)
- System provides targeted review of missed concepts
- Brief, actionable feedback (1-3 fixes)
- Short micro-exercise
- Return to learning phase (re-quiz or continue)

### Phase 7: Completed (`completed`)
- All modules completed
- Trophy unlocked
- Summary of learning journey

---

## 🎯 Key Features

### 1. **Milestone-Based Learning**
- Each module has 3-6 concrete milestones
- Milestones are sequential (cannot skip)
- Progress tracked via `completedMilestones[]` array
- UI shows checkmarks for completed milestones

### 2. **Uniform Teaching Structure**
- **All milestones follow same structure**:
  - 150-200 words teaching content
  - Exactly ONE assessment question
- Only difference: First milestone uses "Introduction", others use "Acknowledgment + Transition"

### 3. **LLM-Based Decision Making**
- **No hardcoded keywords** - all decisions use LLM natural language understanding
- Conversation manager decides: intent, phase transitions, milestone progression
- Assessment analyzer determines: understanding level, recommendations
- Teacher prompt generates: teaching content, assessment questions

### 4. **Progress Tracking**
- **Progress percentage**: `(completedMilestones / totalMilestones) * 100`
- **Points**: Based on module progress and module points
- **Gems**: `points / 20` (floor)
- **Trophies**: Unlocked when points = 100 & all modules complete

### 5. **Token Optimization**
- **Conversation windowing**: Last 6-8 turns + summary
- **Context summarization**: Replaces full history with structured summary (50-70% reduction)
- **Adaptive max_tokens**: 256 (assess) → 600 (learning) → 180 (quiz)
- **Result**: 60-80% token reduction without quality loss

### 6. **Security & Reliability**
- Rate limiting (60 requests/minute per IP)
- Input validation & sanitization
- HTML stripping, entity decoding
- API retry logic with exponential backoff
- Error handling without information leakage

---

## 🔑 Key Concepts

### Session Model (`backend/models/Session.js`)
The core data structure that tracks all learning state:

```javascript
{
  phase: 'pre' | 'assessing' | 'planning' | 'learning' | 'quiz' | 'feedback' | 'completed',
  topic: String,
  plan: [{
    id: String,
    title: String,
    description: String,
    status: 'locked' | 'in_progress' | 'passed',
    milestones: [{ text: String, completed: Boolean }],
    completedMilestones: [Number],  // Array of milestone indices
    points: Number
  }],
  activeModuleId: String,
  progressPct: Number,
  points: Number,
  gems: Number,
  messages: [{ role: 'user' | 'assistant', content: String }],
  profile: { /* Student profile data */ },
  meta: {
    currentMilestoneIndex: Number,
    milestoneBeingTaught: Boolean,
    outstandingCheck: String,  // Previous assessment question
    contextSummary: String,    // Structured context summary
    // ... other metadata
  }
}
```

### Teaching System Components

1. **`chatRoutes.js`**: Main chat endpoint (`POST /v1/chat`)
   - Handles user messages
   - Orchestrates teaching flow
   - Manages milestone progression
   - Calculates progress

2. **`teacher_prompt.js`**: Generates teaching content
   - Builds prompts based on scenario (A, B, C, D, or first teaching)
   - Enforces uniform structure (150-200 words, one question)
   - Adapts to student profile and learning style

3. **`conversation_manager.js`**: LLM-based decision making
   - Analyzes user intent
   - Determines phase transitions
   - Detects follow-ups to assessment questions
   - No hardcoded keywords - pure natural language understanding

4. **`assessment_analyzer.js`**: Analyzes student answers
   - Determines understanding level
   - Provides recommendations (move_forward, clarify_again, retry)
   - Handles "i don't know" appropriately

### API Endpoints

**Main Endpoints:**
- `POST /v1/chat` - Main chat interaction
- `POST /v1/assessment/start` - Start assessment phase
- `POST /v1/assessment/answer` - Answer assessment questions
- `POST /v1/assessment/approve` - Approve learning plan
- `POST /v1/quiz/generate` - Generate quiz for module
- `POST /v1/quiz/submit` - Submit quiz answers
- `GET /v1/session/state` - Get canonical session state
- `GET /v1/health` - Health check

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Groq API key (or OpenAI API key)

### Setup

1. **Clone repository**
```bash
cd learning-w-LLMs
```

2. **Backend setup**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys and MongoDB URI
npm start
# Server runs on http://localhost:5001
```

3. **Frontend setup**
```bash
cd frontend/my-app
npm install
npm start
# App runs on http://localhost:3000
```

### Environment Variables

**Backend (`.env`):**
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/studyassist
CORS_ORIGINS=http://localhost:3000
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
GROQ_API_KEY=your_groq_api_key_here
```

**Frontend (optional, uses proxy by default):**
```env
REACT_APP_API_BASE_URL=
```

---

## 📊 Current Status

### Test Coverage
- **94/120 tests passing (78.3%)**
- Assessment routes: **100% passing (16/16)** ✅
- Phase guards: Complete ✅
- Quiz intent: Fixed ✅
- Validation hardening: Mostly fixed (2/3 tests passing)

### Remaining Work
- 26 failing tests (validation, context control, rate limiting)
- See `PR_READY.md` and `FAILING_TESTS_BREAKDOWN.md` for details

### Branch Status
- **Current branch**: `feature/srl-assessment-router`
- **Target**: `ui-redesign`
- **Status**: PR ready (94/120 passing)

---

## 🧪 Testing

### Run Tests
```bash
cd backend
npm test
```

### Test Files
- `tests/assessmentRoutes.test.js` - Assessment endpoint tests
- `tests/chatRoutes.test.js` - Chat endpoint tests
- `tests/quizRoutes.test.js` - Quiz endpoint tests
- `tests/contextControl.test.js` - Context management tests
- `tests/validationHardening.test.js` - Input validation tests

### Manual Testing
```bash
# Test assessment flow
node backend/test_assessment_fixes.js

# Test teaching flow
node backend/test_teaching_flow.js
```

---

## 📚 Key Documentation

1. **`README.md`** - Project overview and quick start
2. **`docs/TEACHING_SYSTEM_DOCUMENTATION.md`** - Complete teaching system documentation
3. **`docs/TEACHING_SYSTEM_QUICK_REFERENCE.md`** - Quick reference for teaching system
4. **`QUICK_START.md`** - Quality-first SRL system quick start
5. **`PR_READY.md`** - Current PR status and test results

---

## 🎓 Learning the Codebase

### Recommended Reading Order

1. **Start Here**: `README.md` - Get basic understanding
2. **Architecture**: `backend/app.js` and `backend/server.js` - Understand server setup
3. **Data Model**: `backend/models/Session.js` - Understand session structure
4. **Core Flow**: `backend/routes/chatRoutes.js` - See how chat works
5. **Teaching Logic**: `backend/prompts/teacher_prompt.js` - See how teaching content is generated
6. **Frontend**: `frontend/my-app/src/Pages/ChatInterface.jsx` - See UI implementation
7. **Deep Dive**: `docs/TEACHING_SYSTEM_DOCUMENTATION.md` - Complete system documentation

### Key Files to Understand

**Backend:**
- `backend/routes/chatRoutes.js` - Main chat logic (1092 lines)
- `backend/prompts/teacher_prompt.js` - Teaching content generation (568 lines)
- `backend/prompts/conversation_manager.js` - Conversation flow decisions (176 lines)
- `backend/models/Session.js` - Session schema (403 lines)

**Frontend:**
- `frontend/my-app/src/Pages/ChatInterface.jsx` - Main chat UI
- `frontend/my-app/src/state/sessionStore.js` - Session state management
- `frontend/my-app/src/components/ModuleProgressPanel.jsx` - Right sidebar progress

---

## 🔍 Common Tasks

### Adding a New Feature
1. Update `Session` model if needed
2. Add route handler in `routes/`
3. Add validation in `validation/`
4. Update frontend state/store
5. Add tests

### Debugging Issues
1. Check backend logs (terminal or `logs/app.log`)
2. Check browser console for frontend errors
3. Verify session state: `GET /v1/session/state?sessionId=<id>`
4. Check test coverage: `npm test`

### Understanding the Flow
1. Read `docs/TEACHING_SYSTEM_DOCUMENTATION.md`
2. Trace through `chatRoutes.js` with a test message
3. Check `conversation_manager.js` to see decision logic
4. Review `teacher_prompt.js` to see teaching generation

---

## 🎯 Key Design Principles

1. **Uniform Structure**: All milestones follow same structure (150-200 words, one question)
2. **LLM-Based Decisions**: No hardcoded keywords - all decisions use natural language understanding
3. **Sequential Progression**: Milestones must progress sequentially (no skipping)
4. **Quality-First**: Rich teaching content (250-400 words) during learning phase
5. **Token Efficiency**: 60-80% token reduction via context summarization and windowing
6. **No JSON Leakage**: Strict `state` block extraction and stripping
7. **Progress Accuracy**: Recalculate progress after each milestone completion

---

## 🚨 Important Notes

### Critical Rules
- **EXACTLY ONE** assessment question per response (no multiple questions)
- **150-200 words** teaching content (same for all milestones)
- **Sequential milestone progression** (0 → 1 → 2 → ...)
- **No hardcoded keywords** - all decisions via LLM
- **Clear outstanding question** when milestone completes

### Common Pitfalls
- ❌ Asking multiple questions
- ❌ Skipping milestones
- ❌ Teaching multiple topics in one response
- ❌ Using keyword-based detection
- ❌ Variable word counts
- ❌ Redundant questions

---

## 🤝 Contributing

1. Read `docs/TEACHING_SYSTEM_DOCUMENTATION.md`
2. Follow the uniform structure rules
3. Write tests for new features
4. Update documentation
5. Check test coverage before PR

---

## 📞 Getting Help

1. Check `docs/TEACHING_SYSTEM_DOCUMENTATION.md` for detailed information
2. Review `docs/TEACHING_SYSTEM_QUICK_REFERENCE.md` for quick answers
3. Check test files for examples
4. Review `PR_READY.md` for current status
5. Check `FAILING_TESTS_BREAKDOWN.md` for known issues

---

**Last Updated**: 2024
**Version**: 1.0
**Maintainer**: Study Assist Team







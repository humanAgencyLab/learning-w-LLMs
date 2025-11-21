# 🏗️ Study Assist - Architecture Summary

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ChatInterface.jsx (Main UI)                               │  │
│  │  ├── ModuleProgressPanel (Right Sidebar)                   │  │
│  │  ├── QuizModal (Quiz Display)                              │  │
│  │  └── MessageList (Chat Messages)                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  sessionStore.js (Zustand State Management)                │  │
│  │  ├── sessionId, phase, plan, messages                     │  │
│  │  ├── progressPct, points, gems                            │  │
│  │  └── sendChatMessage(), approvePlan(), etc.                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Routes (API Endpoints)                                   │  │
│  │  ├── /v1/chat (chatRoutes.js)                             │  │
│  │  ├── /v1/assessment/* (assessmentRoutes.js)               │  │
│  │  ├── /v1/quiz/* (quizRoutes.js)                            │  │
│  │  └── /v1/session/* (sessionRoutes.js)                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Middleware                                                │  │
│  │  ├── validationHardening.js (Input validation)            │  │
│  │  ├── contextControl.js (Context management)               │  │
│  │  ├── rateLimiter.js (Rate limiting)                       │  │
│  │  └── logging.js (Request/error logging)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Prompts (LLM Prompt Templates)                           │  │
│  │  ├── teacher_prompt.js (Teaching content generation)       │  │
│  │  ├── conversation_manager.js (Flow decisions)             │  │
│  │  ├── assessment_analyzer.js (Answer assessment)           │  │
│  │  └── srl_assessment_prompt.js (Initial assessment)       │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Services                                                   │  │
│  │  └── progressService.js (Progress calculation)             │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Utils                                                      │  │
│  │  ├── apiRetry.js (Retry logic)                             │  │
│  │  └── responseValidator.js (Response validation)            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Mongoose ODM
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      MongoDB Database                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Sessions Collection                                      │  │
│  │  ├── phase, topic, plan, messages                         │  │
│  │  ├── progressPct, points, gems                            │  │
│  │  └── meta (currentMilestoneIndex, etc.)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      External APIs                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Groq API (Llama Models)                                  │  │
│  │  ├── Teaching content generation                          │  │
│  │  ├── Conversation flow decisions                           │  │
│  │  ├── Answer assessment                                     │  │
│  │  └── Quiz generation                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Learning Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      LEARNING FLOW (SRL)                         │
└─────────────────────────────────────────────────────────────────┘

  1. PRE-ASSESSMENT (pre)
     │
     │ User: "I want to learn Python"
     │
     ▼
     
  2. ASSESSMENT (assessing)
     │
     │ System asks 1-3 focused questions:
     │ - "What's your goal?"
     │ - "What's your prior knowledge?"
     │ - "What's your learning style?"
     │
     │ User: "I want to build web apps, I know JavaScript, examples-first"
     │
     ▼
     
  3. PLANNING (planning)
     │
     │ System generates plan:
     │ Module 1: "Introduction to Python" (100 points)
     │   ├── Milestone 1: "Install Python"
     │   ├── Milestone 2: "Write Hello World"
     │   └── Milestone 3: "Variables and Types"
     │ Module 2: "Data Structures" (100 points)
     │   └── ...
     │
     │ User: "Sounds good, let's start"
     │
     ▼
     
  4. LEARNING (learning) ⭐ CORE PHASE
     │
     │ ┌─────────────────────────────────────────────────────┐
     │ │ Milestone 1: "Install Python"                        │
     │ │                                                      │
     │ │ 1. Introduction: "On Module 1, we'll cover..."      │
     │ │ 2. Teaching (150-200 words): Step-by-step install    │
     │ │ 3. Assessment Question: "What command shows version?"│
     │ └─────────────────────────────────────────────────────┘
     │
     │ User: "python --version"
     │
     │ System analyzes answer (LLM-based)
     │
     │ ├─ Correct → Move to Milestone 2
     │ ├─ Correct but unclear → Clarify (Scenario B)
     │ ├─ Incorrect (1st) → Re-explain (Scenario C)
     │ └─ Incorrect (2nd) → Brief explanation, move forward (Scenario D)
     │
     │ Progress: completedMilestones = [0], progressPct = 33%
     │
     │ ┌─────────────────────────────────────────────────────┐
     │ │ Milestone 2: "Write Hello World"                    │
     │ │                                                      │
     │ │ 1. Acknowledgment: "That's correct! You've completed │
     │ │    Milestone 1. Now let's move on to..."           │
     │ │ 2. Teaching (150-200 words): Python basics          │
     │ │ 3. Assessment Question: "Write a Hello World program"│
     │ └─────────────────────────────────────────────────────┘
     │
     │ ... (continues until all milestones in module complete)
     │
     │ All milestones complete → Quiz Phase
     │
     ▼
     
  5. QUIZ (quiz)
     │
     │ System generates 3-7 questions:
     │ - Multiple choice questions
     │ - Short answer questions
     │
     │ User submits answers
     │
     │ System grades (≥70% to pass)
     │
     │ ├─ PASS (≥70%) → Module marked complete, unlock next
     │ └─ FAIL (<70%) → Feedback Phase
     │
     ▼
     
  6. FEEDBACK (feedback) [if quiz failed]
     │
     │ System provides targeted review:
     │ - 1-3 specific fixes
     │ - Short micro-exercise
     │
     │ → Return to Learning Phase
     │
     ▼
     
  7. COMPLETED (completed)
     │
     │ All modules complete
     │ Trophy unlocked
     │ Summary of learning journey
     │
     └─────────────────────────────────────────────────────┘
```

---

## Data Flow: Chat Request

```
User types message in ChatInterface
    │
    ▼
sessionStore.sendChatMessage()
    │
    ▼
POST /v1/chat
    │
    ├─→ validationHardening.js (Input validation)
    │
    ├─→ rateLimiter.js (Rate limiting check)
    │
    ├─→ contextControl.js (Context management)
    │
    ├─→ Load Session from MongoDB
    │
    ├─→ conversation_manager.js (LLM decides intent/flow)
    │   │
    │   └─→ Groq API (Intent analysis)
    │
    ├─→ teacher_prompt.js (Generate teaching content)
    │   │
    │   └─→ Groq API (Teaching generation)
    │
    ├─→ assessment_analyzer.js (If answer provided)
    │   │
    │   └─→ Groq API (Answer assessment)
    │
    ├─→ progressService.js (Calculate progress)
    │
    ├─→ Update Session in MongoDB
    │
    └─→ Return response to frontend
        │
        ▼
sessionStore updates state
    │
    ▼
UI updates (messages, progress, milestones)
```

---

## Key Components Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHAT ROUTE HANDLER                            │
│                    (chatRoutes.js)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
    ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
    │ CONVERSATION     │  │ TEACHER      │  │ ASSESSMENT       │
    │ MANAGER          │  │ PROMPT       │  │ ANALYZER         │
    │                  │  │              │  │                  │
    │ Decides:         │  │ Generates:   │  │ Analyzes:        │
    │ - Intent         │  │ - Teaching    │  │ - Understanding  │
    │ - Phase trans.   │  │   content    │  │ - Recommendation │
    │ - Follow-up?     │  │ - Question    │  │ - Confidence     │
    └──────────────────┘  └──────────────┘  └──────────────────┘
                │             │             │
                └─────────────┼─────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  GROQ API        │
                    │  (LLM Calls)     │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  PROGRESS SERVICE │
                    │  - Calculate %    │
                    │  - Update points │
                    │  - Update gems   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  SESSION MODEL   │
                    │  (MongoDB)       │
                    └──────────────────┘
```

---

## Session State Structure

```javascript
Session {
  // Phase
  phase: 'pre' | 'assessing' | 'planning' | 'learning' | 'quiz' | 'feedback' | 'completed'
  
  // Topic
  topic: "Python for Data Analysis"
  
  // Plan (3-6 modules)
  plan: [
    {
      id: "m1",
      title: "Introduction to Python",
      description: "...",
      status: "in_progress" | "locked" | "passed",
      milestones: [
        { text: "Install Python", completed: false },
        { text: "Write Hello World", completed: false },
        { text: "Variables and Types", completed: true }
      ],
      completedMilestones: [2],  // Indices of completed milestones
      points: 100
    },
    // ... more modules
  ]
  
  // Current State
  activeModuleId: "m1",
  
  // Progress
  progressPct: 33,  // (completedMilestones / totalMilestones) * 100
  points: 33,
  gems: 1,  // points / 20 (floor)
  
  // Messages
  messages: [
    { role: "user", content: "I want to learn Python" },
    { role: "assistant", content: "Great! Let's start..." }
  ]
  
  // Metadata
  meta: {
    currentMilestoneIndex: 2,  // 0-based index
    milestoneBeingTaught: false,
    outstandingCheck: "What command shows Python version?",
    contextSummary: "{...}",  // Structured summary for token efficiency
    // ...
  }
  
  // Profile
  profile: {
    name: "...",
    background: "...",
    preferredStyle: "examples-first",
    // ...
  }
}
```

---

## Request/Response Flow

### Chat Request Flow

```
1. User sends message
   ↓
2. Frontend: sessionStore.sendChatMessage()
   ↓
3. Backend: POST /v1/chat
   ↓
4. Middleware: Validation, Rate Limiting, Context Control
   ↓
5. Load Session from MongoDB
   ↓
6. Conversation Manager: Analyze intent/flow (LLM call)
   ↓
7. Teacher Prompt: Generate teaching content (LLM call)
   ↓
8. Assessment Analyzer: Analyze answer if provided (LLM call)
   ↓
9. Progress Service: Calculate progress
   ↓
10. Update Session in MongoDB
    ↓
11. Return response to frontend
    ↓
12. Frontend: Update UI (messages, progress, milestones)
```

### Token Optimization Flow

```
Full Conversation History (5000+ tokens)
    ↓
Context Summarization (every 3-4 turns)
    ↓
Structured Summary (~150 tokens)
    ↓
Conversation Windowing (last 6-8 turns)
    ↓
Combined Context (~1850 tokens)
    ↓
LLM Call (max_tokens: 256-600 depending on phase)
    ↓
Response (~200-500 tokens)
```

---

## Key Design Patterns

### 1. **Uniform Structure Pattern**
- All milestones follow same structure
- Only difference: First milestone uses "Introduction", others use "Acknowledgment + Transition"
- Enforced in `teacher_prompt.js`

### 2. **LLM-Based Decision Pattern**
- No hardcoded keywords
- All decisions use natural language understanding
- Conversation manager, assessment analyzer use LLM

### 3. **Sequential Progression Pattern**
- Milestones must progress sequentially (0 → 1 → 2 → ...)
- Enforced in `chatRoutes.js`
- No skipping allowed

### 4. **Progress Calculation Pattern**
- Recalculate after each milestone completion
- Formula: `(completedMilestones / totalMilestones) * 100`
- Updates points, gems automatically

### 5. **Token Optimization Pattern**
- Context summarization (50-70% reduction)
- Conversation windowing (last 6-8 turns)
- Adaptive max_tokens per phase
- Result: 60-80% token reduction

---

## Security Architecture

```
Request
    ↓
┌─────────────────────────────────────┐
│  Helmet (Security Headers)          │
│  - CSP, X-Frame-Options, etc.       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Rate Limiting (60 req/min per IP)  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Input Validation & Sanitization    │
│  - HTML stripping                    │
│  - Entity decoding                  │
│  - Size limits                      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  CORS (Allowlist-based)             │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Route Handler                      │
└─────────────────────────────────────┘
    ↓
Response
```

---

## Error Handling Flow

```
Error Occurs
    ↓
┌─────────────────────────────────────┐
│  API Retry Logic (apiRetry.js)     │
│  - Exponential backoff              │
│  - Max 3 retries                     │
│  - Handles: rate limits, server     │
│    errors, network errors           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Error Logger (logging.js)         │
│  - Logs error with context          │
│  - No information leakage           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Error Response (sanitized)         │
│  - User-friendly message             │
│  - Error code                        │
│  - No stack traces in production     │
└─────────────────────────────────────┘
```

---

**Last Updated**: 2024
**Version**: 1.0







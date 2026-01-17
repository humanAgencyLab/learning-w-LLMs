# 🚀 Study Assist - Quick Reference Card

## What Is This Project?

**Study Assist** = LLM-powered learning platform that provides personalized, adaptive teaching through chat. Uses **Self-Regulated Learning (SRL)** principles with milestone-based progression.

**Tech Stack:** React 18 + Express.js + MongoDB + Groq API (Llama 3.3 70B) + JWT Auth

---

## 🎯 Core Learning Flow

```
LEARNING INTENT → PLANNING → LEARNING → QUIZZING → FEEDBACK → COMPLETED
```

1. **Learning Intent**: User enters a topic name in chat
2. **Planning**: System generates personalized plan (2-8 modules, 3-6 milestones each)
3. **Plan Approval/Modification**: User reviews, modifies (optional), and approves plan
4. **Learning**: System teaches one milestone at a time (150-250 words per teaching)
5. **Quizzing**: System generates quiz (5 questions per module, ≥70% to pass)
6. **Feedback**: Quiz results shown, user can retry or proceed
7. **Completed**: All modules done, certificate generated, session locked

---

## 📋 Teaching Structure (UNIFORM)

**Every milestone follows this structure:**

```
1. Introduction/Acknowledgment (1-3 sentences)
   - First: "On Module X, we'll cover..."
   - Others: "That's correct! You've completed... Now let's move on..."

2. Teaching Content (150-200 words) ⚠️ MANDATORY
   - Explanations, examples, code snippets
   - Same depth for all milestones

3. Assessment Question (EXACTLY ONE, ending with ?)
   - About the milestone just taught
   - No multiple questions!
```

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `backend/routes/chatRoutes.js` | Main chat endpoint (`POST /v1/chat`) |
| `backend/prompts/teacher_prompt.js` | Generates teaching content |
| `backend/prompts/conversation_manager.js` | LLM-based flow decisions |
| `backend/models/Session.js` | Session schema |
| `frontend/my-app/src/Pages/ChatInterface.jsx` | Main chat UI |
| `frontend/my-app/src/state/sessionStore.js` | State management |

---

## 🎓 Assessment Scenarios

| Scenario | Trigger | Response |
|----------|---------|----------|
| **A** | Correct + milestone complete | Move to next milestone |
| **B** | Correct but needs clarification | Provide deeper explanation |
| **C** | Incorrect (1st time) | Re-explain topic differently |
| **D** | Incorrect (2nd time) | Brief explanation, move forward |

---

## 📊 Session Model Key Fields

```javascript
{
  phase: 'pre' | 'assessing' | 'planning' | 'learning' | 'quiz' | 'feedback' | 'completed',
  topic: String,
  plan: [{
    id, title, description,
    status: 'locked' | 'in_progress' | 'passed',
    milestones: [{ text, completed }],
    completedMilestones: [Number],  // Indices
    points: Number
  }],
  activeModuleId: String,
  progressPct: Number,
  points: Number,
  gems: Number,
  messages: [{ role, content }],
  meta: {
    currentMilestoneIndex: Number,
    milestoneBeingTaught: Boolean,
    outstandingCheck: String
  }
}
```

---

## 🚨 Critical Rules

### ✅ DO
- Ask **EXACTLY ONE** question per response
- Use **150-200 words** for teaching content
- Progress milestones **sequentially** (0 → 1 → 2 → ...)
- Use **LLM-based** decisions (no keywords)

### ❌ DON'T
- Ask multiple questions
- Skip milestones
- Teach multiple topics in one response
- Use keyword-based detection
- Use variable word counts

---

## 🔧 Quick Commands

```bash
# Backend
cd backend
npm install
npm start                    # http://localhost:5001

# Frontend
cd frontend/my-app
npm install
npm start                    # http://localhost:3000

# Tests
cd backend
npm test

# Manual Testing
node backend/test_assessment_fixes.js
node backend/test_teaching_flow.js
```

---

## 🌐 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/auth/signup` | POST | User registration |
| `/v1/auth/login` | POST | User login |
| `/v1/auth/logout` | POST | User logout |
| `/v1/auth/refresh` | POST | Refresh access token |
| `/v1/chat` | POST | Main chat interaction (detects learning intent) |
| `/v1/assessment` | POST | Generate learning plan |
| `/v1/assessment/approve` | POST | Approve plan, start learning |
| `/v1/assessment/modify` | POST | Request plan modifications |
| `/v1/quiz/start` | POST | Generate module quiz |
| `/v1/quiz/submit` | POST | Submit quiz answers |
| `/v1/quiz/revision/start` | POST | Start revision quiz for any topic |
| `/v1/sessions` | GET | List user sessions (with search/filters) |
| `/v1/sessions/:id/resume` | POST | Resume a session |
| `/v1/sessions/:id/summarize` | POST | Generate session summary |
| `/v1/profile` | GET/PUT | Get/update user profile |
| `/v1/health` | GET | Health check |

---

## 📈 Progress Calculation

```
progressPct = (completedMilestones / totalMilestones) * 100
points = Based on module progress and module points
gems = floor(points / 20)
```

---

## 🎯 Token Optimization

- **Context Summarization**: 50-70% reduction
- **Conversation Windowing**: Last 6-8 turns
- **Adaptive max_tokens**: 256 (assess) → 600 (learning) → 180 (quiz)
- **Result**: 60-80% token reduction

---

## 🐛 Common Issues

| Issue | Fix |
|-------|-----|
| Multiple questions | Prohibit in prompts, use "EXACTLY ONE" |
| Skipping milestones | Code validation enforces sequential |
| Missing teaching | Require "MUST provide actual teaching content (150-200 words)" |
| Progress not updating | Call `recalculateProgress()` after milestone completion |
| Redundant questions | Clear `outstandingCheck` when milestone completes |

---

## 📚 Documentation

1. **`ONBOARDING_GUIDE.md`** - Complete onboarding guide
2. **`ARCHITECTURE_SUMMARY.md`** - Architecture diagrams
3. **`docs/TEACHING_SYSTEM_DOCUMENTATION.md`** - Complete teaching system docs
4. **`docs/TEACHING_SYSTEM_QUICK_REFERENCE.md`** - Teaching system quick ref
5. **`README.md`** - Project overview

---

## 🎓 Learning Path

1. Read `README.md` - Basic understanding
2. Read `ONBOARDING_GUIDE.md` - Complete overview
3. Read `ARCHITECTURE_SUMMARY.md` - Architecture diagrams
4. Explore `backend/routes/chatRoutes.js` - See how chat works
5. Explore `backend/prompts/teacher_prompt.js` - See teaching generation
6. Read `docs/TEACHING_SYSTEM_DOCUMENTATION.md` - Deep dive

---

## 🔍 Debugging

```bash
# Check session state
curl "http://localhost:5001/v1/session/state?sessionId=<id>"

# Check backend logs
tail -f backend/logs/app.log  # or terminal output

# Check frontend console
# Open browser DevTools → Console
```

---

## ✅ Current Status

- **Production Ready**: ✅ Deployed to Google Cloud Run + Firebase Hosting
- **Authentication**: ✅ Full JWT-based auth system
- **Learning Flow**: ✅ Complete milestone-based teaching system
- **Quiz System**: ✅ Module quizzes + revision quizzes
- **Certificate Generation**: ✅ PDF certificates on completion
- **Session Management**: ✅ Chat history, favorites, search, filters
- **Progress Tracking**: ✅ Points, gems, modules/topics completed

---

**Version**: 1.0  
**Last Updated**: 2025







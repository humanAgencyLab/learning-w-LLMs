# Instructor Integration — Overall Implementation Plan

## Goal

Evolve Study Assist from a student-only, self-directed learning app into an **Instructor-in-the-Loop (IitL)** platform. Instructors create **Course Projects** (analogous to ChatGPT Projects), upload materials, configure instructions, and publish structured **Topics**. Students join courses via access codes and engage with published topics through personalized, LLM-powered learning threads.

---

## Hierarchy at a Glance

```
Course (Project Container)          ← owned by instructor
├── Sources & Instructions          ← uploaded materials + teaching preferences
├── Topic 1 (≈ current "topic")     ← e.g. "Introduction to Java"
│   ├── Module 1                    ← e.g. "Basic Java Knowledge"
│   │   ├── Milestone 1            ← e.g. "What is Java"
│   │   ├── Milestone 2            ← e.g. "Where Java is used"
│   │   └── quizPattern            ← question-type rules for this module
│   └── Module 2                    ← e.g. "Syntax and Operators"
│       ├── Milestone 1...
│       └── quizPattern
├── Topic 2                         ← e.g. "Control & Conditions"
│   └── ...
└── Topic N
```

**Key distinction from current system:**
- Current: `Topic (chat thread) → Modules → Milestones` — all generated from student input
- Instructor version: `Course → Topics → Modules → Milestones` — Topics are the new layer, each Topic behaves like a current chat thread

---

## Architecture Integration Points

### What stays the same (no rewrites needed)
| Component | Why it works as-is |
|---|---|
| [baseAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/framework/baseAgent.js) | New agents follow the same [runAgent()](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/framework/baseAgent.js#4-58) + `runWithValidation()` pattern |
| [studyGraph.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/graph/studyGraph.js) | Router uses `session.phase` — instructor-seeded sessions enter at `learning` phase, skipping `pre/assessing/planning` |
| [teachingAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/teachingAgent.js) | Already generates personalized content from session profile + module/milestone. We extend the prompt context with course materials |
| [contextBuilder.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/framework/contextBuilder.js) | Message trimming/summary logic is session-scoped, unchanged |
| [auth.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/middleware/auth.js) middleware | JWT auth stays the same, we add a `requireRole` layer on top |

### What gets added (new code)
| Component | Description |
|---|---|
| `CourseProject` model | Project container with sources, instructions, access code |
| `TopicBlueprint` model | Instructor-editable topic/module/milestone structure |
| `Enrollment` model | Student ↔ Course linkage |
| `User.role` field | `"student"` (default) or `"instructor"` |
| `requireRole` middleware | Role-based route guard |
| `materialExtractionAgent` | Parse uploaded docs into structured content chunks |
| `topicPlanGeneratorAgent` | Generate topic blueprints from course context |
| `courseContextService` | Merge sources + instructions + blueprint for prompt enrichment |
| `instructorRoutes` | CRUD for courses, topics, publish lifecycle |
| `enrollmentRoutes` | Student join flow, published topic listing |
| Instructor frontend pages | Project setup, topic manager, analytics |
| Student course frontend | Join flow, topic catalog, course-aware chat |

### What gets modified (surgical changes)
| Component | Change |
|---|---|
| [User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js) | Add `role` field (`student` / `instructor`) |
| [Session.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/Session.js) | Add `courseProjectId`, `topicBlueprintId`, `enrollmentId` optional fields |
| [sessionStore.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/state/sessionStore.js) | Add course-aware session creation flow |
| [quizAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/quizAgent.js) | Accept `quizPattern` metadata in prompt when available |
| [Onboarding.jsx](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/Pages/Onboarding.jsx) | Add course-specific prior knowledge fields |
| [authRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/authRoutes.js) | Include role in signup/login responses |
| [App.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/App.js) | Add role-aware routing for instructor vs student pages |

---

## Phase Breakdown

### Phase 1 — Foundation: Roles, Models, and Auth

**Goal:** Establish the data foundation and role-based access control.

#### Backend Changes

##### [MODIFY] [User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js)
- Add `role` field: `{ type: String, enum: ['student', 'instructor'], default: 'student' }`

##### [NEW] `backend/middleware/roleAuth.js`
- `requireRole(...roles)` middleware — checks `req.user.role` against allowed roles
- Composes with existing `requireAuth` from [auth.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/middleware/auth.js)

##### [NEW] `backend/models/CourseProject.js`
```
CourseProject {
  instructorId: ObjectId (ref: User, required, indexed)
  title: String (required)
  description: String
  accessCode: String (unique, auto-generated, 6-8 chars)
  status: 'draft' | 'active' | 'archived' (default: 'draft')
  sources: [{
    filename: String
    originalName: String
    mimeType: String
    extractedText: String    // parsed text content
    uploadedAt: Date
  }]
  globalInstructions: String  // instructor's teaching preferences
  planStrategy: {
    type: 'week_based' | 'module_based' (default: 'module_based')
    topicCount: Number        // suggested number of topics
    weekCount: Number         // if week_based
    customNotes: String
  }
  createdAt, updatedAt (timestamps: true)
}
```

##### [NEW] `backend/models/TopicBlueprint.js`
```
TopicBlueprint {
  courseProjectId: ObjectId (ref: CourseProject, required, indexed)
  title: String (required)
  objective: String
  orderIndex: Number          // ordering within the course
  status: 'draft' | 'approved' | 'published' | 'unpublished' (default: 'draft')
  version: Number (default: 1)
  modules: [{
    moduleId: String (required)
    title: String (required)
    description: String
    difficulty: 'intro' | 'core' | 'apply'
    points: Number
    milestones: [{
      text: String (required)
      completed: Boolean (default: false)
    }]
    quizPattern: {
      questionCount: Number (default: 5)
      questionTypes: [{
        type: 'conceptual' | 'applied' | 'recall' | 'analytical'
        weight: Number  // percentage, sum to 100
      }]
      difficultyMix: {
        easy: Number    // percentage
        medium: Number
        hard: Number
      }
      cognitiveLevel: 'remember' | 'understand' | 'apply' | 'analyze' (Bloom's)
      constraints: String  // free-text instructor notes
    }
  }]
  changeNotes: String
  updatedBy: ObjectId (ref: User)
  publishedAt: Date
  createdAt, updatedAt (timestamps: true)
}
```

##### [NEW] `backend/models/Enrollment.js`
```
Enrollment {
  studentId: ObjectId (ref: User, required, indexed)
  courseProjectId: ObjectId (ref: CourseProject, required, indexed)
  joinedAt: Date (default: Date.now)
  status: 'active' | 'dropped' (default: 'active')
  priorKnowledge: {           // course-specific personalization
    selfRating: String
    relevantExperience: String
    specificGoals: String
  }
}
Compound index: { studentId, courseProjectId } unique
```

##### [MODIFY] [Session.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/Session.js)
- Add optional fields: `courseProjectId`, `topicBlueprintId`, `enrollmentId` (all ObjectId refs)
- Add index: `{ courseProjectId: 1, topicBlueprintId: 1, userId: 1 }`

##### [MODIFY] [authRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/authRoutes.js)
- Support `role` field in signup request (defaults to `student`)
- Include `role` in login/me responses

---

### Phase 2 — Instructor Routes and Material Upload

**Goal:** Instructors can create courses, upload materials, and manage settings.

##### [NEW] `backend/routes/instructorRoutes.js`
- `POST /v1/instructor/courses` — create a new course project
- `GET /v1/instructor/courses` — list instructor's courses
- `GET /v1/instructor/courses/:courseId` — get course details
- `PUT /v1/instructor/courses/:courseId` — update course settings/instructions
- `DELETE /v1/instructor/courses/:courseId` — archive course
- `POST /v1/instructor/courses/:courseId/sources` — upload material (multer + pdf-parse)
- `DELETE /v1/instructor/courses/:courseId/sources/:sourceId` — remove a source
- All routes guarded by `requireAuth` + `requireRole('instructor')`

##### [NEW] `backend/services/materialExtractionService.js`
- Accept uploaded file buffer (PDF, TXT, DOCX)
- Extract text content using `pdf-parse` (for PDFs) or direct read (for text)
- Chunk large documents into manageable sections with metadata
- Return `{ extractedText, chunkCount, wordCount }`

##### [MODIFY] [app.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/app.js)
- Mount `instructorRoutes` at `/v1/instructor`

---

### Phase 3 — AI Topic Blueprint Generation

**Goal:** LLM generates multiple topic blueprints from course materials and instructor preferences.

##### [NEW] `backend/services/courseContextService.js`
- `buildCourseContext(courseProject)` — merges all source `extractedText`, `globalInstructions`, and `planStrategy` into a single structured prompt context
- Handles token budgeting: truncates/summarizes sources if they exceed context window
- Returns `{ materialsSummary, instructions, strategy }`

##### [NEW] `backend/agents/materialSummaryAgent.js`
- **Step 1 of the two-step pipeline**
- Takes raw extracted text from course materials
- Produces a structured summary organized by concepts/chapters
- Uses `baseAgent` pattern with `runWithValidation`

##### [NEW] `backend/agents/topicPlanGeneratorAgent.js`
- **Step 2 of the two-step pipeline**
- Takes structured material summary + instructor preferences
- Generates an array of topic blueprints with full module/milestone trees
- Supports both `week_based` and `module_based` generation modes
- Output validated by a new `topicPlanValidator`

##### [NEW] `backend/agents/validators/topicPlanValidator.js`
- Validates generated topic array structure
- Checks: topic count vs strategy, module count per topic (2-3), milestone count per module (3-6), point distribution, uniqueness

##### [NEW] Routes in `instructorRoutes.js`
- `POST /v1/instructor/courses/:courseId/generate-topics` — trigger AI generation
- Returns generated topic blueprints in `draft` status

---

### Phase 4 — Instructor Topic Lifecycle (Edit, Approve, Publish)

**Goal:** Instructors can review, edit, approve, and publish/unpublish topics.

##### [NEW] `backend/routes/topicRoutes.js`
- `GET /v1/instructor/courses/:courseId/topics` — list all topics for course
- `GET /v1/instructor/courses/:courseId/topics/:topicId` — get topic details
- `PUT /v1/instructor/courses/:courseId/topics/:topicId` — edit topic (modules, milestones, quizPatterns)
- `PATCH /v1/instructor/courses/:courseId/topics/:topicId/status` — change status (`draft → approved → published`, or `published → unpublished`)
- `POST /v1/instructor/courses/:courseId/topics/:topicId/regenerate` — re-generate a single topic
- `DELETE /v1/instructor/courses/:courseId/topics/:topicId` — delete draft topic
- Status transition rules enforced server-side:
  - `draft` → `approved` ✓
  - `approved` → `published` ✓
  - `published` → `unpublished` ✓
  - `unpublished` → `published` ✓
  - `approved` → `draft` ✓ (for re-editing)

---

### Phase 5 — Student Enrollment and Course Access

**Goal:** Students join courses by access code and see published topics.

##### [NEW] `backend/routes/enrollmentRoutes.js`
- `POST /v1/courses/join` — join course by access code → creates `Enrollment`
  - Optionally collects `priorKnowledge` during join flow
- `GET /v1/courses/my-courses` — list student's enrolled courses
- `GET /v1/courses/:courseId/topics` — get published topics for enrolled student (filter: `status === 'published'` only)
- `GET /v1/courses/:courseId` — get course info for enrolled student

##### [NEW] `backend/services/sessionSeedingService.js`
- `seedSessionFromBlueprint(userId, topicBlueprint, enrollment, courseProject)` 
- Creates a new [Session](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/Pages/ChatInterface.jsx#319-356) document pre-populated with:
  - `phase: 'learning'` (bypasses pre/assessing/planning)
  - [plan](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/graph/studyGraph.js#64-71) array mapped from topic blueprint modules/milestones
  - `activeModuleId` set to first module
  - `courseProjectId`, `topicBlueprintId`, `enrollmentId` links
  - `topic` set to blueprint title
  - `profile` enriched with enrollment's `priorKnowledge`
  - `meta.currentMilestoneIndex: 0`

##### [NEW] Route in `enrollmentRoutes.js`
- `POST /v1/courses/:courseId/topics/:topicId/start` — student starts a topic
  - Creates a seeded session via `sessionSeedingService`
  - Returns the new session ID → frontend navigates to chat

---

### Phase 6 — Personalized Onboarding V2

**Goal:** Capture richer student profile data for better personalization in instructor-led courses.

##### [MODIFY] [User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js) profile section
- Add fields: `programmingLanguages[]`, `yearOfStudy`, `academicLevel`

##### [MODIFY] [Onboarding.jsx](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/Pages/Onboarding.jsx)
- Add optional onboarding steps for course-specific context
- When student joins a course, show a short "Course Onboarding" overlay collecting `priorKnowledge`

##### [MODIFY] Teaching prompt enrichment
- Extend [buildUserPrompt()](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/quizAgent.js#30-46) in [teachingAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/teachingAgent.js) to include:
  - Course materials context (from `courseContextService`)
  - Enrollment-specific `priorKnowledge`
  - Instructor's `globalInstructions`

---

### Phase 7 — Quiz Pattern System

**Goal:** Instructor-defined quiz patterns guide per-student quiz generation.

##### [MODIFY] [quizAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/quizAgent.js)
- Accept optional `quizPattern` parameter
- When present, inject pattern constraints into the system prompt:
  - Question type distribution (e.g., "3 conceptual, 2 applied")
  - Difficulty mix (e.g., "2 easy, 2 medium, 1 hard")
  - Cognitive level target
  - Instructor constraints text

##### [MODIFY] Quiz generation flow in [quizRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/quizRoutes.js)
- When session has `topicBlueprintId`, fetch the module's `quizPattern` and pass to [runQuizAgent](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/quizAgent.js#47-69)

---

### Phase 8 — Instructor Analytics Dashboard

**Goal:** Instructors see aggregate student performance data per course/topic/module.

##### [NEW] `backend/routes/analyticsRoutes.js`
- `GET /v1/instructor/courses/:courseId/analytics` — course-level overview
- `GET /v1/instructor/courses/:courseId/topics/:topicId/analytics` — topic-level detail
- Metrics:
  - Enrollment count, active students
  - Per-topic: completion rate, avg score, pass rate
  - Per-module: attempts-to-pass distribution, avg score, struggle areas
  - Quiz pattern effectiveness (which pattern types correlate with lower scores)

##### [NEW] `backend/services/analyticsService.js`
- Aggregate queries across [Session](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/Pages/ChatInterface.jsx#319-356) and `QuizAttempt` collections
- Filter by `courseProjectId` and `topicBlueprintId`
- Use existing LLM analysis patterns to summarize common misconceptions

##### [NEW] `backend/agents/struggleSummaryAgent.js`
- Takes aggregated quiz results and student interaction patterns
- Generates narrative summaries: *"60% of students struggled with X, commonly confusing it with Y"*
- Instructor sees this before class as a pre-class preparation tool

---

### Phase 9 — Frontend: Instructor Pages

**Goal:** Full instructor UI for managing courses and topics.

##### [NEW] Frontend Pages (in `frontend/my-app/src/Pages/instructor/`)
- `InstructorDashboard.jsx` — list of instructor's courses, create new course
- `CourseSetup.jsx` — edit course details, upload materials, set instructions
- `TopicManager.jsx` — view generated topics, edit modules/milestones, publish controls
- `TopicEditor.jsx` — detailed editing of a single topic's structure
- `QuizPatternEditor.jsx` — configure quiz patterns per module
- `Analytics.jsx` — analytics dashboard with charts and AI summaries

##### [NEW] State management
- `frontend/my-app/src/state/instructorStore.js` — Zustand store for instructor data
- `frontend/my-app/src/lib/instructorApi.js` — API client for instructor endpoints

##### [MODIFY] [App.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/App.js)
- Add role-aware routing: instructor routes only visible to `role === 'instructor'`
- Add instructor navigation items

---

### Phase 10 — Frontend: Student Course Experience

**Goal:** Students join courses, browse published topics, and start course-based learning threads.

##### [NEW] Frontend Pages (in `frontend/my-app/src/Pages/student/`)
- `JoinCourse.jsx` — enter access code, see course info, join
- `CourseDashboard.jsx` — list enrolled courses
- `CourseTopics.jsx` — view published topics under a course, start learning
- `CourseOnboarding.jsx` — mini onboarding for course-specific context

##### [NEW] State management
- `frontend/my-app/src/state/courseStore.js` — Zustand store for student course data
- `frontend/my-app/src/lib/courseApi.js` — API client for enrollment/course endpoints

##### [MODIFY] [ChatInterface.jsx](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/Pages/ChatInterface.jsx)
- When seeded from a course topic, hide learning-style toggle (Studying/Revision)
- Show course/topic context in the chat header
- Disable topic input (topic is predetermined by the blueprint)

---

## Data Flow Diagrams

### Instructor Flow
```
Instructor creates Course
    → Uploads materials (PDF/text)
    → materialExtractionService parses docs
    → Sets global instructions + plan strategy
    → Clicks "Generate Topics"
    → materialSummaryAgent summarizes content
    → topicPlanGeneratorAgent creates TopicBlueprints (draft)
    → Instructor reviews/edits modules & milestones
    → Instructor sets quizPattern per module
    → Instructor approves → publishes topics
    → Shares access code with students
```

### Student Flow
```
Student enters access code
    → POST /v1/courses/join → Enrollment created
    → Optionally fills course-specific priorKnowledge
    → GET /v1/courses/:id/topics → sees published topics
    → Clicks a topic → POST /v1/courses/:id/topics/:id/start
    → sessionSeedingService creates Session (phase: 'learning')
    → ChatInterface opens with seeded plan
    → studyGraph routes to convManager → teaching (existing flow)
    → Quiz uses quizPattern from blueprint module
    → Progress tracked per session (same as current)
```

---

## Agent Summary

| Agent | New/Existing | Purpose |
|---|---|---|
| `materialSummaryAgent` | **NEW** | Summarize uploaded course materials into structured concepts |
| `topicPlanGeneratorAgent` | **NEW** | Generate TopicBlueprints from course context + instructor prefs |
| `struggleSummaryAgent` | **NEW** | Summarize student struggles for instructor dashboard |
| `intentAgent` | Existing | Skipped for course topics (session starts at `learning`) |
| `planAgent` | Existing | Skipped for course topics (plan seeded from blueprint) |
| `convManagerAgent` | Existing | Unchanged — routes learning conversation |
| `teachingAgent` | Existing, **modified** | Prompt enriched with course materials + instructor instructions |
| `assessmentAgent` | Existing | Unchanged — evaluates student responses |
| `quizAgent` | Existing, **modified** | Accepts `quizPattern` constraints |
| `feedbackAgent` | Existing | Unchanged — provides quiz feedback |

---

## Verification Plan

### Automated Tests
- **Phase 1:** Unit tests for new models (schema validation, required fields, enum constraints)
  - Run: `cd backend && npx jest tests/models/`
- **Phase 2:** Integration tests for instructor routes (CRUD, auth guards, file upload)
  - Run: `cd backend && npx jest tests/routes/instructor`
- **Phase 3:** Agent output validation tests (topic plan structure, validator logic)
  - Run: `cd backend && npx jest tests/agents/`
- **Phase 5:** Session seeding tests (correct phase, plan structure, field mapping)
  - Run: `cd backend && npx jest tests/services/sessionSeeding`
- **Phase 7:** Quiz pattern enforcement tests (generated quiz matches pattern constraints)
  - Run: `cd backend && npx jest tests/agents/quizAgent`

### Manual / Browser Verification
- **End-to-end flow:** Create instructor account → create course → upload PDF → generate topics → edit/publish → share access code → student joins → student opens topic → chat proceeds through milestones → quiz → completion
- **Role isolation:** Verify students cannot access instructor routes and vice versa
- **Publish visibility:** Unpublished topics must not appear in student topic list

> [!IMPORTANT]
> We will plan each phase in granular detail before starting implementation. This document serves as the overall roadmap.

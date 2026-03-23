# Instructor Integration — Implementation Plan

Add an **Instructor role** to Study Assist so instructors can create courses, upload materials, and generate weekly pre-class modules that students complete before class via an **access code**.

---

## Current Architecture (Correct Repo)

| Layer | Stack | Key Files |
|-------|-------|-----------|
| Backend | Express + MongoDB + Groq (`groq-sdk`, Llama) | [app.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/app.js), [server.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/server.js) |
| Agent Graph | LangGraph `StateGraph` with 9 nodes | [studyGraph.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/graph/studyGraph.js) |
| Models | `User` (auth, profile, gamification), `Session` (phases, plan, milestones, quizAttempts, messages) | [User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js), [Session.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/Session.js) |
| Auth | JWT-based, `ProtectedRoute` + `authStore` (zustand) | [authRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/authRoutes.js), [auth.js middleware](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/middleware/auth.js) |
| Frontend | React 19, react-router-dom, `AppShell` layout, 10 pages, components: `ModuleProgressPanel`, `QuizPanel`, `StageTracker`, `SessionSidebar` | [App.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/App.js) |

**Existing Session [plan](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/graph/studyGraph.js#64-71) schema** already supports `modules → milestones` with status tracking, quiz attempts, and points. The instructor flow will **reuse** this structure but seed it from instructor materials instead of the `planAgent`.

---

## Proposed Changes (Prioritized for Time)

### Phase 1 — Backend: Models & Auth (Foundation)

---

#### [MODIFY] [User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js)

Add a `role` field to distinguish students from instructors:
```diff
+ role: {
+   type: String,
+   enum: ['student', 'instructor'],
+   default: 'student'
+ },
```

---

#### [NEW] `backend/models/Course.js`

New Mongoose model for an instructor's course:

| Field | Type | Description |
|-------|------|-------------|
| `instructorId` | `ObjectId` → `User` | The instructor who created the course |
| `courseName` | [String](file:///Users/nibir/Documents/Research/learning-via-llms-analysis/analysis/pilot_final_qualitative_analysis.html#1196-1201) | e.g. "CIS 3001 – Data Structures" |
| `accessCode` | [String](file:///Users/nibir/Documents/Research/learning-via-llms-analysis/analysis/pilot_final_qualitative_analysis.html#1196-1201) (unique, 6-char) | Students join via this code |
| `syllabus` | [String](file:///Users/nibir/Documents/Research/learning-via-llms-analysis/analysis/pilot_final_qualitative_analysis.html#1196-1201) | Extracted text from uploaded syllabus |
| `weeks` | `[{ weekNumber, title, materialText, fileUrl? }]` | Instructor-uploaded weekly content |
| `createdAt` | [Date](file:///Users/nibir/Documents/Research/learning-via-llms-analysis/analysis/pilot_final_qualitative_analysis.html#1223-1237) | Auto-timestamp |

---

#### [NEW] `backend/models/Enrollment.js`

Links student to course + tracks per-module completion:

| Field | Type | Description |
|-------|------|-------------|
| `studentId` | `ObjectId` → `User` | The student |
| `courseId` | `ObjectId` → `Course` | The course |
| `sessionId` | `ObjectId` → `Session` | Link to the student's Study Assist Session for this course |
| `enrolledAt` | [Date](file:///Users/nibir/Documents/Research/learning-via-llms-analysis/analysis/pilot_final_qualitative_analysis.html#1223-1237) | When they joined |

> [!NOTE]
> Per-module completion is already tracked inside the existing `Session.plan[].status` and `Session.quizAttempts[]` fields — no need to duplicate it. The `Enrollment` just links the student to the correct course/session.

---

### Phase 2 — Backend: Instructor Routes & Module Generation

---

#### [NEW] `backend/routes/instructorRoutes.js`

All routes require JWT auth + `role === 'instructor'` check.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/instructor/course` | `POST` | Create a new course (generates 6-char access code) |
| `/v1/instructor/course/:courseId/material` | `POST` | Upload material text for a specific week |
| `/v1/instructor/course/:courseId/generate/:weekNumber` | `POST` | Call Groq to generate a module (reading + quiz) from the week's material |
| `/v1/instructor/course/:courseId/modules` | `GET` | List all generated modules (with approval status) |
| `/v1/instructor/course/:courseId/module/:weekNumber` | `PATCH` | Edit or approve a generated module |
| `/v1/instructor/course/:courseId/dashboard` | `GET` | Aggregated student data (avg score, completion %, struggles) |

---

#### [NEW] `backend/routes/enrollmentRoutes.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/enroll/join` | `POST` | Student joins a course via access code → creates `Enrollment` + auto-creates a `Session` pre-seeded with the approved modules as the plan |
| `/v1/enroll/courses` | `GET` | List student's enrolled courses |

---

#### [NEW] `backend/agents/moduleGeneratorAgent.js`

A new agent (following the existing [baseAgent.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/agents/framework/baseAgent.js) pattern) that:
1. Takes the instructor's `materialText` + `syllabus` context as input.
2. Calls Groq with a prompt that instructs the LLM to generate:
   - A module `title` and `description`
   - 3–6 milestones (brief reading chunks, each ≈ 150–300 words)
   - 5 MCQ quiz questions
3. Returns a structured JSON matching the existing `Session.plan` module schema so it can be directly inserted.

> [!IMPORTANT]
> This agent **does not** go through the LangGraph study graph. It's a standalone generation tool, similar to how the existing `planAgent` works but seeded from instructor content rather than student input.

---

#### [MODIFY] [app.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/app.js)

Mount the two new route files:
```diff
+ const instructorRoutes = require('./routes/instructorRoutes');
+ const enrollmentRoutes = require('./routes/enrollmentRoutes');
  ...
+ app.use('/v1/instructor', instructorRoutes);
+ app.use('/v1/enroll', enrollmentRoutes);
```

---

#### [MODIFY] [authRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/authRoutes.js)

Update the signup endpoint to accept an optional `role` field (default `'student'`). **Only allow `'instructor'` role** if the signup request includes a special instructor registration code (a simple hardcoded secret from [.env](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/.env)), to prevent any student from self-promoting.

---

### Phase 3 — Frontend: New Pages

---

#### [NEW] `src/Pages/JoinCourse.jsx` + `JoinCourse.css`

Simple form page: input field for the 6-character access code → `POST /v1/enroll/join` → on success, redirect to `/course/:courseId`.

---

#### [NEW] `src/Pages/CourseModules.jsx` + `CourseModules.css`

Displays the list of weekly modules for an enrolled course. Each card shows: week number, title, status (completed ✅ / in-progress 🔄 / locked 🔒), quiz score if completed. Clicking "Start" on an unlocked module navigates to `/chat` with the course `sessionId` loaded.

> [!NOTE]
> This reuses the existing [ChatInterface.jsx](file:///Users/nibir/Documents/Research/learning-w-LLMs/frontend/my-app/src/Pages/ChatInterface.jsx) flow — the student's `Session` is pre-created with the instructor's modules as the plan, so the existing milestone/quiz flow works as-is.

---

#### [NEW] `src/Pages/InstructorDashboard.jsx` + `InstructorDashboard.css`

The instructor's main view:
- **Header:** Course name + copyable access code
- **Modules list:** Per-week cards showing: title, approval status toggle, "Generate" button (for unapproved weeks)
- **Upload panel:** Text area or file upload for a selected week's material
- **Analytics section:** For each module, show avg quiz score, completion rate, and a short AI-generated struggle summary

---

#### [NEW] `src/Pages/CourseSetup.jsx` + `CourseSetup.css`

A form page:
- Course name (text input)
- Syllabus (text paste area — paste syllabus text)
- Submit → `POST /v1/instructor/course` → redirects to InstructorDashboard

---

### Phase 4 — Frontend: Modify Existing Files

---

#### [MODIFY] [App.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/App.js)

Add 4 new routes inside the `<AppShell>` block:
```diff
+ <Route path="/join" element={<ProtectedRoute><JoinCourse /></ProtectedRoute>} />
+ <Route path="/course/:courseId" element={<ProtectedRoute><CourseModules /></ProtectedRoute>} />
+ <Route path="/instructor" element={<ProtectedRoute><InstructorDashboard /></ProtectedRoute>} />
+ <Route path="/instructor/setup" element={<ProtectedRoute><CourseSetup /></ProtectedRoute>} />
```

---

#### [MODIFY] Navigation / [RootRedirect.jsx](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/frontend/my-app/src/components/RootRedirect.jsx)

- Update `RootRedirect` to route instructors to `/instructor` and students to `/chat`.
- Add nav items: "Join Course" for students, "Dashboard" for instructors.

---

## What Stays the Same (No Changes Needed)

These existing components work as-is for the instructor flow:

| Component | Why It Works |
|-----------|-------------|
| `Session` model | The `plan[]` schema already holds modules with milestones, status, and points |
| [ChatInterface.jsx](file:///Users/nibir/Documents/Research/learning-w-LLMs/frontend/my-app/src/Pages/ChatInterface.jsx) | Students learn through the same milestone-based chat flow once their session is seeded |
| `ModuleProgressPanel`, `StageTracker`, `QuizPanel` | These render from Session state — they'll render instructor-seeded modules identically |
| LangGraph study graph | The learning phase (`convManager→assessment→teaching`) runs the same way regardless of how the plan was created |
| Auth middleware, JWT flow | Works for both roles — just check `user.role` where needed |
| Gamification (points, gems) | Already tracked in `Session` and `User.stats` |

---

## File Summary

| Action | File | Priority |
|--------|------|----------|
| **MODIFY** | [backend/models/User.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/models/User.js) — add `role` field | 🔴 P0 |
| **NEW** | `backend/models/Course.js` | 🔴 P0 |
| **NEW** | `backend/models/Enrollment.js` | 🔴 P0 |
| **NEW** | `backend/agents/moduleGeneratorAgent.js` | 🔴 P0 |
| **NEW** | `backend/routes/instructorRoutes.js` | 🔴 P0 |
| **NEW** | `backend/routes/enrollmentRoutes.js` | 🔴 P0 |
| **MODIFY** | [backend/app.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/app.js) — mount new routes | 🔴 P0 |
| **MODIFY** | [backend/routes/authRoutes.js](file:///Users/nibir/Documents/Research/Working%20Repo/learning-w-LLMs/backend/routes/authRoutes.js) — role on signup | 🟡 P1 |
| **NEW** | `frontend/…/Pages/JoinCourse.jsx` + CSS | 🔴 P0 |
| **NEW** | `frontend/…/Pages/CourseModules.jsx` + CSS | 🔴 P0 |
| **NEW** | `frontend/…/Pages/InstructorDashboard.jsx` + CSS | 🟡 P1 |
| **NEW** | `frontend/…/Pages/CourseSetup.jsx` + CSS | 🔴 P0 |
| **MODIFY** | `frontend/…/App.js` — add routes | 🔴 P0 |
| **MODIFY** | `frontend/…/components/RootRedirect.jsx` | 🟡 P1 |

---

## Verification Plan

### Manual Testing Steps

1. **Instructor signup** → register with instructor code → verify `role: 'instructor'` in DB
2. **Course creation** → create course with syllabus → verify access code generated
3. **Material upload** → add Week 1 material text → verify stored
4. **Module generation** → click Generate → verify AI returns module with milestones + quiz
5. **Module approval** → review and approve → verify `isApproved: true`
6. **Student joins** → enter access code → verify Enrollment + Session created with seeded plan
7. **Student learns** → open `/chat` → milestones from instructor content → answer questions → complete quiz
8. **Dashboard** → instructor sees completion stats and quiz scores

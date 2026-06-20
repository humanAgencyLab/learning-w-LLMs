---
name: Instructor Course Build Plan
overview: Implement the instructor course system as Course -> Topics -> Modules -> Milestones, starting from your current model foundation and progressing through backend APIs, session seeding, quiz pattern integration, and frontend flows with test gates at each phase.
todos:
  - id: phase0-normalize
    content: Normalize naming strategy, fix signup role persistence, and add ownership helper checks.
    status: completed
  - id: phase1-backend-routes
    content: Implement and mount instructor/topic/enrollment routes with auth+role+ownership checks.
    status: completed
  - id: phase2-session-seeding
    content: Build session seeding service and start-topic endpoint that creates learning-phase sessions.
    status: completed
  - id: phase3-generation-pipeline
    content: Implement material extraction/context services and topic generation agents + validator.
    status: completed
  - id: phase4-quiz-patterns
    content: Wire quizPattern into quizAgent and quizRoutes for course-topic sessions.
    status: completed
  - id: phase5-frontend-flows
    content: Build instructor and student course pages, API clients, and sessionStore integration.
    status: completed
  - id: phase6-analytics
    content: Implement analytics service/routes and instructor dashboard integration.
    status: completed
  - id: phase7-tests
    content: Add backend/frontend tests for route security, seeding, publish visibility, and quiz patterns.
    status: completed
isProject: false
---

# Instructor Course Implementation Plan

## Scope and target architecture

- Implement instructor-led learning with hierarchy: **Course -> Topics -> Modules -> Milestones**.
- Each Topic should behave like the current thread structure in Study Assist.
- Students should only see **published** topics in courses they joined via access code.
- Topic sessions must start directly in `learning` phase (skip student pre/assess/plan flow).

## Phase 0 - Normalize current foundation

- **Goal:** align your existing model work to the final naming and security conventions before adding more APIs.
- Update naming strategy:
  - Preferred: rename `CourseProject` -> `Course`, `TopicBlueprint` -> `CourseTopic`, and linked fields in `Session`.
  - If you defer rename, define compatibility aliases and enforce one canonical API naming layer.
- Fix auth role persistence:
  - `backend/routes/authRoutes.js` currently inserts `userDoc` directly; ensure `role` is persisted and returned consistently in signup/login/me.
  - Add instructor registration guard (env-backed secret or controlled promotion path).
- Add ownership helper utilities:
  - Shared guard to verify instructor owns target course/topic before mutate endpoints.

### Phase 0 acceptance

- New users persist `role` correctly.
- Instructor role cannot be self-escalated without guard.
- Ownership helper is reusable by all instructor routes.

## Phase 1 - Backend route skeleton (minimum usable API)

- **Goal:** make your new models operable through protected endpoints.
- Add and mount routes in [backend/app.js](backend/app.js):
  - `backend/routes/instructorRoutes.js`
  - `backend/routes/topicRoutes.js`
  - `backend/routes/enrollmentRoutes.js`
- Instructor routes (`requireAuth` + `requireRole('instructor')` + ownership):
  - create/list/get/update/archive course
  - upload/remove course sources (metadata + extracted text placeholder)
  - list/create/update/delete topic drafts
  - approve/publish/unpublish topic with status transition validation
- Student routes (`requireAuth`):
  - join course by access code
  - list my courses
  - list published topics for enrolled course

### Phase 1 acceptance

- Full CRUD works for instructor course/topic basics.
- Student can join and only sees published topics.
- Unauthorized access returns consistent 401/403.

## Phase 2 - Topic session seeding into learning flow

- **Goal:** start topic learning from instructor-published structures using current study graph.
- Create `backend/services/sessionSeedingService.js`:
  - map selected topic modules/milestones into `Session.plan`
  - set `phase='learning'`, `activeModuleId`, `planApproved=true`
  - set milestone meta (`currentMilestoneIndex=0`, `outstandingCheck=null`, `milestoneBeingTaught=false`)
  - persist course/topic/enrollment linkage fields
- Add endpoint in enrollment routes:
  - `POST /v1/courses/:courseId/topics/:topicId/start` -> returns new `sessionId`.

### Phase 2 acceptance

- New seeded session opens directly in learning flow.
- Chat route uses existing teaching/assessment/quiz loop without pre-phase detour.
- Session links to course/topic/enrollment for analytics.

## Phase 3 - Material processing and topic generation

- **Goal:** auto-generate draft topics from instructor materials + instructions.
- Add `backend/services/materialExtractionService.js`:
  - parse supported file types, store extracted text + metadata.
- Add `backend/services/courseContextService.js`:
  - combine sources + global instructions + generation strategy with token budgeting.
- Add agents:
  - `backend/agents/materialSummaryAgent.js`
  - `backend/agents/topicPlanGeneratorAgent.js`
  - validator `backend/agents/validators/topicPlanValidator.js`
- Add endpoint:
  - `POST /v1/instructor/courses/:courseId/generate-topics` -> creates topic drafts.

### Phase 3 acceptance

- Instructor can generate a topic set from uploaded materials.
- Generated topics validate module/milestone structure.
- Topics are editable drafts after generation.

## Phase 4 - Quiz pattern integration

- **Goal:** instructor controls quiz style per module without fixed question reuse.
- Extend topic module schema usage (`quizPattern` already present in your model).
- Update [backend/agents/quizAgent.js](backend/agents/quizAgent.js):
  - accept optional `quizPattern` and inject constraints into prompt.
- Update [backend/routes/quizRoutes.js](backend/routes/quizRoutes.js):
  - if session is course-topic linked, fetch module quiz pattern and pass to agent.

### Phase 4 acceptance

- Quiz generation reflects configured question type/difficulty/cognitive targets.
- Existing non-course flows continue working unchanged.

## Phase 5 - Frontend instructor and student course flows

- **Goal:** expose backend capabilities with minimal new UI first.
- Add pages and API clients:
  - instructor: dashboard/course setup/topic manager/topic editor
  - student: join course/course list/published topics
  - clients: `instructorApi`, `courseApi`
- Integrate with routing in [frontend/my-app/src/App.js](frontend/my-app/src/App.js) and role-aware redirects.
- Update [frontend/my-app/src/state/sessionStore.js](frontend/my-app/src/state/sessionStore.js):
  - support starting from course topic endpoint and loading seeded `sessionId`.

### Phase 5 acceptance

- Instructor can complete create -> generate -> publish path from UI.
- Student can join -> view published topics -> start topic chat.
- Chat experience remains stable for existing student-only flow.

## Phase 6 - Analytics and instructor insights

- **Goal:** add practical course/topic/module insight endpoints and views.
- Add:
  - `backend/services/analyticsService.js`
  - `backend/routes/analyticsRoutes.js`
  - optional `struggleSummaryAgent` for narrative synthesis.
- Metrics:
  - enrollments, completion rate, pass rate, attempts-to-pass, module-level weak areas.

### Phase 6 acceptance

- Instructor sees course and topic analytics with stable response schema.
- Data correctly filters by course/topic ownership.

## Phase 7 - Test gates and stabilization

- Add backend tests by phase:
  - role + ownership enforcement
  - topic status transitions
  - enrollment + published-topic visibility
  - session seeding correctness
  - quiz pattern propagation
- Add frontend smoke tests for join/start topic flow.
- Add migration/backfill notes for existing data where needed.

## Suggested implementation order (short sprint cadence)

- Sprint 1: Phase 0 + Phase 1
- Sprint 2: Phase 2 + Phase 4
- Sprint 3: Phase 3
- Sprint 4: Phase 5
- Sprint 5: Phase 6 + Phase 7

## First files to touch next

- [backend/routes/authRoutes.js](backend/routes/authRoutes.js)
- [backend/app.js](backend/app.js)
- [backend/routes/instructorRoutes.js](backend/routes/instructorRoutes.js)
- [backend/routes/topicRoutes.js](backend/routes/topicRoutes.js)
- [backend/routes/enrollmentRoutes.js](backend/routes/enrollmentRoutes.js)
- [backend/services/sessionSeedingService.js](backend/services/sessionSeedingService.js)
- [frontend/my-app/src/state/sessionStore.js](frontend/my-app/src/state/sessionStore.js)
- [frontend/my-app/src/App.js](frontend/my-app/src/App.js)


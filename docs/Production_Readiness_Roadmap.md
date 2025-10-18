# Production Readiness Roadmap

This document outlines the phased development approach for the Study Assist platform, designed to take the project from its current state to production-ready deployment.

## Phase Overview

### Phase 0 — Foundations ✅ COMPLETED
**Goals**: Design system, state management, environment setup, security basics

**Deliverables**:
- ✅ Design tokens and UI component library
- ✅ Centralized state management with Zustand
- ✅ Backend security middleware (Helmet, rate limiting, CORS)
- ✅ Environment configuration and secrets management
- ✅ Health and readiness endpoints
- ✅ Code quality tools (ESLint, Prettier)

### Phase 1 — Auth & User Profile
**Goals**: Email/password authentication + editable user profiles

**UI**:
- Sign Up, Login, Forgot Password pages
- Profile page (avatar, name, education, recent courses, strengths, gaps, goals, preferred depth)
- Top-left nav shows user block at bottom

**Backend/Data**:
- `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/refresh` endpoints
- `users` collection with password hashing and unique email index
- `/profile` GET/PUT endpoints

**Acceptance**: Can create/login/logout; profile persists; guarded routes redirect

### Phase 2 — Chat Interface + Assessment Revamp [TOP PRIORITY]
**Goals**: Match current chat design; assessment uses profile + learning style; finishes in ≤2 turns

**UI**:
- `/chat` one surface with Pre and In-chat modes
- Left nav: New Chat, History, Settings, Performance, Favorites, Study Path (expandable after assessment), Profile at bottom
- Topbar: "You are Studying {Topic} 💪" (in-chat) + Start Chat
- Composer, Model selector, Learning style = Studying / Revision (persisted), NextActionBar

**Backend/Data**:
- `POST /v1/assessment` returns JSON envelope using profile and learningStyle
- `PATCH /v1/sessions/:id` stores learningStyle, topic, chatTitle, status
- Chat message streaming remains

**Acceptance**: First message finalizes topic in 1–2 calls; header + Study Path update; learning style persisted

### Phase 3 — Study Path & Session Management
**Goals**: Show/maintain study plan in nav; point system (100/topic), gems (+1 per 20), trophy on completion

**UI**:
- Study Path section: topic header + progress bar, module list with statuses
- Chips for points/gems/trophy
- Banner when view-only

**Backend/Data**:
- Extend StudySession: plan[], points, gems, hasTrophy, progressPercent, status, isViewOnly
- `PATCH /v1/sessions/:id/modules/:moduleId` updates totals and sets completion

**Acceptance**: Points/gems update on module progress; trophy appears at 100 points + all complete

### Phase 4 — Chat History & Session Lifecycle
**Goals**: Full history with rename, resume, delete/archive; session state restore across devices

**UI**:
- Nav → Chat History list: title, style badge, progress, completion badge
- Open completed as read-only; others resume

**Backend/Data**:
- `/v1/sessions` list (paginated, recent first)
- `/v1/sessions/:id` GET returns full session snapshot
- `/v1/sessions/:id/rename`, `/archive`, `/delete` (soft delete)

**Acceptance**: History shows; rename works; resume goes to same session; completed read-only enforced

### Phase 5 — Performance & Research Analytics (MVP)
**Goals**: Instrument all key events for research study; simple dashboard + CSV export

**UI**:
- Performance page: totals (sessions), avg assessment turns/time, top topics, avg quiz score, completion rate, time-on-task
- Export CSV

**Backend/Data**:
- `analytics_events` collection with indexes
- `POST /v1/analytics/track` (whitelist events)
- `GET /v1/analytics/summary`, `GET /v1/analytics/export`

**Acceptance**: Events emitted on key milestones; summary computes aggregates; CSV downloads

### Phase 6 — Profile Update & Preferences
**Goals**: Users can update profile; preferences (model choice default, explanation length, theme)

**UI**:
- Profile page: fields + avatar upload; preferences (toggles/selects)

**Backend/Data**:
- `/v1/profile` GET/PUT; `/v1/profile/preferences` GET/PUT
- Avatar upload (S3/Cloud storage later; local dev storage now)

**Acceptance**: Profile edits flow into assessment context; preferences affect default chat behavior

### Phase 7 — Reliability, Quality & Security
**Goals**: Error handling, validation, tests, rate limits, logs, OpenAPI coverage

**Backend**:
- Zod/Joi validators per route; central error handler
- Morgan (dev) + Winston/Pino (prod)
- `/v1/health`, `/v1/ready`
- OpenAPI spec for all endpoints

**Testing**:
- Backend: Jest + Supertest for assessment, sessions, modules, analytics
- Frontend: Testing Library for chat flow, assessment, history, study path, view-only
- E2E: Playwright "happy path"

**Acceptance**: 80%+ coverage on core; reproducible local/dev builds

### Phase 8 — Deployment & CI/CD
**Goals**: Dockerized services; GitHub Actions: lint/test/build; deploy (Render/Fly/EC2)

**Deliverables**:
- Dockerfiles (FE/BE), docker-compose.yml for local dev
- CI: run tests, build images, push to registry
- CSP headers, HTTPS, CORS allowlist per env

**Acceptance**: One-click local spin-up; main branch auto-builds; staging URL

### Phase 9 — Local LLM Migration (post-MVP)
**Goals**: Abstract provider; switch from Groq to local via env

**Backend**:
- `services/llmProvider.ts` with complete({messages, model, stream})
- Providers: groq, local (Ollama/LM Studio/vLLM)
- Add timeout/retries and token ceilings

**Acceptance**: Feature-flag switch; no FE changes needed beyond model selector options

## Data Model Additions

### User
```javascript
{
  _id,
  email(unique),
  passwordHash,
  name,
  avatarUrl,
  preferences: {
    defaultModel,
    explanationLength,
    theme
  },
  stats: {
    pointsTotal,
    gemsTotal,
    trophiesTotal
  }
}
```

### StudySession (extended)
```javascript
{
  _id,
  userId,
  learningStyle,
  modelUsed,
  topic,
  chatTitle,
  status,
  plan: [{
    id,
    title,
    status,
    progress,
    pointsAllocated
  }],
  points,
  gems,
  hasTrophy,
  progressPercent,
  isViewOnly,
  createdAt,
  updatedAt
}
```

### AnalyticsEvent
```javascript
{
  type,
  sessionId,
  userId,
  props,
  createdAt
}
```

## Cross-cutting Acceptance Checklist

- [ ] Auth flow works end-to-end; protected routes enforced
- [ ] `/chat` matches design; assessment ≤2 msgs; uses profile context
- [ ] Study Path in nav; progress + gamification update live
- [ ] History: resume, rename, archive; completed is view-only
- [ ] Analytics events tracked; summary + CSV export
- [ ] Errors handled; validators active; logs + health checks ready
- [ ] CI/CD, Docker, OpenAPI delivered
- [ ] LLM provider abstraction in place (Groq now, local later)

## Quick Starter Prompts

### Design system & base layout:
"Create tokens and a UI kit (Button, Input, Select, Tabs, Modal, Toast, Badge, Progress, Card, Avatar). Refactor /chat to use these components and match the current design structure described."

### Auth + Profile:
"Implement /v1/auth/* and /v1/profile with bcrypt + JWT cookies. Build Login/Signup/Profile pages and protect /chat behind auth."

### Assessment revamp:
"Add POST /v1/assessment returning a JSON envelope (topic, shortTitle, confidence, shouldAskClarifyingQ, proposedPlanSummary, replyText) using user profile + learningStyle; FE wires first message to start assessment and finalize in ≤2 messages."

### Study Path + Gamification:
"Move study path to Left Nav; implement module PATCH that updates progress, points/gems/trophy; toggle view-only on completion."

### History:
"Build history list with resume/rename/archive; completed opens read-only."

### Analytics:
"Add client track() and /v1/analytics/*; log events at key milestones; build Performance page with summary and CSV export."

### Quality & Deploy:
"Add validators, logs, health checks, OpenAPI, Docker, CI."

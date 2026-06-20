# Teach Section UX Audit & Guidelines

**Scope:** Instructor experience only: the Teach dashboard, course management/authoring, and course analytics (Insights), plus the instructor navigation that ties them together. Student-facing surfaces are out of scope for this pass.

**Date:** June 2026
**Reviewed build:** deployed instance `studyassist-iitl-keanu.web.app`, instructor account "Java Tutor" (2 courses, 40 students, CPS 1231 Mid/Full Semester), plus the brand-new-instructor empty state.

This revision drops findings deferred by the team (preview-as-student, onboarding rework, AI-edit diff, synthetic-data labeling, mobile nav) and folds in the team's answers to open questions. Code claims were checked against source; one earlier finding (course cards lacking keyboard support) was wrong and removed after verification. A new section near the end, **Pilot run**, adds a simulated instructor think-aloud against the Phase 2 study protocol and nine new findings (N1-N9) it surfaced.

---

## How this was assessed

Three specialist reviews ran against the codebase (instructor experience, data visualization, navigation/IA + design system), each grounded in actual files. Findings were then confirmed against the live deployed app by walking the instructor dashboard, a course's authoring page, its Insights page, and its Student Progress list plus a per-student Monitor page, at desktop and at 390px.

Every finding cites a file or a screen, usually both. Severity reflects instructor impact, not effort:

- **P0** breaks trust or risks data loss; fix before real classroom use.
- **P1** materially slows or misleads an instructor.
- **P2** polish, consistency, accessibility debt.

---

## Priority backlog (start here)

| # | Finding | Area | Severity | Effort |
|---|---------|------|----------|--------|
| 1 | "Modify" silently deletes all draft topics, warning shown only as helper text | Authoring | P0 | S |
| 2 | AI generate/modify gives no progress or cancel during the wait | Authoring | P0 | S |
| 3 | "Completion" means three different numbers across three screens (79% / 15% / 88.2%) | Analytics | P0 | S |
| 4 | Insights and Student Progress disagree on who's struggling (5 at-risk vs 2 struggling; per-student numbers conflict) | Analytics/IA | P1 | M |
| 5 | At-risk panel is a dead end: doesn't link to the Monitor/student page where you act | Analytics | P1 | S |
| 6 | Hot Signal card on course page renders one word per line (layout bug) | Dashboard | P1 | S |
| 7 | Course-structure tree auto-expands everything, burying charts under "no data" rows | Analytics | P1 | S |
| 8 | Heatmap encodes pass rate on a red-to-green scale (colorblind-unsafe) | Analytics | P1 | S |
| 9 | Sidebar omits Students and Insights; analytics buried 2-3 levels deep | Nav/IA | P1 | S |
| 10 | Cryptic rollup pills ("max 8", "ratio 2.1", "auto-advance") with no legend | Analytics | P2 | S |
| 11 | Raw error codes surfaced to instructors (e.g. "SYLLABUS_COVERAGE_SOURCES") | Authoring | P2 | S |
| 12 | Course badged "draft" while its topics are published and 20 students are enrolled | Authoring/Status | P2 | S |
| 13 | Quiz Pattern (the key Task-4 control) is collapsed by default and easily missed (pilot N3) | Authoring | P1 | S |
| 14 | "Difficulty" vs Bloom "Cognitive level" collide; "apply" means two different things on one screen (pilot N4) | Authoring | P1 | S |
| 15 | Bloom levels truncated at "analyze"; evaluate/create missing, higher levels silently downgraded (pilot N5) | Authoring | P1 | S |
| 16 | Generate/Modify mode switch signalled only by a button color + label change (pilot N1) | Authoring | P1 | S |
| 17 | No analytics export for end-of-semester / accreditation reporting (pilot N9) | Analytics | P1 | M |
| 18 | No bulk approve/publish; a 15-topic course needs 15 individual approvals (pilot N7) | Authoring | P2 | M |

---

## A. Course management & authoring

### A1 (P0) "Modify" deletes draft work with no undo or confirmation
On the course page, the Topic Plan input runs a Modify that, server-side, calls `CourseTopic.deleteMany({ courseId, status: 'draft' })` before writing new drafts (`backend/routes/instructorRoutes.js:530` for generate, `:887` for modify). The only warnings are gray helper text under the box ("Modify replaces all draft topics... Approved/published topics are never changed") and an after-the-fact chat line ("Replaced N draft topics", line 899). There is no pre-action confirmation, no diff, no undo. An instructor who spent twenty minutes hand-tuning draft milestones can wipe them with one click and a vague prompt.

The microcopy is honest that approved and published topics are safe, which is good. But draft work is exactly what an instructor is actively shaping. **Fix:** before deletion, show a modal listing the topic titles about to be replaced; keep replaced drafts as `archived` for 24h so "undo" is real.

### A2 (P0) AI generation gives no progress feedback
Generate and Modify fire LLM calls that take at least ~5 seconds (team-confirmed; a server timeout is configured, and the generator can run twice because of the syllabus-coverage auto-retry in `instructorRoutes.js`). The UI shows only a spinner with "Thinking…" (`InstructorCourseDetailPage.jsx`). No staged status, no elapsed time, no cancel. Five-plus seconds of a frozen "Thinking…" reads as a stall, and instructors who assume failure retry, which triggers duplicate generations and more draft churn (see A1). **Fix:** stream named stages ("Reading syllabus", "Drafting topics", "Validating coverage"), show an elapsed timer, and add Cancel. The timeout is a backstop, not feedback.

### A3 (P2) Error codes leak to the instructor
Failures surface as raw strings like `Error: SYLLABUS_COVERAGE_SOURCES` or "Generated plan failed validation" (`InstructorCourseDetailPage.jsx` catch block, 422s from `instructorRoutes.js`). These tell an instructor nothing. **Fix:** map known codes to plain guidance, e.g. "Mark at least one uploaded file as 'Syllabus', then try again."

### A4 (P2) Status model is confusing: course "draft" while topics are "published"
The course header badges the course **draft** while its topics are **published**, with 20 enrolled and 76 sessions recorded (seen live on CPS 1231-Mid Semester). A draft course with published topics and active students is a contradiction in plain terms. The practical cost: an instructor can't tell from the badge whether the course is live to students, whether new students can still join, or what flipping the course out of draft would even change, since topics are already published and being used. Decide what the course-level status actually controls (enrollment? visibility? nothing once topics publish?), label it for that, and either reconcile it with topic status or drop the course-level draft badge once any topic is live.

---

## B. Course analytics (Insights)

### B1 (P0) "Completion" is three different numbers
The same course, CPS 1231-Mid Semester, shows:
- Dashboard card: **79% Avg. Completion**
- Course header: **88.2% Completion**
- Insights KPI: **15% Fully complete** (3 of 20)

Three screens, one word, three definitions. `InstructorDashboardPage.jsx:111` computes "Avg. Completion" as completed sessions over total sessions, which is not course completion at all. An instructor reading "79% complete" will believe most students finished the content. **Fix:** name each metric for what it measures ("Session completion", "Students fully complete", "Avg topic progress") and use one consistent definition for the headline number across all three surfaces.

### B2 (P1) At-risk panel is a dead end
The "Students flagged as at-risk" panel lists students with useful flags (Nia Singh 20% quiz avg, LOW QUIZ SCORE; Amara Das 47.6% pass, LOW PASS RATE + MANY RETRIES). None of the rows link anywhere or offer an action (`InstructorInsightsPage.jsx` AtRiskPanel). The destination already exists: Student Progress → Monitor opens a per-student page with last-active, an inactivity badge, per-topic progress, session replay, and tagged instructor notes. The at-risk panel just doesn't connect to it. Detection with no path to act is wasted. **Fix:** link each at-risk row to that student's Monitor page, pre-seeded with the flags; add a "flag for follow-up" action.

### B3 (P1) The course tree auto-expands and buries the charts
On Insights, the "Course structure with attempt rollups" tree renders every module and milestone expanded by default. With 15 topics, most in draft and showing "no data" / "no quiz data", the instructor scrolls past dozens of empty rows to reach the heatmap and at-risk panel below. **Fix:** collapse to module level by default, hide or fold zero-data drafts, and let the instructor expand on demand.

### B4 (P1) Heatmap is red-to-green only
The topic-by-student heatmap colors pass rate from red (Nia Singh 20%) through yellow to green (`TopicStudentHeatmap.jsx`, hardcoded hex). Red and green are the classic pair that ~8% of male users can't separate. The percentage text on each cell is a partial mitigation, but color is doing the primary work and the empty "–" cells add noise. **Fix:** switch to a colorblind-safe diverging palette (blue-to-orange) and keep the numeric label; pull colors from design tokens rather than inline hex.

### B5 (P1) KPI strip conflates and truncates
The Insights KPI strip shows "IN PROGRESS 3" with subtext "14 partly done", which are two different funnel stages stated as one tile (the funnel just below correctly separates In progress 3 from Partly done 14). "HARDEST MODULE" truncates to "Introduction to Computer…" with no full label on hover. **Fix:** align the in-progress tile with the funnel definition, and show the full module name on hover or wrap it.

### B6 (P2) Score distribution measures two things at once
The chart openly labels itself "Mixed: some students bucketed on quiz-score mean, others on session points (no quiz data)" (`ScoreDistributionChart.jsx`). A student in the 90-100 bucket might have never taken a quiz. The disclaimer is small gray text above a bold chart, easy to miss. **Fix:** either refuse to render in mixed mode with a clear message, or split into two clearly-labeled series; relabel the axis away from score ranges when buckets are participation-based.

### B7 (P2) Rollup pills are unexplained jargon
Tree rows show pills like `max 8`, `ratio 2.1`, `2 auto-advance`, `93.8% quiz pass` with no legend (`CourseTreeView.jsx`). A new instructor cannot tell what "ratio 2.1" or "max 8" means. **Fix:** add a one-line legend or hover definitions; spell out "auto-advanced" with a short explanation, since it's an important and unintuitive signal.

### B8 (data integrity) Contradictory at-risk stats
Nia Singh's at-risk card reads "20% quiz avg · 3 attempts · 100% pass". With a 60% passing threshold (team-confirmed), a 20% average should not pass at all, yet the card shows 100% pass and a LOW QUIZ SCORE flag. Cross-checking against Student Progress, the same student shows "0% quiz pass" and an instructor note "Did not perform the quiz", so the Insights "100% pass" is the wrong figure. Worth tracing the quiz-average and pass calculations; the threshold is known (60%), the averaging is not.

### B9 (P1) Insights and Student Progress are two disconnected directions that disagree
The instructor has two surfaces about the same students that don't reconcile.

- **Counts disagree.** Insights and the dashboard card report **5 at-risk**; Student Progress reports **2 struggling** for the same course (CPS 1231-Mid Semester). They use different criteria (Insights: low quiz score, low pass rate, many retries; Student Progress: a quiz-pass threshold) and never say so. An instructor who trusts "2 struggling" misses three students Insights flagged.
- **Per-student numbers disagree.** Nia Singh is "20% quiz avg · 100% pass" on Insights but "0% quiz pass" on Student Progress and her detail page. The 0% matches her note ("Did not perform the quiz") and "Inactive 80d", so Insights is showing a wrong number for the same person.
- **They don't hand off.** Insights identifies struggling students but doesn't link to the place you act (the Monitor/detail page, which lives under Student Progress). The cohort view and the per-student view run in parallel instead of as one flow.
- **Inconsistent naming.** The same idea is "at-risk" on Insights and "struggling" on Student Progress; the entry points are a "Students" button (on Insights) and a "Student Progress" row (on the course page). Three labels for one object.

The split itself is fine and standard: Insights answers "where are the problems across the class," Student Progress answers "what's going on with this student and what do I do." Per-student functionality is genuinely good (session replay, inactivity badge, tagged notes). The problem is coherence: the two views report different numbers, use different words, and don't link. **Fix:** one definition and one label for "struggling/at-risk", computed once and shown identically on both; make Insights at-risk rows and the dashboard "AT-RISK N" deep-link into Student Progress filtered to those students; align the headline counts.

---

## C. Instructor dashboard & navigation

### C1 (P1) Hot Signal card breaks layout
On the course page, the "Hot Signal" panel is squeezed into the leftover width beside four fixed-width KPI cards, so its text wraps one or two words per line ("Amara / Das is / at risk / with a / 47.6% …"). Seen live on CPS 1231-Mid Semester. It reads as broken. **Fix:** give the signal its own full-width row below the KPI cards, or cap the KPI cards and let the signal take a sensible min-width.

### C2 (P1) Sidebar omits Students and Insights
`InstructorShell.jsx` `NAV_ITEMS` is only Dashboard and Courses. Students and Insights pages exist and are fully built, but reachable only by drilling into a course. There's also no active-state continuity: on Insights the sidebar highlights nothing, so the instructor loses their sense of place. The same course is also reachable two ways from the dashboard (card body for authoring, "Insights →" chiplet for analytics), which splits one mental object into two entry points. **Fix:** surface Build and Insights as tabs within a course context, and keep the sidebar's Courses item active across both.

### C3 (P2) Empty and low-data dashboard
The brand-new-instructor empty state is mostly good: the briefing degrades to "You don't have any courses yet, create one to start seeing insights," and the Your Courses area explains what data will appear. Two gaps. First, the empty state tells the instructor to "Create a course from the New course button," but no such button is on the dashboard (course creation lives on the Courses page); either add a New course button here or fix the copy. Second, once courses exist, the dashboard leaves most of the viewport empty below two cards while the genuinely useful "Today's briefing" sits mid-page. Consider surfacing at-risk counts and recent activity on the dashboard itself.

---

## UX guidelines for the Teach section

Principles to apply going forward, each tied to findings above.

**1. Destructive and slow AI actions need status and a way back.** Anything that deletes or overwrites instructor work gets a confirmation plus an undo path. Any LLM call over ~2 seconds gets staged progress, an elapsed timer, and a cancel. Treat the instructor's hand-edits as precious; treat AI output as a draft a human approves. (A1, A2)

**2. One metric, one name, one definition.** A word like "completion" must mean the same thing on every screen, computed one way. If you need three measures, give them three names. Label every chart axis with its unit, and never reuse a score-range axis for participation data. (B1, B5, B6)

**3. Insight must connect to action.** Every at-risk flag, hot signal, and hard milestone links to the place where the instructor can act: open the student, edit the topic, adjust difficulty. An analytics screen that only describes is half-built. (B2)

**4. Progressive disclosure for dense structure.** Default to the overview (collapsed modules, top-level KPIs), reveal detail on demand. Don't make instructors scroll past dozens of empty rows to reach the chart that matters. (B3)

**5. Speak the instructor's language; explain the system's.** No raw error codes, no unlabeled metrics. "auto-advanced", "ratio", "max" get plain names or inline definitions. Error messages say what to do next. (A3, B7)

**6. Accessible and consistent by default.** Colorblind-safe palettes with a non-color cue (text or pattern) on every data color. Tokens, not inline hex, so color and contrast are fixable in one place. One icon language across the section. (B4, C1)

**7. Label research data while it's in the build.** The synthetic cohort stays for the study, which is fine. While it's live, keep the toggle and consider a small "includes synthetic" marker on blended numbers, and plan to default to real-only once the study ends.

---

## What's working well

The grounded AI layer is a real strength. "Today's briefing" and the Insights cards degrade gracefully when the LLM fails or when there's no data (`degraded: true` fallbacks, and the empty-state briefing), and the analytics agent is scope-guarded: it checks course ownership before every tool call and is told to ground each claim in a tool result (`instructorInsightsAgent.js`). That is a sound trust foundation.

The completion funnel is a model chart: horizontal bars with inline "N (X%)" labels, readable at a glance without hovering. The quiz-by-topic table sorts hardest-first and de-emphasizes zero-attempt topics, which is the right instinct for an instructor deciding where to intervene. The syllabus-coverage guardrail (validate that generated topics reference uploaded files, auto-retry once) prevents silent gaps. Student session replay down to the quiz-answer level, with course-scoped notes, is more granular than what Canvas or Moodle give natively. The status lifecycle (draft → approved → published) is consistently color-coded and protects approved and published topics during regeneration. Course cards on the dashboard are keyboard-operable (Enter/Space plus a focus ring), which is easy to get wrong and was done right.

Most of the work above is connecting and clarifying what already exists, not rebuilding.

---

## Pilot run: simulated instructor think-aloud (June 2026)

**What this is.** A simulated dry-run of the Phase 2 study protocol (`Phase2_IRB_Submission`), used to pre-test the task set and surface likely confusion before real participants. It is **synthetic, not real participant data.** One persona (a CS teaching professor, ~12 years on CPS 1231) was walked through the five think-aloud tasks (create course, upload Java syllabus, generate + modify topics, set quiz patterns, publish), then the mid- and full-semester dashboard interpretation, then the eight interview questions, all grounded in the live `studyassist-iitl-keanu` UI. Treat the findings as hypotheses to confirm with the 5-10 faculty, not as results.

**Headline.** Estimated SUS ≈ 51 (below the ~68 average). Every task was completed, but most "with difficulty." Cognitive load peaked on Task 3 (modify), Task 4 (quiz patterns), and dashboard interpretation. The biggest trust-breakers were the conflicting numbers: three different "completion" figures and the at-risk count disagreeing with Student Progress (5 vs 2). The clearest wins were the per-student Monitor page and the completion funnel. The interview answers landed on a consistent theme for RQ2: the instructor will not sign off on AI output she cannot review (generated quiz questions are set by "pattern" but never shown; topic Modify and AI Edit apply with no diff).

**New findings the pilot surfaced (not in the audit above).** Use these IDs to track.

| ID | Finding | Task | Severity | Fix |
|----|---------|------|----------|-----|
| N1 | Generate → Modify is a mode switch on the same input, signalled only by a button color (purple→amber) and label change. The participant nearly ran a destructive Modify without noticing the mode. | T3 | High | Make the mode explicit (a labeled toggle or separate actions); pairs with A1's pre-action confirmation. |
| N2 | Marking an uploaded file as "Syllabus" has no explained effect. The participant couldn't tell if it changes generation. | T2 | Med | One-line helper text on what the Syllabus marker controls. |
| N3 | Quiz Pattern, the primary Task-4 control, is collapsed by default and was nearly missed. | T4 | High | Expand by default, or badge the module card when a non-default pattern is set. |
| N4 | Three difficulty-ish scales on one screen: module "Difficulty" (Intro/Core/Apply), quiz "Difficulty mix" (Easy/Medium/Hard), and Bloom "Cognitive level" (Remember/Understand/Apply/Analyze). "Apply" is both a module tier and a Bloom level. Verified: `DIFFICULTIES` and `COGNITIVE_LEVELS`, InstructorTopicEditorPage.jsx:5 and :12. (Casing is actually consistent once rendered, so I dropped that earlier sub-claim.) | T4 | High | Rename module tiers off Bloom verbs (e.g. Foundational/Core/Advanced); keep one "difficulty" meaning per screen. |
| N5 | Bloom dropdown stops at "analyze"; evaluate and create are absent, and higher levels submitted by the generator are silently downgraded to "understand". Programming courses need "create". | T4 | High | Offer all six Bloom levels, or state the supported range and why; never silently downgrade. |
| N6 | Difficulty mix (Easy/Medium/Hard %) has three inputs with no running total or sum-to-100 validation. | T4 | Med | Show a live total and flag when it isn't 100. |
| N7 | No bulk approve/publish: a 15-topic course needs 15 individual approvals. Flagged as unrealistic at course scale. | T5 | Med | Select-all / "approve reviewed" bulk action. |
| N8 | "Delete course" sits in the primary header row next to "View insights" (InstructorCourseDetailPage.jsx:364-377). Correction after reading the code: it IS guarded by a `window.confirm` with a clear warning (line 320), so the risk is lower than the pilot persona assumed. Remaining issue is placement next to a nav link, and a basic confirm() vs typed confirmation for an irreversible action. | T1 | Low | Move out of the primary action row; consider typed confirmation. |
| N9 | No export of course analytics. The participant expected this for departmental/accreditation reporting. Note the asymmetry: the student Performance page has an "Export CSV" button, but no instructor analytics page (dashboard, insights, student progress) does. | Dashboard | High | CSV/PDF export of course and per-student analytics. |
| N10 | The quiz pattern's question-type mix (conceptual/applied/recall/analytical, with weights) lives in the data model and is sent to the generator, but has NO UI: `QUESTION_TYPES` is defined (InstructorTopicEditorPage.jsx:13) and stored per module (line 34), yet `QuizPatternSection` (lines 78-156) never renders it. Instructors can't shape question types though the field exists. | T4 | Med | Add a question-type weighting control, or remove the dead field. |

**Existing findings the pilot independently reproduced** (this strengthens them): A1, A2, A4, B1, B3, B4, B5, B6, B7, B8, B9, C1, C3, and especially B2 (the at-risk panel as a dead end was a top frustration).

**Deferred items the pilot pushed back on.** You set these aside earlier; the pilot suggests two deserve a second look:

- **Synthetic-data labeling** (was B2-synthetic, deferred). The participant interpreted blended real+synthetic numbers before noticing the default-on checkbox, then reacted strongly ("shouldn't fake data be opt-in?"). Nuance from the code: the heatmap already badges synthetic students per row with a "syn" tag (TopicStudentHeatmap.jsx:54-61), so labeling isn't absent everywhere. The gap is the aggregate KPI figures (Total Students, Completion, at-risk counts), which carry no synthetic marker beyond the checkbox. Protocol-fidelity angle: IRB section 5.3 says the synthetic data is "clearly identified as simulated," and the aggregate numbers don't meet that. Worth closing before sessions, for usability and to match what the IRB approved.
- **AI-edit diff / review** (deferred) and **preview-as-student** (deferred) both came up unprompted in the interview as conditions for adoption.

**Caveat.** This is a model-generated walkthrough. It's good for catching obvious confusion and tightening the task script; it cannot stand in for the real faculty sessions, and the SUS/TLX figures are estimates, not measurements.

---

## Clarified by the team (June 2026)

- **Generation latency:** a server timeout is in place; generating topics takes at least ~5s. Still needs progress feedback and cancel (A2). The timeout prevents an infinite hang but isn't user-facing.
- **Synthetic cohort:** intentional for the current research study; the synthetic portion will be removed when the study concludes. Labeling guidance kept as a light principle (guideline 7), the toggle behavior is accepted as-is for now.
- **Passing threshold:** 60%. This sharpens B8: a 20% average flagged as 100% pass is a real inconsistency to trace. How "quiz average" is computed is still open.
- **Unpublishing a topic:** enrolled students lose the topic from their course; it moves to the general topic list. This is a silent change from the student's side. Consider warning the instructor at unpublish time when a topic has active students, and deciding whether students should be notified.
- **New instructor signup:** account creation offers a role choice; instructors enter an institution-provided registration code (`INSTRUCTOR_SIGNUP_SECRET`). A brand-new instructor lands on the empty dashboard that prompts course creation. Empty state is handled; see C3 for the "New course button" copy gap.

## Still open

- How is "quiz average" computed such that a 20% average coexists with a 100% pass rate under a 60% threshold? (B8)

---

## UI-level fixes (code-grounded)

Yes, most of the top findings are concrete UI changes, and most are small. These were checked by reading the components, not inferred. File and line refs are exact at the time of review.

| Finding | File : line | Now | Change |
|---|---|---|---|
| N3 Quiz Pattern hidden | InstructorTopicEditorPage.jsx:79 | `useState(false)` (collapsed) | default `true`, or badge the module card when a non-default pattern is set |
| N5 Bloom truncated | InstructorTopicEditorPage.jsx:12 | 4 of 6 levels | add `'evaluate','create'` — backend already accepts all 6 (instructorRoutes.js:88) |
| N4 difficulty/Bloom collision | InstructorTopicEditorPage.jsx:5-6, :12 | module tiers reuse "Apply" | rename module tiers off Bloom verbs |
| N6 no sum-to-100 | InstructorTopicEditorPage.jsx:84-87, 126-141 | per-field clamp only | show running total; warn when not 100 |
| N10 question-type mix has no UI | InstructorTopicEditorPage.jsx:13, 34, 78-156 | field exists, never rendered | add weighting control, or remove the dead field |
| AI Edit no diff | InstructorTopicEditorPage.jsx:290-348 | "Applied successfully", no diff | before/after review (deferred) |
| B4 heatmap red-green | TopicStudentHeatmap.jsx:3-11 | hardcoded green→red hex ramp | colorblind-safe ramp + legend (cells already have hover tooltips and a "syn" badge) |
| B1 "completion" = 3 numbers | InstructorDashboardPage.jsx:111,159 · InstructorCourseDetailPage.jsx:396 · insights fully-complete | sessions-based vs `completionRate` vs fully-complete, all labeled "Completion" | one definition; relabel the dashboard tile "Session completion" |
| B2 at-risk dead end | InstructorInsightsPage.jsx:58-70 (AtRiskPanel) | rows render, no link | wrap each row in a Link to the student detail / Monitor page (it exists) |
| C1 Hot Signal one-word-per-line | InstructorCourseDetailPage.jsx:392-402 (1/3 column) + HotSignalCard.jsx:50,72 (inline shrink-0 CTA) | narrow column plus inline CTA squeezes the text | give the signal its own full-width row, or stack the CTA under the text |
| N8 Delete course | InstructorCourseDetailPage.jsx:320 (confirm exists), 364-377 (placement) | guarded by window.confirm; sits next to "View insights" | relocate from the primary row; consider typed confirmation |
| A1 Modify wipes drafts | InstructorCourseDetailPage.jsx:272,284,546,551 + instructorRoutes.js:530,887 | auto mode, post-hoc warning, no undo | confirm-before-replace listing the titles; keep replaced drafts archived for undo |
| B3 tree auto-expands | CourseTreeView.jsx | every module/milestone expanded | collapse to module level by default |

Quick wins (one-liners or near): N3 (default-open), N5 (two array entries), B1 (relabel), B2 (wrap rows in a link), C1 (move one card to its own row). The heavier ones are A1 (confirm + undo flow), N10 (new control), and B1's deeper fix (reconcile the metric definitions across pages, which touches the backend too).

# Teach Section UX Audit & Guidelines

**Scope:** Instructor experience only: the Teach dashboard, course management/authoring, and course analytics (Insights), plus the instructor navigation that ties them together. Student-facing surfaces are out of scope for this pass.

**Date:** June 2026
**Reviewed build:** deployed instance `studyassist-iitl-keanu.web.app`, instructor account "Java Tutor" (2 courses, 40 students, CPS 1231 Mid/Full Semester), plus the brand-new-instructor empty state.

This revision drops findings deferred by the team (preview-as-student, onboarding rework, AI-edit diff, synthetic-data labeling, mobile nav) and folds in the team's answers to open questions. Code claims were checked against source; one earlier finding (course cards lacking keyboard support) was wrong and removed after verification. A new section near the end, **Pilot run**, adds a simulated instructor think-aloud against the Phase 2 study protocol and nine new findings (N1-N9) it surfaced. Section **D. Pilot-prep iteration (late June 2026)** at the bottom documents the six ships (D1–D6) that responded to the real 6/22–6/24 faculty pilot feedback, including status updates on B2, B7, and B9.

## Status legend

- **(shipped)** — implemented, deployed, verified on `studyassist-iitl-keanu.web.app`.
- **(in progress)** — work in flight or queued for this week.
- **(pre-pilot)** — to ship before the 6/22–6/24 faculty pilot.
- **(post-pilot)** — defer until after the pilot validates priority.
- **(deferred)** — explicitly out of scope for this study cycle.

Default if unmarked: a backlog item not yet scheduled.

---

## How this was assessed

Three specialist reviews ran against the codebase (instructor experience, data visualization, navigation/IA + design system), each grounded in actual files. Findings were then confirmed against the live deployed app by walking the instructor dashboard, a course's authoring page, its Insights page, and its Student Progress list plus a per-student Monitor page, at desktop and at 390px.

Every finding cites a file or a screen, usually both. Severity reflects instructor impact, not effort:

- **P0** breaks trust or risks data loss; fix before real classroom use.
- **P1** materially slows or misleads an instructor.
- **P2** polish, consistency, accessibility debt.

---

## Priority backlog (start here)

| # | Finding | Area | Severity | Status |
|---|---------|------|----------|--------|
| 1 | "Modify" silently deletes all draft topics | Authoring | P0 | **(shipped)** confirmation modal lists draft titles before replace |
| 2 | AI generate/modify gives no progress or cancel | Authoring | P0 | **(shipped)** staged status text + elapsed (m:ss) counter; cancel deferred |
| 3 | "Completion" means three different numbers | Analytics | P0 | **(shipped)** Dashboard + CourseDetail relabelled to "Session completion"; tooltips added; Insights "Fully complete" untouched |
| 4 | Insights and Student Progress disagree | Analytics/IA | P1 | **(shipped)** cohort level via Risk Insights v2 (D1); per-student `pass` label rename deferred (D6 deferred note) |
| 5 | At-risk panel is a dead end | Analytics | P1 | **(shipped)** at-risk rows now link to Monitor with flag context |
| 6 | Hot Signal one word per line | Dashboard | P1 | (post-pilot) |
| 7 | Course tree auto-expands | Analytics | P1 | **(partially shipped)** friction section collapsed by default via IA redesign (D2); per-module tree collapse still open |
| 8 | Heatmap red-to-green | Analytics | P1 | (post-pilot) |
| 9 | Sidebar omits Students and Insights | Nav/IA | P1 | (post-pilot) |
| 10 | Cryptic rollup pills | Analytics | P2 | **(shipped)** legend + tooltips + one label correction (D6) |
| 11 | Raw error codes | Authoring | P2 | (post-pilot) |
| 12 | Course "draft" with topics published | Authoring | P2 | (post-pilot) |
| 13 | Quiz Pattern collapsed by default | Authoring | P1 | **(shipped)** opens expanded; collapse-on-click preserved |
| 14 | Difficulty vs Bloom "apply" collision | Authoring | P1 | (post-pilot) |
| 15 | Bloom truncated at "analyze" | Authoring | P1 | **(shipped)** dropdown now has all six levels |
| 16 | Generate/Modify mode signalled only by color | Authoring | P1 | (post-pilot) — partially mitigated by the new Modify confirmation modal |
| 17 | No analytics export | Analytics | P1 | (post-pilot) |
| 18 | No bulk approve/publish | Authoring | P2 | (post-pilot) |
| – | Dead-zone scroll on instructor pages | UX/Layout | P1 | **(shipped)** outer scroll container + inner max-w split on Courses, Course Detail, Topic Editor |

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

### B1 (shipped) "Completion" was three different numbers, now relabelled

The same course, CPS 1231-Mid Semester, used to show 79% on the dashboard, 88.2% on the course header, and 15% on Insights, all under the word "Completion." All three numbers were correct for what they actually measured; the names lied. The dashboard tile and the course header both compute completed sessions divided by total sessions (`analyticsService.js:55`), so both are now labelled **"Session completion"** with tooltips defining the metric. Insights "Fully complete" was already accurate and is untouched. Deployed and verified June 2026.

### B2 (shipped) At-risk panel is a dead end
The "Students flagged as at-risk" panel listed students with useful flags (Nia Singh 20% quiz avg, LOW QUIZ SCORE; Amara Das 47.6% pass, LOW PASS RATE + MANY RETRIES). None of the rows linked anywhere or offered an action (`InstructorInsightsPage.jsx` AtRiskPanel). The destination already exists: Student Progress → Monitor opens a per-student page with last-active, an inactivity badge, per-topic progress, session replay, and tagged instructor notes. The at-risk panel just didn't connect to it. Detection with no path to act is wasted.

**Shipped in the pilot-prep iteration:** at-risk rows now link to Monitor with flag context passed through. See section D for the containing batch.

### B3 (P1) The course tree auto-expands and buries the charts
On Insights, the "Course structure with attempt rollups" tree renders every module and milestone expanded by default. With 15 topics, most in draft and showing "no data" / "no quiz data", the instructor scrolls past dozens of empty rows to reach the heatmap and at-risk panel below. **Fix:** collapse to module level by default, hide or fold zero-data drafts, and let the instructor expand on demand.

### B4 (P1) Heatmap is red-to-green only
The topic-by-student heatmap colors pass rate from red (Nia Singh 20%) through yellow to green (`TopicStudentHeatmap.jsx`, hardcoded hex). Red and green are the classic pair that ~8% of male users can't separate. The percentage text on each cell is a partial mitigation, but color is doing the primary work and the empty "–" cells add noise. **Fix:** switch to a colorblind-safe diverging palette (blue-to-orange) and keep the numeric label; pull colors from design tokens rather than inline hex.

### B5 (P1) KPI strip conflates and truncates
The Insights KPI strip shows "IN PROGRESS 3" with subtext "14 partly done", which are two different funnel stages stated as one tile (the funnel just below correctly separates In progress 3 from Partly done 14). "HARDEST MODULE" truncates to "Introduction to Computer…" with no full label on hover. **Fix:** align the in-progress tile with the funnel definition, and show the full module name on hover or wrap it.

### B6 (P2) Score distribution measures two things at once
The chart openly labels itself "Mixed: some students bucketed on quiz-score mean, others on session points (no quiz data)" (`ScoreDistributionChart.jsx`). A student in the 90-100 bucket might have never taken a quiz. The disclaimer is small gray text above a bold chart, easy to miss. **Fix:** either refuse to render in mixed mode with a clear message, or split into two clearly-labeled series; relabel the axis away from score ranges when buckets are participation-based.

### B7 (shipped) Rollup pills are unexplained jargon
Tree rows showed pills like `max 8`, `ratio 2.1`, `2 auto-advance`, `93.8% quiz pass` with no legend (`CourseTreeView.jsx`). A new instructor could not tell what "ratio 2.1" or "max 8" meant.

**Shipped in the pilot-prep iteration** as D6: two-sentence legend row above the tree, native `title` tooltips on every badge, and one label correction (module `attempt pass` → `student pass`, since the badge was computing student-level despite the label claiming attempt-level). See section D6 for the deferred cross-app terminology follow-up ("pass" still means two different things on Course Structure vs Student Progress).

### B8 (shipped) At-risk row conflated two different data sources under "quiz" labels

The original audit framed this as "Nia Singh's 20% quiz average coexists with a 100% pass rate, trace why." The trace surfaced a different root cause than expected: the at-risk row was rendering **quiz** average (from `Session.quizAttempts`) next to **milestone** attempt count and pass rate (from `MilestoneAttempt`) under unified "quiz" labels. Each number was individually correct; they just measured different objects.

`getAtRiskStudents` in `backend/services/milestoneAnalyticsService.js` now derives quiz average, quiz pass rate, and quiz attempt count from the same submitted, non-revision quiz-attempt set. When that set is empty, all three render as "No quiz data" instead of defaulting to misleading numbers.

After the fix, every at-risk row is internally consistent. Verified across all 40 synthetic students: zero hard contradictions, zero threshold mismatches. Spot-check examples:

- Nia Singh: 32.2% avg · 27.8% pass · 18 attempts (was 20% / 100% / 3)
- Noah Yamamoto: 32.4% / 17.2% / 29
- Liam Adeyemi: 53.6% / 50% / 28
- 2 mid-sem students with no submitted quizzes → "No quiz data"

Deployed and verified June 2026. Note: this does **not** resolve B9, which is the same kind of source-conflation at the cohort and cross-surface level.

### B9 (partially shipped) Insights and Student Progress still disagree on counts and per-student metrics

B8 fixed the conflation **within** the at-risk row. The conflation **between** Insights and Student Progress as surfaces still exists, and the post-B8 spot check confirmed it:

- **Cohort counts disagree.** CPS 1231-Mid Semester: Insights flags **5 at-risk** (Nia, Noah, Ananya, Isabela, Budi all at LOW QUIZ SCORE), Student Progress flags **2 struggling**. Different thresholds and definitions, never reconciled, never named.
- **Per-student numbers disagree.** Nia Singh: Insights at-risk row reads "**27.8% quiz pass · 18 attempts**" (attempt-level pass rate across all submitted quiz attempts). Student Progress reads "**0% quiz pass**" (topic-level pass — Nia has passed zero of 15 topic gates). Both numbers are correct for what they measure, but they share the label "quiz pass."
- **No hand-off.** At-risk rows on Insights still don't link to the per-student Monitor page — see B2.
- **Inconsistent naming.** "At-risk" vs "struggling" still describe the same idea under different words.

This is the same B8 problem one layer up. Fix is: pick one definition of "at-risk / struggling" with an explicit threshold, compute it in one place on the backend, expose it via one endpoint, consume it identically on both surfaces. The per-student "quiz pass" label needs to disambiguate attempt-level vs topic-level — easiest fix is to call one of them by a different name (e.g. attempt pass rate vs topic pass rate).

**Partially shipped in the pilot-prep iteration:** the cohort-level definition mismatch is resolved by Risk Insights v2 (D1) — one continuous 0–100 score with weighted signals, computed in one place, consumed by both surfaces. The per-student label disambiguation (`pass` meaning attempt-level in one place and student-level in another) is queued as the deferred "unify pass terminology" follow-up in section D. See D1 and D6.

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

## Shipped pre-pilot (June 2026)

These items shipped to `studyassist-iitl-keanu.web.app` ahead of the 6/22–6/24 faculty pilot and are reflected in branch `pilot-prep`:

| Finding | Status |
|---|---|
| A1 — Modify wipes drafts | (shipped) confirmation modal listing draft titles |
| A2 — No AI progress feedback | (shipped) staged status + elapsed counter |
| B1 — Three definitions of "Completion" | (shipped) relabelled, tooltips added |
| B8 — At-risk row conflated two sources | (shipped) unified to one quiz-attempt set, "No quiz data" for empty |
| N3 — Quiz Pattern collapsed by default | (shipped) opens expanded |
| N5 — Bloom truncated at "analyze" | (shipped) all six levels in dropdown |
| Dead-zone scroll on instructor pages | (shipped) outer scroll + inner max-w split |

Still pre-pilot: **B9** (cohort + per-student metric reconciliation) and **B2** (at-risk panel link-out to Monitor).

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

| Finding | File : line | Status | Notes |
|---|---|---|---|
| N3 Quiz Pattern hidden | InstructorTopicEditorPage.jsx:79 | (shipped) | now `useState(true)` |
| N5 Bloom truncated | InstructorTopicEditorPage.jsx:12 | (shipped) | array extended with `'evaluate','create'` |
| N4 difficulty/Bloom collision | InstructorTopicEditorPage.jsx:5-6, :12 | (post-pilot) | rename module tiers off Bloom verbs |
| N6 no sum-to-100 | InstructorTopicEditorPage.jsx:84-87, 126-141 | (post-pilot) | running total + warn |
| N10 question-type mix no UI | InstructorTopicEditorPage.jsx:13, 34, 78-156 | (post-pilot) | render the field or remove it |
| AI Edit no diff | InstructorTopicEditorPage.jsx:290-348 | (deferred) | before/after review |
| B4 heatmap red-green | TopicStudentHeatmap.jsx:3-11 | (post-pilot) | colorblind-safe ramp |
| B1 "completion" = 3 numbers | several files | (shipped) | Dashboard + CourseDetail = "Session completion"; tooltips |
| B2 at-risk dead end | InstructorInsightsPage.jsx:58-70 | **(shipped)** | rows link to Monitor with flag context — see D |
| C1 Hot Signal layout | InstructorCourseDetailPage.jsx:392-402 + HotSignalCard.jsx:50,72 | (post-pilot) | full-width row or stacked CTA |
| N8 Delete course placement | InstructorCourseDetailPage.jsx:320,364-377 | (post-pilot) | relocate; typed confirmation |
| A1 Modify wipes drafts | InstructorCourseDetailPage.jsx:272,284,546,551 + instructorRoutes.js:530,887 | (shipped, frontend only) | confirmation modal lists draft titles; archived-for-undo deferred |
| B3 tree auto-expands | CourseTreeView.jsx | **(partially shipped)** | friction section collapsed by default via IA redesign (D2); per-module tree collapse still open |
| B7 rollup pill jargon | CourseTreeView.jsx | **(shipped)** | legend + tooltips + module label correction (D6) `aef133d` |
| D1 Risk Insights v2 | milestoneAnalyticsService.js `computeRiskScore` | **(shipped)** | continuous 0–100 score, four tiers, distribution + trend + filter chips |
| D2 Insights IA | InstructorInsightsPage.jsx + CollapsibleSection.jsx | **(shipped)** | three task-scoped sections (Who / How / Where) |
| D3 Course detail state-dependent layout | InstructorCourseDetailPage.jsx | **(shipped)** | single column setup / two-column functional, gated on `publishedCount > 0` |
| D4 Chat scroll containment | InstructorCourseDetailPage.jsx | **(shipped)** | scoped auto-scroll + mount scroll-to-top |
| D5 Insights Assistant | instructorInsightsAgent.js + baseAgent.js | **(shipped)** | iteration + token bump, partial-findings fallback, prompt rewrite, name→id grounding line `592caa6` |

Shipped in the pre-pilot cycle: N3, N5, B1, and A1's confirmation modal (archived-for-undo still pending). Shipped in the pilot-prep iteration (see section D): B2 rows link to Monitor, B7 legend + tooltips + module label correction, D1 Risk Insights v2 (closes B9 at cohort level), D2 Insights IA redesign, D3 course detail state-dependent layout, D4 chat scroll containment, D5 Insights Assistant fixes. Remaining quick wins: C1 (move one card to its own row). Heavier: N10 (new control) and the cross-app "pass" terminology unification (deferred follow-up in section D). Design track (live audit → UX critique doc → mock alternatives) queued as the next batch after `pilot-prep` reconciles into `main`.

---

## D. Pilot-prep iteration (late June 2026)

**Scope:** work landed on `pilot-prep` between the 6/22–6/24 faculty pilot dry-runs and the start of the real study, in response to pilot feedback and to earlier open items (B2, B7, B9). Six ships across risk analytics, page IA, course detail layout, chat behavior, the Insights Assistant, and the Course Structure card. All deployed to `studyassist-iitl-keanu.web.app`; `main` ← `pilot-prep` reconciliation is still standing.

**Feedback that drove the batch.** Three clusters surfaced during the pilot:

1. The Insights Assistant misbehaved. Cleared conversations felt like they carried prior context (later diagnosed as an iteration-limit hard failure being misread as context leak). Responses recited raw fields with no interpretation, printed ISO timestamps, truncated mid-sentence, and hard-failed on named-student questions ("does Budi need a tutor?") because the agent couldn't resolve names to IDs.
2. The Course Structure card's badges (`max`, `ratio`, `attempt pass`, `auto-advance`) were opaque to first-time viewers.
3. The Insights page was still visually dense, and the course detail page landed mid-scroll on functional courses.

Six items shipped in response.

### D1 (shipped) Risk Insights v2 — continuous scoring model

Replaced the binary at-risk / not-at-risk flag with a continuous 0–100 risk score computed as `100 × (0.40 × engagement + 0.30 × pass_rate + 0.20 × quiz_score + 0.10 × struggle)` in a pure `computeRiskScore` function with a `cutoffDate` parameter (`backend/services/milestoneAnalyticsService.js`). Six adjustments (R1–R6, Q2–Q3) tune the score for edge cases. Tiers: Critical (70+), High (40–69), Watch (20–39), Healthy (below 20).

The instructor-facing card shows a distribution across the four tiers, filter chips (Critical / High / Watch), a class-context override for instructors who want to see everyone regardless of tier, and a 30-day trend line.

Addresses B9 at the cohort level: the "5 at-risk vs. 2 struggling" divergence between Insights and Student Progress had one root cause — two surfaces computing distinct thresholds. The risk score provides one source of truth, exposed via one endpoint. Per-student label disambiguation (`attempt pass` vs. `topic pass`) is still queued (see Deferred below).

### D2 (shipped) Insights page IA redesign

The Insights page was one long scroll dumping the at-risk panel, KPI strip, funnel, course tree, heatmap, and score distribution all at once. Reshaped into task-scoped sections wrapped in a reusable `CollapsibleSection` component (`frontend/my-app/src/components/instructor/CollapsibleSection.jsx`):

- **Who needs help?** — Risk Insights v2 card + at-risk table (open by default)
- **How's the class doing?** — KPI strip + completion funnel + score distribution (open by default)
- **Where's the friction?** — Course structure tree + heatmap (collapsed by default)

Progressive disclosure means an instructor lands on the two most actionable sections without scrolling past dense structural detail. Reinforces guideline 4 (progressive disclosure for dense structure) and partially closes B3 (course tree auto-expand buried the charts) by defaulting the friction section to collapsed.

### D3 (shipped) Course detail two-column + state-dependent layout

The course detail page previously ran single-column with the Topics list at the bottom. On functional courses this pushed the primary work surface below setup tools that had done their job. A two-column rework moved Topics to a wide left column (`lg:col-span-2`) and stacked AI Instructions, Course Materials, Topic Plan Chat, and Student Progress in a right rail (`lg:col-span-1`), with the container widened from `max-w-4xl` to `max-w-7xl`.

That fix read wrong on brand-new empty courses, where the empty Topics list dominated the wide column while the actual setup workspace was squeezed into the narrow rail. A follow-up state-dependent layout gates the two-column behind `publishedCount > 0`:

- `publishedCount === 0` (setup mode) → single column, `max-w-4xl`, order: Header, KPIs, Student Progress, AI Teaching Instructions, Course Materials, Topic Plan Chat, Topics list last.
- `publishedCount > 0` (functional mode) → two-column, `max-w-7xl`.

The transition happens at publish-first-topic. Drafts alone keep the course in setup; unpublishing all topics flips back. Implementation keeps the cards in one place and toggles wrapper classes only, so functional mode is byte-identical to the two-column layout that shipped in the first PR.

### D4 (shipped) Chat scroll containment fix

The Topic Plan Chat's `scrollIntoView(chatEndRef)` was scrolling every ancestor scroll container, including the page wrapper (`h-full overflow-y-auto`). On any `chatMessages` change the page viewport was pulled down to the chat's position, landing the instructor mid-scroll rather than at the top. Two overflow-y-auto ancestors were tangled in the same scroll pull.

Fix scopes the auto-scroll to the chat's own container via `closest('.chat-history-scroll')` → `scrollTop = scrollHeight`. Added `window.scrollTo({ top: 0, behavior: 'instant' })` on mount to handle browser scroll-restoration edge cases. Course detail page now reliably lands at the top on navigation; chat still sticks to its latest message internally.

Side effect: refreshing mid-scroll on the course detail page now re-lands at the top instead of restoring the previous position. Intentional.

### D5 (shipped) Insights Assistant fixes

Four coordinated changes to the Insights Assistant (`backend/agents/instructorInsightsAgent.js` and `backend/agents/framework/baseAgent.js`), commit `592caa6`.

**Clear button verified.** The DELETE `/v1/instructor/chat?courseId=...` handler removes the `InstructorChatSession` record via `deleteOne({ instructorId, courseId })`, keyed identically to the POST that stores it (`findOneAndUpdate` with the same filter from `resolveCourseScope`). The pilot's "still based on previous context" observation was diagnosed as a misread of the iteration-limit hard failure — no client- or server-side bug.

**Iteration and token limits.** `maxIterations` bumped 5 → 8. Rationale: analysis questions routinely need 4–5 tool calls to fetch student metrics, class baseline, recent activity, and topic-level breakdowns before the model can reason; five leaves nothing for the reasoning turn. `maxTokens` bumped 1200 → 2000. Rationale: 1200 tokens was the reason "student's dominant driver is" truncated mid-sentence. Confirmed `instructorInsightsAgent` is the only caller of `runAgentWithTools`; other agents unaffected.

**Iteration-limit fallback.** Replaced the bare "try a narrower question" error with a partial-findings summary — a server-side digest of the tool-call log (≤8 lines, no extra LLM round), preambled with "I couldn't finish the full analysis, but here's what I did find:" and closed with an invitation to ask a narrower follow-up. Preserves `toolCalls` and `iterations` fields so the UI expander still shows the N tool calls.

**Prompt rewrite.** Replaced the loose "prefer 2–5 sentences" guidance with an explicit output-format contract: three-section structure for analysis questions (numbers → interpretation → recommendation), direct yes/no opener for judgment questions, humanized dates ("2 months ago", not ISO), no field repetition, no mid-sentence truncation, under 200 words unless asked. Live-verified against Groq + real DB: the at-risk-students question produced a textbook 3-section 155-word response with no ISO timestamps and a concrete suggestion; the yes/no question opened with "Not yet, but…" as specified.

One deviation from the original spec, documented in the commit message: added a name→id resolution grounding rule telling the agent to first resolve `studentId` via a roster tool (`topicStudentHeatmap`, which returns every enrolled student with their id, or `listStrugglingStudents` for the at-risk subset) before calling `studentProfile`, which requires an id and would fail on a name string. Without this, named-student queries hard-failed. The rule stays inside the "no new tools, no tool-def changes" boundary of the original scope.

Residual: at temperature 0.2, the model occasionally still whiffs on named lookup even with the grounding rule (one of two Budi Kim test runs returned "not found" despite invoking the right tools). Inherent LLM tool-use variance, and a substantial improvement over the pre-fix always-fail. Flagged for the Deferred list.

### D6 (shipped) Course Structure legend + tooltips + one label correction

Closes B7. Added a two-sentence legend row above the Course Structure tree (`frontend/my-app/src/components/instructor/CourseTreeView.jsx`) and native `title` attribute tooltips on all badges (topic pass/attempts, module max/ratio and the renamed student pass, milestone pass/max/ratio/auto-advance). Copy verified against the aggregation code in `milestoneAnalyticsService.js` and `analyticsService.js`. Commit `aef133d`.

The verification pass surfaced two mismatches in the underlying code the badges display:

1. Topic and milestone `pass %` are attempt-level rates computed against `MilestoneAttempt` (reflection checks) — not student-level, and not quiz-derived. The tooltip copy originally drafted for this doc ("Share of students who passed") would have been wrong on both counts. Corrected copy names the milestone-check attempt population explicitly.
2. Module `attempt pass %` was computing student-level (`students passed / students attempted`) despite the label and the tooltip both claiming attempt-level. The prior tooltip came from the B9 relabel work and was based on an assumption that turned out wrong. Renamed the module label to `student pass` in the same PR, since shipping a truthful tooltip alongside an inaccurate label would create a visible on-screen contradiction — worse than either being wrong alone.

The rename was scoped narrowly to the module badge only. It appears in one place, does not surface in Phase 1 paper screenshots (the paper is student-side), and Kiana does not reference this specific label in shared analysis. Topic and milestone `pass` labels stayed as-is; renaming them touches broader terminology (see the Deferred item below) and needs its own review.

### Deferred (post-pilot, next audit-doc pass)

- **Unify "pass" terminology app-wide.** The word "pass" is currently used for two different metrics: attempt-level milestone-check pass rate (Course Structure card, from `MilestoneAttempt`) and student-level topic pass rate (Student Progress page, from the B9 work, quiz-derived). Both are accurate at their level, but a consistent convention (`attempt pass` for attempt-level, `student pass` for student-level, applied uniformly) is the right shape of the eventual fix. Requires a small terminology PR with (a) audit-doc terminology update, (b) a check for paper-screenshot references, (c) coordination with Kiana on any analysis notes she has that reference the current wording. Not appropriate to slip inside a UX PR.
- **LLM tool-use variance on named-student lookup.** The Insights Assistant occasionally whiffs on a named student even with the roster-tool grounding rule (~1 in 2 test runs on the Budi Kim probe). Real-classroom likelihood is lower since the assistant is used interactively and a whiff can be re-asked. Escalation options if pilot data shows a pattern: (a) drop assistant temperature from 0.2 to 0.0 for tool-use predictability, (b) add a second tool-call retry on empty result before giving up. Neither is worth doing pre-emptively.
- **N7 bulk approve, N9 analytics export, N10 question-type mix UI.** All flagged in the Pilot run section, none addressed in this batch. Priority reassessment happens after real-faculty pilot data lands.
- **Design track.** Live design audit of the running app as `javatutor` via Claude-in-Chrome, followed by a broad UX critique doc and mock alternatives for identified problem pages. Queued as the next batch after this iteration lands on `main`.

### Priority-backlog status updates from this batch

| Row | Finding | Previous | Now |
|---|---|---|---|
| #4 | Insights and Student Progress disagree | (pre-pilot) | (shipped) cohort level via Risk Insights v2 (D1); per-student `pass` label rename deferred |
| #5 | At-risk panel is a dead end | (pre-pilot) | (shipped) at-risk rows now link to Monitor with flag context |
| #7 | Course tree auto-expands | (post-pilot) | (partially shipped) friction section collapsed by default via IA redesign (D2); per-module tree collapse still open |
| #10 | Cryptic rollup pills | (deferred) | (shipped) legend + tooltips + one label correction (D6) |

### Shipped in the pilot-prep iteration (late June 2026)

| Item | Commits | Verified |
|---|---|---|
| D1 Risk Insights v2 (continuous scoring, distribution, filter chips, class context override, trend) | 4 commits on `pilot-prep` | Deployed; instructor-visible on Insights |
| D2 Insights IA redesign (task-decomposed CollapsibleSection layout) | 2 commits on `pilot-prep` | Deployed; three sections render as expected |
| D3 Course detail two-column + state-dependent layout | 3 commits on `pilot-prep` | Deployed; setup vs functional gates on `publishedCount > 0` |
| D4 Chat scroll containment + mount scroll-to-top | included in D3 batch | Deployed; page lands at top, chat scrolls internally |
| D5 Insights Assistant fixes (iteration + token limits, fallback, prompt rewrite, name→id resolution) | `592caa6` | Live-verified via `runInstructorInsights` against real DB + Groq |
| D6 Course Structure legend + tooltips + module label correction | `aef133d` | Bundle-verified; badge copy matches aggregation code |

None of D1–D6 are on `main` yet. The `main` ← `pilot-prep` reconciliation is the standing follow-up whenever it's called.

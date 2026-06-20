# Teach Section UX Audit & Guidelines

**Scope:** Instructor experience only: the Teach dashboard, course management/authoring, and course analytics (Insights), plus the instructor navigation that ties them together. Student-facing surfaces are out of scope for this pass.

**Date:** June 2026
**Reviewed build:** deployed instance `studyassist-iitl-keanu.web.app`, instructor account "Java Tutor" (2 courses, 40 students, CPS 1231 Mid/Full Semester), plus the brand-new-instructor empty state.

This revision drops findings deferred by the team (preview-as-student, onboarding rework, AI-edit diff, synthetic-data labeling, mobile nav) and folds in the team's answers to open questions. Code claims were checked against source; one earlier finding (course cards lacking keyboard support) was wrong and removed after verification. A new section near the end, **Pilot run**, adds a simulated instructor think-aloud against the Phase 2 study protocol and nine new findings (N1-N9) it surfaced.

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
| 4 | Insights and Student Progress disagree | Analytics/IA | P1 | **(pre-pilot)** partially addressed by B8; cohort counts and per-student metrics still diverge — see B9 below |
| 5 | At-risk panel is a dead end | Analytics | P1 | **(pre-pilot)** B2 prompt up next |
| 6 | Hot Signal one word per line | Dashboard | P1 | (post-pilot) |
| 7 | Course tree auto-expands | Analytics | P1 | (post-pilot) |
| 8 | Heatmap red-to-green | Analytics | P1 | (post-pilot) |
| 9 | Sidebar omits Students and Insights | Nav/IA | P1 | (post-pilot) |
| 10 | Cryptic rollup pills | Analytics | P2 | (deferred) |
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

### B8 (shipped) At-risk row conflated two different data sources under "quiz" labels

The original audit framed this as "Nia Singh's 20% quiz average coexists with a 100% pass rate, trace why." The trace surfaced a different root cause than expected: the at-risk row was rendering **quiz** average (from `Session.quizAttempts`) next to **milestone** attempt count and pass rate (from `MilestoneAttempt`) under unified "quiz" labels. Each number was individually correct; they just measured different objects.

`getAtRiskStudents` in `backend/services/milestoneAnalyticsService.js` now derives quiz average, quiz pass rate, and quiz attempt count from the same submitted, non-revision quiz-attempt set. When that set is empty, all three render as "No quiz data" instead of defaulting to misleading numbers.

After the fix, every at-risk row is internally consistent. Verified across all 40 synthetic students: zero hard contradictions, zero threshold mismatches. Spot-check examples:

- Nia Singh: 32.2% avg · 27.8% pass · 18 attempts (was 20% / 100% / 3)
- Noah Yamamoto: 32.4% / 17.2% / 29
- Liam Adeyemi: 53.6% / 50% / 28
- 2 mid-sem students with no submitted quizzes → "No quiz data"

Deployed and verified June 2026. Note: this does **not** resolve B9, which is the same kind of source-conflation at the cohort and cross-surface level.

### B9 (pre-pilot) Insights and Student Progress still disagree on counts and per-student metrics

B8 fixed the conflation **within** the at-risk row. The conflation **between** Insights and Student Progress as surfaces still exists, and the post-B8 spot check confirmed it:

- **Cohort counts disagree.** CPS 1231-Mid Semester: Insights flags **5 at-risk** (Nia, Noah, Ananya, Isabela, Budi all at LOW QUIZ SCORE), Student Progress flags **2 struggling**. Different thresholds and definitions, never reconciled, never named.
- **Per-student numbers disagree.** Nia Singh: Insights at-risk row reads "**27.8% quiz pass · 18 attempts**" (attempt-level pass rate across all submitted quiz attempts). Student Progress reads "**0% quiz pass**" (topic-level pass — Nia has passed zero of 15 topic gates). Both numbers are correct for what they measure, but they share the label "quiz pass."
- **No hand-off.** At-risk rows on Insights still don't link to the per-student Monitor page — see B2.
- **Inconsistent naming.** "At-risk" vs "struggling" still describe the same idea under different words.

This is the same B8 problem one layer up. Fix is: pick one definition of "at-risk / struggling" with an explicit threshold, compute it in one place on the backend, expose it via one endpoint, consume it identically on both surfaces. The per-student "quiz pass" label needs to disambiguate attempt-level vs topic-level — easiest fix is to call one of them by a different name (e.g. attempt pass rate vs topic pass rate). 

Tracked for pre-pilot fix.

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
| B2 at-risk dead end | InstructorInsightsPage.jsx:58-70 | (pre-pilot) | wrap rows in `<Link>` to Monitor — next prompt |
| C1 Hot Signal layout | InstructorCourseDetailPage.jsx:392-402 + HotSignalCard.jsx:50,72 | (post-pilot) | full-width row or stacked CTA |
| N8 Delete course placement | InstructorCourseDetailPage.jsx:320,364-377 | (post-pilot) | relocate; typed confirmation |
| A1 Modify wipes drafts | InstructorCourseDetailPage.jsx:272,284,546,551 + instructorRoutes.js:530,887 | (shipped, frontend only) | confirmation modal lists draft titles; archived-for-undo deferred |
| B3 tree auto-expands | CourseTreeView.jsx | (post-pilot) | collapse to module level |

Shipped this cycle: N3, N5, B1, and A1's confirmation modal (archived-for-undo still pending). Remaining quick wins: B2 (wrap rows in a link) and C1 (move one card to its own row). Heavier: N10 (new control) and B1's deeper backend reconciliation of metric definitions (also the root of B9).

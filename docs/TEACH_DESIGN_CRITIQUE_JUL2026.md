# Teach Section Design Critique — July 2026

**Scope:** Design walkthrough of the running instructor experience on `studyassist-iitl-keanu.web.app` as of 7/1/2026, after the pilot-prep iteration (D1–D6) landed. Focus: Insights, Course Detail, Instructor Dashboard, and cross-cutting patterns. Student-facing pages remain out of scope.

**Method:** Walked the three pages signed in as `javatutor` (the pilot instructor account) at 1568×781 desktop. Screenshots captured for every finding below. Reference course: CPS 1231-Mid Semester (20 students, 268 attempts, 7 published + 8 draft topics). Second reference course: CPS 1231-Full Semester (1102 attempts, comparable structure). Both are functional (`publishedCount > 0`); the setup-mode (single-column empty-course) state was verified in code during D3 but not walked in this pass because no empty course exists in the pilot data.

**How this differs from the June audit.** The June audit (sections A–C in `TEACH_UX_AUDIT_AND_GUIDELINES.md`) was written before the D1–D6 pilot-prep ships. This critique reviews the *shipped* state. Findings that overlap with earlier ones are marked with the original ID so they connect back. Findings unique to this walk get new IDs prefixed `E-` for tracking.

## Severity legend

- **Critical** — factually wrong output, broken interaction, or trust-breaking inconsistency. Fix before pilot moves to real classroom use.
- **High** — materially confuses or slows the instructor.
- **Watch** — polish, consistency, or accessibility debt that adds up but is safe to defer past the pilot.

---

## Executive summary

Three headlines from the walk:

1. **The "at-risk" count is different on every surface.** Course card says 2 · Today's Briefing says 2 · Insights bar chart says 1 Critical + 1 High + 8 Watch · Insights Assistant says 5. Same course, same day, four numbers. B9 landed at the cohort level via Risk Insights v2 (D1), but the downstream surfaces are still applying their own thresholds. This is the single most trust-breaking issue in the app today. **E-X-1, Critical.**

2. **Today's Briefing on the Dashboard produced a factually broken sentence:** "'Budi Kim' being the hottest course to watch due to their low pass rate." Budi Kim is a student, not a course. The daily briefing LLM is confusing entity types. This is a shipped Dashboard artifact the instructor sees on every login. **E-Dash-1, Critical.**

3. **Insights bar-chart tooltip is sticky.** After hovering, the tooltip remained visible in the wrong position when the cursor moved away. Every screenshot I took of the Insights page had an orphan tooltip floating over the chart. Small bug, but it's the first thing you notice. **E-Ins-1, Critical.**

Beyond those three, the shipped D-work generally reads correctly. The Insights IA redesign (D2) delivers task-scoped decomposition (What stands out / What should I cover / Who should I reach / Course Health) that maps well to instructor workflow. Risk Insights v2 (D1) surfaces the four tiers with a clear distribution chart and filter chips. The Course Structure legend (D6) reads as promised, and the `student pass` vs. `pass` badge distinction now matches the underlying aggregation. The remaining findings are mostly polish, density, and hierarchy issues.

---

## Dashboard

### E-Dash-1 (Critical) — Today's Briefing generates factually broken narratives

The Dashboard's Today's Briefing panel produced:

> "Across both 'CPS 1231-Mid Semester' and 'CPS 1231-Full Semester', a total of 40 students are enrolled, with 79.9% achieving a pass rate. Notably, 'CPS 1231-Mid Semester' has 2 students at risk of failing, while 'CPS 1231-Full Semester' has 1 student at risk, with **'Budi Kim' being the hottest course to watch due to their low pass rate.**"

Budi Kim is a student in CPS 1231-Mid Semester (I saw his card at 34/100 Watch on the Insights at-risk list). Calling him a course, and referring to "their low pass rate" as if he were a course, is a factual and grammatical failure. The briefing LLM is either not distinguishing students from courses in its context, or is hallucinating the "hottest course to watch" phrasing from a template that expected a course name.

**Fix.** Two-part:

1. Tighten the briefing prompt to enforce entity types — "hottest course to watch" must be filled with a course name from the fetched course list, not a student name. Explicit prompt-level type check or structured JSON output that the frontend renders.
2. Add a fallback that suppresses the "hottest course" clause when the LLM output can't cleanly identify a course match — better to omit than to publish a sentence like this.

Consider running a small evaluation of the briefing generator against a fixed dataset before pilot expansion — this is exactly the kind of failure that erodes instructor trust the moment it appears.

### E-Dash-2 (High) — Dashboard leaves ~60% of the viewport empty below-fold

At 1568×781 the Dashboard ends around y=550 (course-card row) and leaves everything from y=550 to y=780 as blank white space. The functional data density is: 4 KPI tiles + 1 briefing paragraph + 2 course cards. First impression is "this app is quiet even when there are 40 students." Related to C3 in the June audit.

**Fix.** Surface something below the course cards that gets denser as data accrues — a compact "At-risk right now" list (top 5 students across all courses, name + tier + one-click to Monitor), a recent-activity ticker, or the most-recent Risk Insights v2 distribution rolled up for all courses. Any of these turns dead space into evidence of what the tool knows.

### E-Dash-3 (High) — Course card layout mixes stat types without hierarchy

Each course card shows a row of four stats: `ENROLLED 20 · ACTIVE 20 · PASS RATE 79.1% · AT-RISK 2`. The four use the same visual weight but they mean very different things — enrollment is a fixed input, active is a proxy for retention, pass rate is a lagging outcome, at-risk is a leading signal. All are shown at parity. The most actionable one (AT-RISK 2 in red) is at the far right, competing with the muted "1102 attempts" bar above.

**Fix.** Give AT-RISK visual priority: larger number, a "→ Review these students" affordance next to it that links to the at-risk section of Insights. Consider dropping ACTIVE when it equals ENROLLED (its main value is in showing gaps) — a stat that always matches the neighbor beside it is noise.

### E-Dash-4 (Watch) — "Include synthetic cohort" appears in two places

The checkbox lives in the top-right of the Dashboard header, and again inside the Insights Assistant panel. Both control the same state (I believe). Two toggles for the same setting risks the instructor toggling one and expecting the other to update — or worse, toggling the panel one and having the KPI numbers behind it silently disagree with the answer they just got from the assistant.

**Fix.** One toggle in the header only. Inside the assistant panel, show a read-only chip that reflects the current state (e.g. "Includes synthetic cohort" or "Real students only") rather than a duplicate control.

### E-Dash-5 (Watch) — Course "draft" pill on a running course

CPS 1231-Mid Semester shows "Draft" on the dashboard card despite 268 attempts and 20 enrolled students. This is A4 from the June audit and it's still live. The course-level status is meaningless when topics are published and active.

**Fix.** Either drop the course-level status once any topic is published, or rename it to reflect what it actually controls (enrollment window? new-student joins?). A "Draft" pill on an active course tells the instructor nothing.

### E-Dash-6 (Watch) — Sidebar still omits Students and Insights

Only Dashboard and Courses appear in the sidebar. C2 from the June audit. The workaround (drill into a course to reach its Insights) works but forces the instructor to remember which course a student belongs to before they can look them up.

**Fix.** Add a Students entry (all students across courses, searchable) and an Insights entry (surfaces the last-viewed course's insights, or a course picker). Both are already-built pages behind a single unifying entry point.

---

## Insights

### E-Ins-1 (Critical) — Bar-chart tooltip is sticky

After hovering the Healthy bar, the "Healthy · Count: 10 students" tooltip stayed visible in the wrong position as I moved the mouse around the chart and elsewhere on the page. Every screenshot from this walkthrough captured an orphan tooltip. Small visual bug, but it's on the primary "Class composition by risk level" chart, so every instructor will see it.

**Fix.** Verify the Recharts tooltip `wrapperStyle` and the `active` prop lifecycle in `RiskDistributionChart.jsx` (or wherever the chart lives). Confirm the tooltip dismisses on `mouseleave` from the chart container. If Recharts is being nudged by parent re-renders, memoize the tooltip content.

### E-Ins-2 (High) — Course Structure tree renders draft topics at parity with published

Below the published topics with real numbers, the tree lists 8 draft topics each showing "no data" and "no quiz data" pills right-aligned in the same slot the pass-rate pills use. The empty rows take the same visual weight as the informative ones, so scrolling through the tree reads as "lots of stuff, most of it empty."

**Fix.** Default-hide zero-data drafts under a "Show 8 drafts with no data" collapsible row. Instructors reviewing structure care about what students have hit; drafts are a course-authoring concern, not an analytics concern.

### E-Ins-3 (High) — Filter chips split by "|" is ambiguous

The at-risk filter row is: `All · Critical · High · Watch  |  No Engagement · Low Pass Rate · Low Quiz Score · Stuck Topic`. The "|" separator is doing IA work — signaling that the left row is one filter axis (tier) and the right row is another (reason). At first glance it reads as one row of eight chips.

**Fix.** Add tiny microcopy above each row: "By tier" and "By reason." Or stack them vertically with an explicit "Also filter by:" heading. Either treatment tells the instructor "you can combine one from each side" rather than making them experiment.

### E-Ins-4 (High) — At-risk student cards repeat the same reason chip on nearly every row

Seven of the eight Watch-tier at-risk cards showed the same yellow "NO ENGAGEMENT" chip. When a chip dominates the list, it becomes visual noise — the instructor's eye stops resolving it as new information. The chip also duplicates the "mostly: needs to engage" text in the card body (see E-Ins-5).

**Fix.** Group the at-risk list by dominant reason and hoist the reason to a section header: "Not engaging (7 students)" · [list] · "Multiple factors (2 students)" · [list]. Or omit the reason chip on individual rows when it matches a section header.

### E-Ins-5 (Watch) — Redundant reason on at-risk card

Each at-risk row shows both a "mostly: needs to engage" plain-language line and a yellow "NO ENGAGEMENT" pill. Same information twice, in two visual languages. Related to E-Ins-4.

**Fix.** Pick one. Keeping only the pill row saves a line and lets the plain-language space go to the numeric summary (`1 of 7 quizzed · 1 touched · avg 60%`), which is more useful.

### E-Ins-6 (Watch) — Risk distribution chart uses a red-to-green ramp

Healthy (green) → Watch (amber) → High (orange) → Critical (red) is the traffic-light pattern. Same accessibility concern as B4 from June (the topic-student heatmap). The four tiers are clearly labeled in text below each bar, so the color is not doing sole work — but for colorblind instructors the chart still leans on hue-only distinctions between adjacent tiers (amber vs orange).

**Fix.** Add non-color cues: pattern fills (solid / dotted / hatched / striped) or a horizontal reference tick at each tier boundary. Confirm the tokens are pulled from a design-system palette rather than inline hex, so a future palette swap is one file.

### E-Ins-7 (Watch) — Course Structure indentation duplicates topic and module names

Under "Introduction to Computer Science PUBLISHED" the indented child row reads "Introduction to Computer Science INTRO." The topic and its sole INTRO module share the same name. In a tree view, this reads as a duplicate.

**Fix.** When a module inherits its topic's name (which is the default for single-module topics), collapse the module row into the topic header (`Introduction to Computer Science [PUBLISHED / INTRO / 68.4% pass / 79 attempts / max 3 / ratio 1.2]`). Multi-module topics stay expanded.

### E-Ins-8 (Watch) — "reference charts" microcopy is cryptic

The "Course Health" collapsible section is labeled "reference charts" as its subtitle. Doesn't tell the instructor what's inside.

**Fix.** Replace with a preview line: "Score distribution · Completion funnel · Course structure · Topic × student heatmap · Quiz difficulty · Milestone difficulty" (or the more actionable subset). The instructor should know what they're about to expand.

---

## Course Detail (functional)

### E-Cd-1 (High) — Delete course sits in the primary action row next to "View insights"

The top-right of the course header has: [View insights →] [Delete course]. Both are pill-shaped, both in the same row. Delete is red, but a rushed click is a rushed click. N8 from the June audit flagged this; the shipped state still has it.

**Fix.** Move Delete to a course-settings screen or an overflow menu. Even a small icon-button (⋯ → Delete) reduces the accidental-click surface without hiding the action.

### E-Cd-2 (High) — AI Teaching Instructions textarea is too small to review its own contents

The rail's AI Teaching Instructions section shows a 4-line textarea with a much longer paragraph inside. The instructor sees the first four lines and has to scroll within the tiny box to read what's actually being fed to the AI. On a page where the rail already has plenty of vertical space, cramping the most important instructor-authored control into 4 lines is a mismatch.

**Fix.** Auto-size the textarea to fit its content (up to a reasonable max, e.g. 12 lines), or expand to 8-10 lines by default. Save button stays where it is.

### E-Cd-3 (Watch) — Topic Plan Chat lacks turn indicators

The chat renders as continuous flowing text without message bubbles, sender labels, or timestamps. On the narrow rail, the previous AI output ("...primary syllabus, with each topic mapping to 1-2 weeks of class time...") wraps into a wall of unbroken prose. The chat scroll fix from D4 works, but reading the history is harder than it needs to be.

**Fix.** Add lightweight per-turn separation: a subtle background tint alternation, a "You" / "AI" label above each turn, or a small horizontal rule between messages. Keep it visually quiet — this rail is a companion tool, not a foreground chat.

### E-Cd-4 (Watch) — Every topic card has a Delete button

The Topics list shows 15 topic cards, each with a red Delete button on the right. That's 15 red delete buttons on one page. Even guarded, the visual density of destructive actions is high.

**Fix.** Consolidate per-topic actions into an overflow menu (Edit stays visible; Delete + Unpublish/Approve moves behind ⋯). Or use hover reveal — actions appear only when the row is focused.

### E-Cd-5 (Watch) — Right rail runs out before the topics list does

The Topics list column keeps scrolling past the rail's fixed content (Student Progress, AI Instructions, Materials, Chat, Modify controls). At mid-scroll the rail is empty white space while the topics column continues. Visual balance breaks down.

**Fix.** Make the rail sticky (`position: sticky; top: 6rem`) so the setup tools follow the scroll. Or move the least-used rail card (probably Student Progress link) down to a footer row that spans full width.

### E-Cd-6 (Watch) — Course-level "draft" pill on a running course

Same as E-Dash-5. On the course detail header, "CPS 1231-Mid Semester" shows "draft" next to Access code and Copy. Course has 88.2% session completion; the pill is meaningless.

---

## Cross-cutting

### E-X-1 (Critical) — "At-risk" count is different on every surface

For CPS 1231-Mid Semester on 7/1/2026:

| Surface | At-risk count | Definition (inferred) |
|---|---|---|
| Dashboard course card | 2 | Probably Critical + High only |
| Today's Briefing (narrative) | 2 | Same as card |
| Insights KPI strip | 2 | Same |
| Insights bar chart (Class composition) | 1 Critical + 1 High + 8 Watch | Full four-tier from Risk Insights v2 |
| Insights at-risk list ("Showing 10 at-risk students") | 10 | Critical + High + Watch |
| Insights Assistant response | 5 | Something else — includes some Watches but not all |

The same course produces four different numbers depending on where the instructor looks. This is B9 not fully closed — Risk Insights v2 unified the cohort computation, but the surfaces around it still apply distinct thresholds. The most confusing case is the Insights page itself, where the KPI strip says "At-risk 2" while the bar chart labels 10 students as being in Critical + High + Watch tiers and the at-risk list shows all 10.

**Fix.** Pick one definition of "at-risk" and use it everywhere. My recommendation: **at-risk = Critical + High** (the two tiers that need instructor action now), with Watch shown as a separate tier for early-warning tracking. Rename the Insights list to "Attention needed (2)" and add a "10 in Watch tier" secondary line. Assistant queries about at-risk should apply the same threshold. This is one query definition and about six label changes across the app. Deferred rename of `pass` terminology from D6 could ride along in the same terminology-consistency PR.

### E-X-2 (Watch) — Two synthetic-cohort toggles

Documented under E-Dash-4 but affects the whole experience — every scoped panel (Dashboard, Insights, Course Detail) that has its own filter needs to reflect the global toggle, not duplicate it.

### E-X-3 (Watch) — No global student search

On a 20-student class this is fine. At 40+ students (CPS 1231-Full is 20 students; a two-course instructor has 40) it's already awkward. The workaround (click into a course → Students → scroll) works but breaks the flow when the instructor is thinking "how is Nia doing" rather than "let me review CPS 1231-Mid."

**Fix.** A cmd-K style palette (top nav or keyboard shortcut) that lets the instructor type a student name and jump to Monitor.

---

## Ranked backlog

| ID | Finding | Severity | Page |
|---|---|---|---|
| E-X-1 | "At-risk" count differs on every surface | Critical | Cross-cutting |
| E-Dash-1 | Today's Briefing calls a student a course | Critical | Dashboard |
| E-Ins-1 | Bar-chart tooltip is sticky | Critical | Insights |
| E-Dash-2 | ~60% of Dashboard viewport is empty | High | Dashboard |
| E-Dash-3 | Course card stat hierarchy flat | High | Dashboard |
| E-Ins-2 | Draft topics render at parity in Course Structure tree | High | Insights |
| E-Ins-3 | Filter chips split by "|" is ambiguous | High | Insights |
| E-Ins-4 | Reason chip dominates at-risk list | High | Insights |
| E-Cd-1 | Delete course in primary action row | High | Course Detail |
| E-Cd-2 | AI Teaching Instructions textarea too small | High | Course Detail |
| E-Dash-4 | Two synthetic-cohort toggles | Watch | Dashboard / Cross-cutting |
| E-Dash-5 / E-Cd-6 | "draft" pill on running course | Watch | Dashboard / Course Detail |
| E-Dash-6 | Sidebar omits Students and Insights | Watch | Dashboard / Nav |
| E-Ins-5 | Redundant reason on at-risk card | Watch | Insights |
| E-Ins-6 | Risk distribution red-to-green ramp | Watch | Insights |
| E-Ins-7 | Course Structure duplicates topic/module names | Watch | Insights |
| E-Ins-8 | "reference charts" microcopy | Watch | Insights |
| E-Cd-3 | Topic Plan Chat lacks turn indicators | Watch | Course Detail |
| E-Cd-4 | 15 Delete buttons on Topics list | Watch | Course Detail |
| E-Cd-5 | Right rail runs shorter than left column | Watch | Course Detail |
| E-X-3 | No global student search | Watch | Cross-cutting |

---

## What's working well

Not every finding was a critique. The pilot-prep iteration made real gains:

- **Risk Insights v2 tiering** reads at a glance. Instructor can see 1+1+8+10 across Critical / High / Watch / Healthy without doing arithmetic.
- **Task-scoped Insights sections** ("What stands out" / "What should I cover" / "Who should I reach" / "Course Health") map to instructor workflow. Progressive disclosure (Course Health collapsed by default) means the dense reference charts don't compete with the actionable summary.
- **Course Structure legend and tooltips (D6)** deliver on the pilot ask. The module `student pass` label is accurate against the aggregation code. Hover reveals the definitions.
- **Hot Signal card on Course Detail** is one clean sentence + a link to Insights. Perfect ratio of context to action.
- **Insights Assistant response quality** (from D5) shows structured, humanized responses ("The KPIs show a total of 1370 attempts, with 1095 passes, resulting in an average pass rate of 79.9%") without ISO timestamps or mid-sentence truncation.
- **Access code + Copy inline** on the course header is small and right.
- **Approve vs Unpublish** on topic cards teaches the state model through the action set.

## Suggested next batch (post-pilot iteration 2)

If you take the Critical + High findings above and estimate implementation:

**Round 1 (blocks the study):**
1. E-Dash-1 briefing entity-type fix (backend prompt + fallback)
2. E-Ins-1 tooltip dismiss fix
3. E-X-1 unify "at-risk" definition and propagate

**Round 2 (before pilot expansion):**
4. E-Dash-2 Dashboard density (surface at-risk directly)
5. E-Ins-2 hide zero-data drafts in Course Structure tree
6. E-Ins-3 chip-row IA microcopy
7. E-Ins-4 group at-risk by dominant reason
8. E-Cd-1 relocate Delete course
9. E-Cd-2 grow AI Teaching Instructions textarea

**Round 3 (polish):**
10. All Watch items.

Round 1 is under a day of work per item. Round 2 is a few days total. Round 3 is a good pilot-close cleanup batch.

## Feeds back to the audit doc

Once these findings are triaged, I will fold them into `TEACH_UX_AUDIT_AND_GUIDELINES.md` as **section E** (matching the July date), with the shipped items rolling into their D-numbered counterparts. The audit doc stays the running record; this critique doc is the July snapshot that generated the E-numbered findings.

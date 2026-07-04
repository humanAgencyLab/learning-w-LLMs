# Claude Design Integration Plan — Study Assist Teach

**Source mockup:** `Study Assist Teach.html` (bundled) → extracted to `docs/mocks/user_mockup_extracted.html` (1796 lines).
**Target:** `frontend/my-app/src/` on branch `pilot-prep`.
**Rule of thumb (from you):** where the shipped design is missing something the mockup shows, follow the mockup's pattern. When something in the mockup is tough to convert without new backend or new dependencies, skip it and note why.

The mockup covers seven views plus four overlays. This plan maps each to the codebase, marks every delta as **CONVERT** / **SKIP** / **CLARIFY**, and packages one implementation prompt per file group at the end.

---

## Design system extracted from the mockup

Pull these into a single stylesheet (or a Tailwind config extension). Every prompt below assumes these are available.

**Colors** — replaces the ad-hoc palette:

| Token | Hex | Where |
|---|---|---|
| `text.primary` | `#0f1729` | Headings, high-contrast body |
| `text.muted` | `#6b7385` | Subtitles |
| `text.subtle` | `#8891a0` / `#98a0b0` | Labels, meta |
| `text.faint` | `#a9aec0` / `#aab1bd` | Hints, unit labels |
| `text.ghost` | `#b0b7c3` / `#c3c9d4` | Chevrons, denominator text |
| `border.default` | `#e8eaee` / `#e2e5ea` | Card borders |
| `border.hairline` | `#eef0f3` / `#f2f4f7` | Row dividers |
| `bg.page` | `#f6f7f9` | Main background |
| `bg.card` | `#ffffff` | Cards |
| `bg.chip` | `#f2f4f7` | Chip pill background |
| `blue.link` | `#2563eb` | Primary link, "View insights" button |
| `blue.pressed` | `#1d4ed8` | Hover on primary |
| `indigo.assistant` | `#4f46e5` | Insights Assistant, Hot signal, Modify button |
| `indigo.deep` | `#4338ca` / `#4a4568` | Assistant hover, hot signal text |
| `indigo.tint` | `#eef0fe` / `#f4f2ff` / `#ddd6fe` | Assistant/hot backgrounds |
| `red.critical` | `#b42318` / `#d92d20` | Critical tier, delete |
| `red.tint` | `#fef3f2` / `#fdeeeb` / `#f4c9c2` / `#fecdca` / `#f6ddd8` | Critical card backgrounds/borders |
| `green.ok` | `#067647` / `#12b76a` | Healthy tier, Approve |
| `green.tint` | `#ecfdf3` / `#dcf5e6` / `#b8ecca` | Approve button, Healthy tint |
| `amber.watch` | Uses tier-specific colors passed as `s.color` | Watch tier |

**Typography** — the mockup imports **Plus Jakarta Sans** (body) and **JetBrains Mono** (uppercase kickers, codes, keyboard hints). Currently the app uses system sans-serif only. **CONVERT** — add Google Fonts import for both.

**Iconography** — SVGs are inline, stroke-based, `stroke-width` 1.8–2.2. Match the existing Heroicons look; no new SVG library needed.

**Shapes / shadow** —
- Cards: `border-radius: 13-15px`, `border: 1px solid #e8eaee`, `box-shadow: 0 1px 2px rgba(16,24,40,.04)`.
- Buttons: `border-radius: 9px`, primary `#2563eb`, secondary white with `border: 1px solid #e2e5ea`.
- Pills / chips: `border-radius: 5-9px`, small caps kicker uses JetBrains Mono at `10-11px` with `.03-.06em` letter-spacing.

**Animations** — the mockup uses three named animations: `fadeIn .4s`, `riseIn .5s cubic-bezier(.2,.7,.2,1)`, `popIn .15s`. **CONVERT** — add these three keyframes to a global CSS file.

---

## View-by-view mapping

### 1. Sidebar (`layouts/InstructorShell.jsx` · 120 lines)

**Current:** `Teach` logo + Dashboard + Courses; Student view link; user pill with logout.

**Mockup adds:**
- Brand block: `Study Assist` (bold 16px, tight) + kicker line `Teach · Instructor` in JetBrains Mono.
- `⌘K` "Search students" button below brand (opens command palette).
- **Students** nav entry.
- **Insights** nav entry.
- User pill visually unchanged (initials avatar, name, role, logout icon).

**Classification:**
- Brand block, Students nav, Insights nav → **CONVERT** (pure JSX + routing).
- `⌘K` search button → **CONVERT (JSX button)** + **CLARIFY (palette itself)** — the palette needs a global search endpoint that returns all students across all instructor courses. Currently `InstructorStudentsPage.jsx` already fetches per-course; we'd need a cross-course search API or reuse the existing endpoint by loading all courses upfront. Ship the button now, wire the modal to open a "coming soon" placeholder or to a filtered version of Students page for the pilot.

---

### 2. Dashboard (`Pages/instructor/InstructorDashboardPage.jsx` · 182 lines)

**Current:** header, 4-KPI strip, `AgentBriefingCard`, "Your Courses" grid via `CourseCardsGrid`.

**Mockup:**
- Header with title + subtitle (dynamic `{{ subtitleLine }}`).
- Row 1 (2 columns, 1.85fr : 1fr): Today's briefing card on the left, red "Need attention now" card on the right. The red card has:
  - kicker "Need attention now"
  - big count (Critical + High across courses)
  - top 3 named students with click-to-open
  - "+ N more in Watch tier" line
  - dark red "Review the watchlist →" CTA
- Row 2: 4 KPI figures (Courses / Students / Sessions / Session completion).
- Row 3: **Watchlist** card
  - Title + "one risk definition, everywhere" tagline
  - Filter-by-tier tabs (All / Critical / High / Watch) with counts
  - Grouped list per tier (like the Insights at-risk list), each row with avatar, name, @handle, course chip, summary line, factor chips, big risk score /100, tier label, chevron
- Row 4: **Your courses** grid (kept from current, styled to match).

**Classification:**
- Today's briefing card polish → **CONVERT** (extend `AgentBriefingCard.jsx`).
- "Need attention now" red card → **CONVERT** — data already exists via `getInstructorOverview` + `getAtRiskStudents` per course. Aggregate in the dashboard hook.
- 4 KPI figures — **CONVERT** (already there, restyle).
- Watchlist card with tier tabs and grouped rows → **CONVERT** — reuses risk-score data from `milestoneAnalyticsService.js` (`computeRiskScore`). Frontend needs an aggregation of at-risk lists across courses.
- Your Courses grid → **CONVERT** (`CourseCardsGrid.jsx` restyle).

---

### 3. Insights (per course) (`Pages/instructor/InstructorInsightsPage.jsx` · 452 lines)

**Current:** IA-redesigned CollapsibleSection layout (Who / How / Where). Uses `InsightCards`, `RiskDistributionChart`, `AtRiskPanel`, `PerformanceKPIStrip`, `CompletionFunnel`, `CourseTreeView`, `TopicStudentHeatmap`, `QuizByTopicTable`, `ScoreDistributionChart`.

**Mockup:**
- Header row: `INSIGHTS` kicker (JetBrains Mono, blue), course title, deck line; right side: synthetic-cohort chip (readonly indicator, not toggle), `Edit course` button, `Students` button.
- **5-cell KPI strip** at top: label, value, unit label under each. Values use tabular numerals.
- **"What stands out"** section: grid of finding cards with colored dot, kicker, text, "View milestone difficulty →" link.
- **"Who should I reach?"** section (the pilot-feedback centerpiece):
  - Left card (320px fixed): risk distribution bar chart, 4 tiers, click-to-filter
  - Right column: **By tier** chip row + **By reason** chip row (explicit labels — closes E-Ins-3), then grouped student rows with tier header + count + hint text, each row detailed like the Dashboard watchlist row
- **Course health** collapsible card containing:
  - Score distribution mini-chart (5 bars)
  - Completion funnel (4 stages with progress bars)
  - Course structure table (7 published rows with pass % bar + attempts count), then "Show 8 drafts with no data" toggle that expands the draft list

**Classification:**
- Header row + kicker + KPI strip → **CONVERT** (JSX changes only).
- "What stands out" → **CONVERT** — already `InsightCards.jsx`, restyle.
- "Who should I reach?" → **CONVERT** — data exists. RiskDistributionChart already draws bars; add explicit tier/reason axis labels.
- Course structure single-row layout (drop the module row, show inline pill legend) → **CONVERT** with prompt from mock B — extends `CourseTreeView.jsx`.
- "Show 8 drafts with no data" collapsible → **CONVERT** (already in mock B).
- Score distribution mini-chart embedded → **CONVERT** — reuse existing `ScoreDistributionChart.jsx` with reduced height.
- Sticky-tooltip bug (E-Ins-1) → **CONVERT** — same file, tooltip lifecycle fix.

---

### 4. Course Detail / Desk (`Pages/instructor/InstructorCourseDetailPage.jsx` · 701 lines)

**Current:** Two-column state-dependent layout (D3 shipped). Header with `Delete course` in the primary action row (E-Cd-1). AI Instructions textarea small (E-Cd-2). Every topic row has red Delete visible (E-Cd-4).

**Mockup:**
- Breadcrumb: `← All courses`.
- Header row: course title, access code with Copy, status line; right side: blue `View insights →` button + `⋯` overflow menu (Duplicate course / Copy access code / **Delete course** in red).
- **5-cell strip:** 4 KPIs (Enrolled / Sessions / Session completion / Topics · 7 published) + **Hot signal card** as the 5th cell (indigo tint, kicker, text, "Open in Insights →").
- **Two-column body:**
  - Left (1.7fr): **Topics** card with sections "Published · 7" and "Drafts · 8"; each topic row has a chevron to expand, name, badge (INTRO/CORE tier), meta, `Edit` button, `⋯` menu with `Duplicate` and `Delete`. Expanded row shows: syllabus unit, milestones list, quiz summary line.
  - Right (1fr, sticky-top): **AI teaching instructions** card with grown textarea (`min-height: 172px`, resize-vertical), Save + "Applies to all topics" hint. **Course materials** card with file row + "Upload files" dashed button. **Topic plan chat** card with message bubbles (user / AI turn indicators), input, indigo "Modify draft topics" button.

**Classification:**
- Breadcrumb + header restyle → **CONVERT**.
- Overflow menu with Duplicate / Copy code / Delete → **CONVERT** — Delete is currently `window.confirm`, wire the menu item to the same handler.
- 5-cell strip with Hot signal integrated → **CONVERT** — `HotSignalCard.jsx` already exists, restyle to fit as 5th column.
- Topic list expandable with milestones + quiz line → **CONVERT (row structure)** + **CLARIFY (milestones data)** — the topics list endpoint returns `moduleCount` and `milestoneCount` but may not include per-milestone titles. Check `listInstructorCourseTopics` in `courseApi.js`; if not present, expand the endpoint or add a per-topic milestones fetch on chevron click.
- Per-topic ⋯ menu (Duplicate + Delete) → **CONVERT (Delete)** + **SKIP (Duplicate topic)** — no duplicate-topic backend endpoint exists; skip that menu item, leave Delete.
- Grown AI Instructions textarea + Save + hint → **CONVERT**.
- Course materials + Upload files → **CONVERT**.
- Topic plan chat with per-turn styling → **CONVERT** — existing chat data structure already has role, add per-message wrapper styling.

---

### 5. Students (list) (`Pages/instructor/InstructorStudentsPage.jsx` · 257 lines)

**Current:** exists as a list page.

**Mockup:**
- Header: title + subtitle "N across 2 courses · X need attention".
- Tab row (Critical / High / Watch / All) with counts + search input right-aligned.
- Table:
  - avatar + name + @handle + course chip + joined-line
  - topics label (e.g. "1 of 15 · 10 pts")
  - risk badge (Critical / High / Watch / Healthy)
  - topic-pass label (green / amber / red pill)
  - `Monitor` button + `⋯` expand chevron
- Expanded row: "Topic progress" mini-grid (2 columns, topic name + bar + pct)

**Classification:**
- Tabs + search → **CONVERT**.
- Table row layout → **CONVERT** — reuses risk-score + student topic pass data.
- Expandable topic progress → **CONVERT** if per-student per-topic progress is available (check `getStudentDetail` or `getStudentTopicStats`). If not, keep row collapsed by default and mark expand as **CLARIFY**.

---

### 6. Courses (list) (`Pages/instructor/InstructorCoursesPage.jsx` · 121 lines)

**Current:** exists.

**Mockup:**
- Title + subtitle.
- Create course input + blue "Create course" button.
- Course rows: colored icon + title + meta (code, enrolled, published) + red "N need attention" chip when applicable + chevron.

**Classification:** **CONVERT** — straightforward JSX + reusing existing data.

---

### 7. Monitor / Student detail (`Pages/instructor/InstructorStudentDetailPage.jsx` · 798 lines)

**Current:** exists.

**Mockup:**
- Back button "Back to students".
- Student header row: avatar + name + meta + factor chips + tier + score /100 on the right.
- Two-column body:
  - Left (1.7fr): "Topics" card — each row = topic name, updated-timestamp, progress bar, status pill, `View session` button.
  - Right (1fr, sticky): **Instructor notes** card with Course-note / Topic-note tab toggle + textarea + Save; **Risk trend** sparkline card + "Persistence N/100" line.

**Classification:**
- Header + Topics section → **CONVERT**.
- Course note / Topic note toggle → **CONVERT (Course note)** + **SKIP (Topic note)** — if the notes backend only has course-scoped notes today, ship Course-note behavior and disable the Topic-note tab with a "coming soon" tooltip.
- Risk trend sparkline (6 bars) → **SKIP for pilot, CLARIFY** — needs historical risk-score data per student. `computeRiskScore(cutoffDate)` supports point-in-time computation, so a small backend endpoint that returns the last 6 weekly scores would enable this. Not urgent for pilot; mark as future.
- Persistence score line → **CONVERT** — already computed inside the risk-score adjustments.

---

## Overlay components (4 total)

### 8. Insights Assistant popup (currently `InstructorChatPanel.jsx`)

**Mockup:** compact 380px popup, header with icon + name + scope chip + close, body with the latest answer, "Try asking" section with 3 suggested prompts as chip buttons, input row.

**Classification:** **CONVERT** — matches existing `InstructorChatPanel.jsx` structure. Add the "Try asking" suggestions section and restyle the popup shell.

### 9. `⌘K` Command palette (new component)

**Mockup:** overlay dim + centered card, search input with ESC hint, results list with avatar + name + @handle + course + tier chip, empty state.

**Classification:** **CONVERT** — new component `components/instructor/CommandPalette.jsx`. **CLARIFY** — search scope endpoint (see sidebar note). For pilot, load all students on open, filter client-side.

### 10. Student detail drawer (new component)

**Mockup:** right-side drawer opened from the Students list expand action; contains header, 3-stat grid, risk trend, topic progress, instructor note textarea + Save + "Open full session".

**Classification:** **SKIP for pilot** — duplicates the Monitor page. The user has expressed a preference for one canonical route per surface; a drawer that mirrors Monitor doubles the maintenance without adding a new surface. Convert the "Monitor" button on the Students row to route to the Monitor page (already the pattern) and drop the drawer entirely. Revisit post-pilot if navigation feedback asks for it.

### 11. Toast notifications

**Mockup:** bottom-center dark pill.

**Classification:** **CONVERT** — thin utility. Add a `ToastContext` if one doesn't exist; a simple singleton state slice in `zustand` would work.

---

## Summary table

| # | View | File | Classification | Complexity |
|---|---|---|---|---|
| 1 | Sidebar | `InstructorShell.jsx` | CONVERT + ⌘K partial | Small |
| 2 | Dashboard | `InstructorDashboardPage.jsx` + `AgentBriefingCard.jsx` + `CourseCardsGrid.jsx` | CONVERT | Medium |
| 3 | Insights | `InstructorInsightsPage.jsx` + siblings | CONVERT + tooltip fix | Medium |
| 4 | Course Detail | `InstructorCourseDetailPage.jsx` + `HotSignalCard.jsx` | CONVERT + skip Duplicate topic + clarify milestones data | Large |
| 5 | Students | `InstructorStudentsPage.jsx` | CONVERT + clarify expand data | Medium |
| 6 | Courses list | `InstructorCoursesPage.jsx` | CONVERT | Small |
| 7 | Monitor | `InstructorStudentDetailPage.jsx` | CONVERT + skip Topic-note + skip Risk trend | Medium |
| 8 | Assistant popup | `InstructorChatPanel.jsx` | CONVERT | Small |
| 9 | Command palette | new `CommandPalette.jsx` | CONVERT (client-side search) | Small |
| 10 | Student drawer | – | SKIP entirely | – |
| 11 | Toast | new `ToastContext.js` | CONVERT | Small |

## What to skip and why

- **Topic-plan expandable rows with backend milestones data** — expand needs per-topic milestones. If the topic list endpoint doesn't return them, defer the expand affordance until the API adds it. Ship the collapsed row now.
- **Duplicate course / Duplicate topic** — no backend endpoint. Skip both menu items until backend is written.
- **Topic-note tab in Monitor** — backend has course-scoped notes only. Ship Course-note, disable Topic-note tab.
- **Risk trend sparkline (Monitor + Student drawer)** — needs historical risk-score endpoint. Show a static "Coming soon" placeholder or omit for pilot.
- **Student drawer overlay** — duplicates Monitor page; skip entirely, route "Monitor" button to the existing route.
- **⌘K global palette with cross-course search** — implement client-side (load all students on palette open, filter locally). No new backend for pilot.

## Design-system PR (do first, blocks everything else)

Ship this before the per-view PRs. Order matters — visual regressions if you invert:

1. Import Plus Jakarta Sans + JetBrains Mono via Google Fonts in `index.html`.
2. Extend `tailwind.config.js` `theme.extend.colors` with the palette above (or add a `colors.js` constant file consumed by each component).
3. Add global keyframes `fadeIn`, `riseIn`, `popIn` to `App.css` (or wherever globals live).
4. Adopt a shared `Card`, `Button` (primary/secondary/danger), `Kicker`, `Pill` component if the team wants — otherwise inline Tailwind classes match the mockup fine.

This is one PR, ~50 lines of config + a few JS files. Every subsequent view PR depends on this landing first.

## Implementation prompts

Prompts follow in the next section — one per view, self-contained. Each prompt references the mockup file, calls out no-touch zones, and lists the exact file paths.

# Implementation prompts — Claude Design integration

One prompt per PR. Every prompt references the extracted mockup at
`docs/mocks/user_mockup_extracted.html`. Search that file by the view name
listed under **Locate in mockup** to find the exact JSX pattern to mirror.
Every prompt assumes the design-system PR (fonts + colors + keyframes)
has already landed.

Ship in this order:
1. PR-0 (design system)
2. PR-1 (Sidebar)
3. PR-2 (Dashboard)
4. PR-3 (Insights)
5. PR-4 (Course Detail)
6. PR-5 (Students)
7. PR-6 (Courses list)
8. PR-7 (Monitor)
9. PR-8 (Assistant popup)
10. PR-9 (Command palette)
11. PR-10 (Toast)

---

## PR-0 — Design system (fonts, colors, keyframes)

**File(s):**
- `frontend/my-app/public/index.html` (add font imports)
- `frontend/my-app/tailwind.config.js` (extend colors + font family)
- `frontend/my-app/src/App.css` or `frontend/my-app/src/index.css` (keyframes)

**Task:**

1. In `public/index.html`, add above the existing font imports:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

2. In `tailwind.config.js`, extend theme:
```js
theme: {
  extend: {
    fontFamily: {
      sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    colors: {
      ink: {
        900: '#0f1729',
        600: '#3a4256',
        500: '#6b7385',
        400: '#8891a0',
        300: '#98a0b0',
        200: '#a9aec0',
        150: '#b0b7c3',
        100: '#c3c9d4',
      },
      hairline: {
        DEFAULT: '#e8eaee',
        soft: '#eef0f3',
        softer: '#f2f4f7',
      },
      surface: {
        DEFAULT: '#ffffff',
        subtle: '#f6f7f9',
        chip: '#f2f4f7',
      },
      brand: {
        DEFAULT: '#2563eb',
        pressed: '#1d4ed8',
      },
      assistant: {
        DEFAULT: '#4f46e5',
        deep: '#4338ca',
        tint: '#eef0fe',
        tintSoft: '#f4f2ff',
      },
      risk: {
        critical: '#b42318',
        criticalTint: '#fef3f2',
        criticalBorder: '#fecdca',
      },
      approve: {
        DEFAULT: '#067647',
        tint: '#ecfdf3',
        border: '#b8ecca',
      },
    },
    keyframes: {
      fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
      riseIn: {
        '0%': { opacity: 0, transform: 'translateY(8px)' },
        '100%': { opacity: 1, transform: 'translateY(0)' },
      },
      popIn: {
        '0%': { opacity: 0, transform: 'scale(.96)' },
        '100%': { opacity: 1, transform: 'scale(1)' },
      },
    },
    animation: {
      fadeIn: 'fadeIn .4s ease both',
      riseIn: 'riseIn .5s cubic-bezier(.2,.7,.2,1) both',
      popIn: 'popIn .15s ease both',
    },
  },
}
```

3. Apply Plus Jakarta Sans as the default body font via `body { @apply font-sans; }` in the global CSS. Do not delete any existing utility class overrides.

**Verification:**
- Boot the dev server. Any text renders in Plus Jakarta Sans.
- Any element with `font-mono` renders in JetBrains Mono.
- The new color tokens are usable as `bg-brand`, `text-ink-500`, etc.
- Add `animate-fadeIn` to a div and see it fade in.

**Do NOT commit** — leave for review.

---

## PR-1 — Sidebar

**File:** `frontend/my-app/src/layouts/InstructorShell.jsx` (120 lines currently)

**Locate in mockup:** search `user_mockup_extracted.html` for `aside` around line 380. Copy the visual pattern of brand block, `⌘K` search button, nav items, footer.

**Task:**

Restructure the sidebar so it matches the mockup:

1. **Brand block (top):** replace the single "Teach" line with two lines:
   - `Study Assist` in bold, `text-ink-900`, 16px, `tracking-tight`
   - `Teach · Instructor` in JetBrains Mono, 9px, `tracking-[.14em] uppercase`, `text-ink-300`

2. **⌘K search button (below brand, above nav):** new button that opens a command palette (see PR-9). For this PR, wire it to `window.dispatchEvent(new CustomEvent('open-command-palette'))` — PR-9 will listen. Style per mockup: bg `surface-subtle`, border `hairline`, `rounded-lg`, magnifying-glass SVG, "Search students" text, `⌘K` hint pill on the right.

3. **Nav items:** current list has Dashboard + Courses. Add:
   - **Students** → route `/instructor/students`
   - **Insights** → route `/instructor/insights` (or check what the current Insights route is in the router; if per-course only, this new top-level link opens a course picker page for now)
   
   If a top-level `/instructor/insights` route doesn't exist, add a placeholder page that lists course cards linking to `/instructor/courses/:id/insights`. Do not block on Insights nav — ship the button pointing to `/instructor/courses` if the route work is out of scope for this PR.

4. **Footer keeps Student view link + user pill** as-is. Style pill to match mockup (initials on tinted background, name + "Instructor" label, logout icon).

**No-touch:**
- Do not change the `<Outlet />` or main layout container.
- Do not remove `<InstructorChatPanel />`.
- Do not change routing behavior of the existing Dashboard/Courses items.

**Verification:**
- Sidebar shows "Study Assist / Teach · Instructor" brand.
- ⌘K button visible and clickable (opens nothing until PR-9).
- Students and Insights nav items visible and route to their pages.
- Active-state highlight matches mockup on all 4 nav items.
- No console errors.

**Do NOT commit.**

---

## PR-2 — Instructor Dashboard

**File:** `frontend/my-app/src/Pages/instructor/InstructorDashboardPage.jsx` (182 lines) + `frontend/my-app/src/components/instructor/AgentBriefingCard.jsx` + `frontend/my-app/src/components/instructor/CourseCardsGrid.jsx`

**Locate in mockup:** `<sc-if value="{{ isFront }}"` block, around lines 423–577.

**Task:**

Restructure Dashboard to the four-section layout:

1. **Header row:** title + subtitle + "Include synthetic cohort" toggle (switch style, not checkbox). Use the switch pattern from the mockup.

2. **Row 1 — Briefing + Need attention now (2 columns, 1.85fr : 1fr):**
   - **Left card (Today's briefing):** existing `AgentBriefingCard` restyled. Kicker "Today's briefing" + `grounded in your data` mono chip. Paragraph body. `Ask a follow-up →` link at the bottom that dispatches the existing follow-up event.
   - **Right card (Need attention now):** new red-bordered card (`border-risk-criticalBorder`, red left stripe). Contents:
     - Kicker "Need attention now" mono
     - Big count (Critical + High tier students across all courses)
     - Meta line "students · Critical + High across N courses"
     - Divider
     - Top 3 named at-risk students (name + course short name, click opens their Monitor)
     - Line "+ N more in the Watch tier"
     - Full-width dark red "Review the watchlist →" CTA at bottom (scrolls to Watchlist card below or routes to Students page filtered by Watch+)
   
   Data: existing `getInstructorOverview` returns per-course at-risk lists. Aggregate them. If no aggregation endpoint exists, do the aggregation client-side in the dashboard hook.

3. **Row 2 — 4 KPI figures:** keep the four current metrics (Courses, Total students, Total sessions, Session completion), restyled to the mockup pattern (label kicker + big number + unit).

4. **Row 3 — Watchlist card:** new section
   - Header row: title "Watchlist" + subtitle "Students to reach before class · one risk definition, everywhere"
   - Right-aligned filter tabs (All / Critical / High / Watch) with counts; segmented control style
   - Grouped list per tier — each group has a colored kicker + count + horizontal rule; each row = avatar circle (initials), name + @handle + course chip, summary line (`1 of 7 quizzed · avg 20%` etc), factor chips, big risk score /100 on the right with tier label, chevron
   
   Data: aggregate at-risk students across all courses via existing `getAtRiskStudents` (per course) or a new cross-course endpoint. Client-side aggregation is fine for pilot.

5. **Row 4 — Your courses grid:** keep `CourseCardsGrid.jsx`, restyle. Each card shows title, code + enrolled + published meta, red "N need attention" chip when applicable, chevron.

**No-touch:**
- `AgentBriefingCard` LLM call and follow-up event flow.
- Existing routes.
- Do not add new backend endpoints in this PR — aggregate client-side.

**Verification (as `javatutor` on `studyassist-iitl-keanu.web.app`):**
- Header + toggle work; toggling refreshes data.
- Briefing card + Need attention card render side by side.
- Need attention count = Critical + High across both courses.
- Clicking a named at-risk student opens their Monitor.
- KPI row shows 4 tiles.
- Watchlist card lists at-risk students grouped by tier, with tabs filtering.
- Course grid renders both courses with attention chip on CPS 1231-Mid.

**Do NOT commit.**

---

## PR-3 — Insights (per course)

**File:** `frontend/my-app/src/Pages/instructor/InstructorInsightsPage.jsx` (452 lines) + siblings in `frontend/my-app/src/components/instructor/`

**Locate in mockup:** `<sc-if value="{{ isReport }}"` block, around lines 579–786.

**Task:**

Restructure the Insights page to the mockup's IA:

1. **Header row:**
   - Left: "INSIGHTS" mono kicker (blue), course title `{{ reportTitle }}`, deck line
   - Right: synthetic-cohort chip (readonly indicator, chip style), `Edit course` and `Students` outline buttons

2. **5-cell KPI strip:** existing `PerformanceKPIStrip` restyled. Each tile = small label + big value (color-coded) + unit under. Use the tokens.

3. **"What stands out":** existing `InsightCards.jsx` restyled per mockup — 2-column grid, each finding card has colored dot + colored kicker + text + link CTA.

4. **"Who should I reach?":** the pilot centerpiece.
   - Section header + hint "Class composition by risk · click a bar to filter the list"
   - Two-column body: **Left (320px fixed)** = risk distribution bar chart (existing `RiskDistributionChart.jsx`, restyled with mockup bar dimensions and click-to-filter); **Right column** = tier chip row explicitly labeled "By tier" + reason chip row explicitly labeled "By reason" (closes E-Ins-3), then grouped at-risk student rows (same pattern as Watchlist in PR-2).
   - Empty state when filters return nothing.
   - **Fix the sticky tooltip bug (E-Ins-1) in `RiskDistributionChart.jsx`:** ensure the Recharts tooltip dismisses on `mouseleave` from the chart container.

5. **Course health collapsible card:**
   - Toggle button with title + preview text + chevron
   - When open: 2-column grid of Score distribution mini-chart + Completion funnel. Below: Course structure table (see PR extract of mock B, folded drafts pattern) with `Show N drafts with no data` toggle.

**No-touch:**
- Backend endpoints. Everything can be computed with existing data.
- `TopicStudentHeatmap` (not in the mockup at this level — keep it if it's referenced from a linked page, otherwise leave it collapsed).

**Verification:**
- Header + KPI strip + What stands out + Who should I reach + Course health all render.
- Bar chart click filters the at-risk list.
- Filter chips by tier and by reason combine correctly.
- Course health toggles open/close; score distribution + funnel render inside.
- Course structure shows 7 published rows; "Show 8 drafts" expands the draft list.
- No sticky tooltip artifacts on the risk distribution chart.

**Do NOT commit.**

---

## PR-4 — Course Detail (Desk)

**File:** `frontend/my-app/src/Pages/instructor/InstructorCourseDetailPage.jsx` (701 lines) + `frontend/my-app/src/components/instructor/HotSignalCard.jsx`

**Locate in mockup:** `<sc-if value="{{ isDesk }}"` block, around lines 787–971.

**Task:**

Restructure Course Detail to the mockup:

1. **Breadcrumb** `← All courses` link at top.

2. **Header row:**
   - Left: course title + access code line (code chip + Copy link + separator + status line)
   - Right: blue `View insights →` button + `⋯` overflow menu with Duplicate course / Copy access code / Delete course (red)
   - **SKIP** the "Duplicate course" menu item — no backend endpoint exists. Show only Copy access code + Delete course.

3. **5-cell strip:**
   - 4 KPI cards (Enrolled / Sessions / Session completion / Topics · 7 published)
   - **Hot signal** as the 5th cell — restyle `HotSignalCard.jsx` to match mockup indigo tint, mono kicker, body text, "Open in Insights →" link
   - Keep the state-dependent layout gating from D3: the entire 5-cell strip + two-column body renders only when `publishedCount > 0` (functional mode). Setup mode remains single-column.

4. **Two-column body (functional mode only):**
   - **Left (1.7fr): Topics card**
     - Section header "Published · 7" mono kicker
     - Each published topic row = chevron + name + tier badge (INTRO/CORE) + meta + `Edit` outline button + `⋯` overflow (Unpublish, Delete)
     - Section header "Drafts · 8" mono kicker (border-top)
     - Each draft topic row = same layout but with green `Approve` button + `⋯` (Edit, Delete)
     - Expandable row: chevron toggles expand; expanded state shows syllabus unit line, "Milestones" kicker + bulleted milestones list, "Quiz · X pattern" summary
     - **CLARIFY milestones data:** check `courseApi.js → listInstructorCourseTopics`. If it returns milestones per topic, wire them. If not, the expand affordance shows only the unit line and quiz summary; hide the Milestones section behind an inner fetch on expand or omit it for this PR.
   - **Right (1fr, sticky top): rail**
     - **AI teaching instructions** — grown textarea (`min-h-[172px]`, resize-vertical), Save (dark) + "Applies to all topics" hint on the right
     - **Course materials** — file row (icon + name + word count + Syllabus chip) + dashed `Upload files` button
     - **Topic plan chat** — the existing chat, restyled with per-turn message bubbles (user right-aligned, AI left-aligned) + text input + indigo `Modify draft topics` button

**No-touch:**
- Chat scroll containment fix from D4.
- State-dependent layout gate (`publishedCount > 0`).
- Existing Modify confirmation modal (A1 shipped).
- Any Delete-course confirmation dialog (N8 window.confirm).

**Verification:**
- Breadcrumb, header, ⋯ menu with Copy code + Delete course.
- 5-cell strip renders KPIs + Hot signal.
- Topics section shows Published/Drafts groups; expand reveals unit + milestones (if data) + quiz line.
- Rail sticky-scrolls with the left column.
- AI Instructions textarea shows full content without inner-scroll.
- Setup mode still renders single-column when `publishedCount === 0`.

**Do NOT commit.**

---

## PR-5 — Students (list)

**File:** `frontend/my-app/src/Pages/instructor/InstructorStudentsPage.jsx` (257 lines)

**Locate in mockup:** `<sc-if value="{{ isStudents }}"` block, around lines 972–1035.

**Task:**

1. Header row: title + subtitle "N across 2 courses · X need attention".

2. Filter tabs (All / Critical / High / Watch) as segmented control + search input right-aligned.

3. Table body: rows with avatar + name + @handle + course chip + joined-line, topics label + points, risk badge, topic-pass pill, `Monitor` outline button, `⋯` chevron to expand.

4. Expanded row: 2-column mini-grid "Topic progress" — each entry = topic name + progress bar + status label.
   - **CLARIFY:** the per-student per-topic progress data. If `getStudentDetail` or a topic-progress endpoint exists for a student, wire it. If not, keep the row expandable but populate on click with an inline fetch. If not feasible, hide the expand affordance and route `Monitor` to the full page (skip the inline mini-grid).

**No-touch:**
- Monitor button routing (existing).
- Backend endpoints.

**Verification:**
- Filter tabs count and filter correctly.
- Search filters client-side by name/handle.
- Row expand shows topic progress mini-grid (or is hidden if data unavailable).

**Do NOT commit.**

---

## PR-6 — Courses (list)

**File:** `frontend/my-app/src/Pages/instructor/InstructorCoursesPage.jsx` (121 lines)

**Locate in mockup:** `<sc-if value="{{ isCourses }}"` block, around lines 1037–1061.

**Task:**

1. Title + subtitle "Create a course, then add a syllabus to generate topics."
2. Create input row: text input + blue "Create course" button.
3. Course list rows: colored icon (blue tint bg + book SVG) + title (bold) + meta line (Code + enrolled + published) + red "N need attention" chip when applicable + chevron.
4. Row is clickable → routes to Course Detail.

Straightforward JSX. All data available.

**No-touch:** Route wiring.

**Verification:**
- List shows both courses.
- "Need attention" chip appears when Critical + High > 0.
- Creating a course still works.

**Do NOT commit.**

---

## PR-7 — Monitor (student detail)

**File:** `frontend/my-app/src/Pages/instructor/InstructorStudentDetailPage.jsx` (798 lines)

**Locate in mockup:** `<sc-if value="{{ isMonitor }}"` block, around lines 1063–1134.

**Task:**

1. **Header:** back link + avatar + name + meta line + factor chips; right side = tier kicker + big score /100

2. **Two-column body:**
   - **Left (1.7fr): Topics card** — each row = topic name + updated timestamp + progress bar + status label + `View session` outline button
   - **Right (1fr, sticky): rail**
     - **Instructor notes card:** segmented Course-note / Topic-note toggle + textarea + `Save note` button
       - **SKIP Topic-note tab if no backend:** if only course-scoped notes exist, keep both tabs visible but disable Topic-note with a title tooltip "Coming soon"
     - **Risk trend card:** 6-bar sparkline + trend label + "Persistence N/100 — {note}" line
       - **SKIP Risk trend for pilot** — no historical risk-score endpoint. Show a static placeholder ("Trend history coming soon") or omit the sparkline; keep the Persistence line only if that datum exists from `computeRiskScore` result

**No-touch:**
- Existing session replay if present.
- Existing note save endpoint.

**Verification:**
- Header + tier + score render.
- Topics section clickable to session view.
- Course notes save/load.
- Topic-note tab either hidden or disabled with tooltip.
- Persistence line renders if data is available.

**Do NOT commit.**

---

## PR-8 — Insights Assistant popup

**File:** `frontend/my-app/src/components/instructor/InstructorChatPanel.jsx`

**Locate in mockup:** the assistant popup at lines 1145–1167 (opened state).

**Task:**

Restyle the assistant popup shell to match the mockup:

1. Header row: small icon (assistant tint bg + bolt SVG) + name + "All courses" scope chip + close button.
2. Body: max-height 280px scrollable; shows the latest response text + a "Try asking" mono kicker + 3 suggestion chip buttons (fetch a few pre-seeded suggestions from a constant array for pilot).
3. Footer input row: input + send button (indigo, arrow up icon).

**No-touch:**
- Backend chat API contract (D5 shipped).
- Iteration/token limits, prompt, name→id resolution.
- Session persistence.
- Clear button behavior.

**Verification:**
- Popup opens matching the mockup.
- Latest response renders in the body.
- Suggestion chips send their prompt on click.
- Input + send work.

**Do NOT commit.**

---

## PR-9 — Command palette (⌘K)

**File:** new `frontend/my-app/src/components/instructor/CommandPalette.jsx`; wire into `InstructorShell.jsx`.

**Locate in mockup:** lines 1169–1194 (paletteOpen block).

**Task:**

Create a new component that:

1. Listens for `open-command-palette` custom event fired from the sidebar button in PR-1.
2. Also listens for global keyboard shortcut `cmd+k` / `ctrl+k` (add `useEffect` with `keydown` handler on `window`).
3. Renders a modal overlay (dim background + centered card) when open.
4. Card: search input with autofocus + ESC hint chip on the right.
5. Body: results list with avatar + name + @handle + course chip + tier label. Row is clickable → routes to student's Monitor.
6. Empty state: "No students match `{query}`".
7. On open, loads all students across all instructor courses (client-side aggregation via existing `listInstructorCourses` → per-course student list). Cache the list for the session.
8. Filter locally by substring match against name + @handle.

**No-touch:**
- Backend.
- Any existing routing.

**Verification:**
- ⌘K opens palette from any instructor page.
- Sidebar button also opens it.
- Typing filters results.
- Clicking a result closes palette and routes to Monitor.
- ESC closes.

**Do NOT commit.**

---

## PR-10 — Toast

**File:** new `frontend/my-app/src/components/Toast.jsx` (or extend existing state management if there's a global store) + wire show/hide.

**Locate in mockup:** lines 1266–1268 (toastShow block).

**Task:**

Simple toast utility:

1. `useToastStore` (Zustand slice) with `{message, show, showToast(msg, ms=2400)}`.
2. `<ToastMount />` component rendered inside `InstructorShell.jsx` main container that reads from the store.
3. Toast style: fixed bottom-center, dark ink pill, white text, popIn animation, auto-dismiss after `ms`.
4. Wire existing "Copy access code", "Save instructions", "Save note" actions to call `showToast('Copied' | 'Saved')`.

**No-touch:**
- Any existing snackbar / alert wiring (if it exists — check for conflicts first).

**Verification:**
- Copy access code → toast "Copied".
- Save AI instructions → toast "Saved".
- Save monitor note → toast "Saved".
- Toast auto-dismisses.

**Do NOT commit.**

---

## What we're skipping (from the mockup, on purpose)

Reasons for each — call these out in the audit doc when this all lands:

- **Student detail drawer (mockup lines 1196–1264):** duplicates the Monitor page. Route the "Monitor" button from Students table to the existing Monitor page instead. Revisit post-pilot if navigation feedback asks for it.
- **Duplicate course menu item:** no backend endpoint; skip until backend is written.
- **Duplicate topic menu item:** same.
- **Risk trend historical sparkline:** needs an endpoint returning weekly risk scores per student; not urgent for pilot. `computeRiskScore(cutoffDate)` supports it in principle — future work.
- **Topic-scoped instructor notes:** only course-scoped notes exist today. Ship Course-note; disable Topic-note tab.
- **Per-topic milestones in expandable rows (Course Detail):** contingent on topic-list API returning milestones. If not there, expand shows only unit + quiz line.

---

## PR sequencing and estimated size

| PR | Size | Depends on |
|---|---|---|
| 0 | ~50 lines | – |
| 1 Sidebar | ~150 lines | 0 |
| 2 Dashboard | ~400 lines | 0, 1 |
| 3 Insights | ~500 lines | 0 |
| 4 Course Detail | ~500 lines | 0 |
| 5 Students | ~250 lines | 0 |
| 6 Courses list | ~120 lines | 0 |
| 7 Monitor | ~350 lines | 0 |
| 8 Assistant popup | ~150 lines | 0 |
| 9 Command palette | ~200 lines new file | 0, 1 |
| 10 Toast | ~60 lines new + 20 lines wire-in | 0 |

Total across the batch: roughly ~2,700 lines of frontend changes across 11 PRs. Backend untouched.

Ship PR-0 first as its own commit. After that, PRs 1–10 can go in whichever order matches your review capacity; they're mutually independent except for the shared design tokens.

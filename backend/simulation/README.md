# Simulation harness

External HTTP-only synthetic-student generator. Produces a cohort of
synthetic students across 4 backgrounds × 3 positions-in-class, drives
them through a course via the public API (same endpoints a browser hits),
and backdates the resulting records so the dashboard shows a realistic
activity arc.

Only `backdate.js`, `clean.js`, and `snapshot.js` touch MongoDB directly.
The runner itself never imports from `backend/services`, `backend/routes`,
or `backend/models`.

## Running for the professor study

Four named recipes cover the full matrix of cohort sizes and semester
shapes. Use these by name instead of memorizing flag combos:

| Recipe | Cohort size | Use case |
|---|---|---|
| `local-small-full` | 6 | Smoke test on a 15-week, end-of-semester course |
| `local-small-mid` | 6 | Smoke test on a mid-semester course (~half of 15 topics published) — strugglers stall at topic 1 |
| `study-full-semester` | 20 | Paper-grade cohort on a fully-published 15-week course |
| `study-mid-semester` | 20 | Paper-grade cohort on a mid-semester course (7 of 15 topics published) |

```bash
# 1. Smoke test first (cheap — ~6 students, ~5 min, small Groq spend)
npm run simulate -- --recipe=local-small-full --accessCode=<COURSE_A_CODE>
npm run simulate -- --recipe=local-small-mid  --accessCode=<COURSE_B_CODE>

# 2. When UI looks right, run paper-grade cohorts
npm run simulate:clean -- --courseId=<COURSE_A_ID>
npm run simulate -- --recipe=study-full-semester --accessCode=<COURSE_A_CODE>

npm run simulate:clean -- --courseId=<COURSE_B_ID>
npm run simulate -- --recipe=study-mid-semester --accessCode=<COURSE_B_CODE>
```

Each run writes:
- `backend/simulation/snapshots/run-manifest.json` — the legacy machine
  manifest `backdate.js` reads from.
- `backend/simulation/manifests/<courseId>-<recipe>-<date>.json` — the
  paper-grade machine manifest (full roster, seed, API base URL, counts).
- `backend/simulation/manifests/<courseId>-<recipe>-<date>.md` — a
  roster table + recipe parameters, copy-pasteable into the methods
  section.

Recipes default `--backdate=on`, so timestamps are remapped inline. To
disable, pass `--backdate=false` (or read the code — CLI flags override
recipe defaults).

### Impersonating a synthetic student during think-aloud

Every synthetic student uses the **same password**: `SimStudent!2025`
(configurable via `SIM_PASSWORD` env var). Their usernames follow the
`firstlast<NN>` pattern (e.g. `priyasharma07`), recorded in the manifest
for each run. To impersonate any student during a think-aloud session,
log in with `<username>` + `SimStudent!2025`.

This is the intended flow for the study — the professor can click into
"any student's perspective" without us hand-crafting credentials.

### Reading a manifest

```
backend/simulation/manifests/3f8a91-study-mid-semester-2026-04-22.md
```

The Markdown manifest lists every student (display name, username,
persona tag, progress cap, topic/quiz counts, user-id suffix). The
JSON sibling is the same data plus low-level fields (seed, full user
IDs, per-student block timestamps, API base URL used).

Manifests are git-ignored (one per run). Commit a representative sample
to the paper repo if the study needs to cite the exact roster.

## Prereqs

```
# backend .env (same file the server reads)
GROQ_API_KEY=...
MONGODB_URI=mongodb://...
# optional
SIM_API_BASE_URL=http://localhost:3000/v1   # frontend dev proxy → backend :5001
SIM_CONCURRENCY=3
SIM_GROQ_MODEL=llama-3.1-8b-instant
SIM_PASSWORD=SimStudent!2025                # shared password for all sim students
```

Backend server must be running (`npm run dev` in `backend/`) and must have
a published course with at least one topic. You need its access code.

## Deploy toggle (running against a non-local host)

When the system deploys to its own URL, point the simulator at it:

```bash
# 1. sanity check the target is reachable
curl https://<deploy-host>/v1/health

# 2. run the same recipe against the deployed backend
SIM_API_BASE_URL=https://<deploy-host>/v1 \
  npm run simulate -- --recipe=study-full-semester --accessCode=<A>
```

The recipe is identical — only the env var changes. Manifests record
`apiBaseUrl`, so a cohort generated against the deployed host is
unambiguously distinguishable from a localhost cohort in the paper.

## Lifecycle commands

```
# Preview what a clean would remove (safe, read-only)
npm run simulate:clean:dry

# Delete all isSynthetic users + their data (scoped if --courseId passed)
npm run simulate:clean
npm run simulate:clean -- --courseId=<id>

# Snapshot the DB state between professor sessions
npm run simulate:snapshot -- --label=week4-baseline
npm run simulate:restore  -- --label=week4-baseline

# Standalone backdate (if you ran simulate without --backdate)
npm run simulate:backdate
```

## CLI flags

`--recipe=<name>` is the usual entry point. For manual flag-driven runs:

| flag | default | purpose |
|---|---|---|
| `--accessCode` | *(required)* | course the synthetic students join |
| `--recipe` | — | named recipe; see table above |
| `--distribution` | `avg:8,fail:6,excellent:6` | position-in-class counts (overrides recipe) |
| `--backgrounds` | `all` | comma-list of background IDs, or `all` |
| `--totalCap` | `20` | cap on roster size |
| `--seed` | `42` | seeds the position shuffle + name pool |
| `--weeksPerTopic` | `1` | simulated-week advance per topic |
| `--backdate` | on (via recipe) | run `backdate.js` inline after the HTTP run |
| `--label` | — | write a labelled copy of the manifest |
| `--help` | — | print help and exit |

CLI flags override recipe defaults. So
`--recipe=study-full-semester --totalCap=10` gives you a paper-grade
recipe shrunk to 10 students.

## Persona model

Backgrounds: `upperMajorNonCS`, `firstYearNoProg`, `firstYearLotsProg`,
`scriptingExperienced`. Positions: `aboutToFail`, `excellent`, `average`.
Each background sets profile fields (major, programmingExposure, motivation,
confidence); each position sets ability (`p(correct)`), retry policy, and
talkativeness. `syntheticStudent.js` composes the two and adds a Groq system
prompt that keeps the student in-character across chat turns.

For the full persona matrix and study-methodology framing see
[`../../research/simulation-methodology.md`](../../research/simulation-methodology.md).

## Analytics contamination

Synthetic users are marked `profile.isSynthetic = true`. Instructor
analytics default to `excludeSynthetic: true`. For the professor study,
flip the `includeSynthetic` toggle in the Insights/Overview UI — the
synthetic cohort **is** the study data there.

`MilestoneAttempt.isSynthetic` is cached at write time, so the tagger
(`tagSynthetic.js`) runs *immediately after signup* and before any
learning event. Tagging post-hoc leaves every attempt row cached as
`isSynthetic=false` and breaks the analytics filter.

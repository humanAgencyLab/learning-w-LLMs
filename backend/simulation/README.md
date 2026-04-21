# Simulation harness

External HTTP-only synthetic-student generator. Produces a cohort of 20
synthetic students across 4 backgrounds × 3 positions-in-class, drives
them through a course via the public API (same endpoints a browser hits),
and optionally backdates the resulting records so the dashboard shows a
12-week activity arc.

Only `backdate.js`, `clean.js`, and `snapshot.js` touch MongoDB directly.
The runner itself never imports from `backend/services`, `backend/routes`,
or `backend/models`.

## Prereqs

```
# backend .env (same file the server reads)
GROQ_API_KEY=...
MONGODB_URI=mongodb://...
# optional
SIM_API_BASE_URL=http://localhost:3000/v1
SIM_CONCURRENCY=3
SIM_GROQ_MODEL=llama-3.1-8b-instant
```

Backend server must be running (`npm run dev` in `backend/`) and must have
a published course with at least one topic. You need its access code.

## Flow

```
# 1. smoke test (6 students)
npm run simulate -- --accessCode=ABC123 --distribution=avg:2,fail:2,excellent:2 --totalCap=6

# 2. full run, labelled for snapshotting
npm run simulate -- --accessCode=ABC123 --distribution=avg:8,fail:6,excellent:6 --label=week4

# 3. backdate timestamps to fake a 12-week semester
npm run simulate:backdate

# 4. snapshot the DB so you can restore between professor sessions
npm run simulate:snapshot -- --label=week4-baseline
npm run simulate:restore -- --label=week4-baseline

# 5. teardown after a study
npm run simulate:clean:dry   # preview
npm run simulate:clean       # delete all isSynthetic users + their data
```

## CLI flags

| flag | default | purpose |
|---|---|---|
| `--accessCode` | *(required)* | course the synthetic students join |
| `--distribution` | `avg:8,fail:6,excellent:6` | position-in-class counts |
| `--backgrounds` | `all` | comma-list of background IDs, or `all` |
| `--totalCap` | `20` | cap on roster size |
| `--seed` | `42` | seeds the position shuffle |
| `--weeksPerTopic` | `1` | simulated-week advance per topic |
| `--backdate` | off | run `backdate.js` inline after the HTTP run |
| `--label` | — | write a copy of the manifest as `manifest-<label>.json` |

## Persona model

Backgrounds: `upperMajorNonCS`, `firstYearNoProg`, `firstYearLotsProg`,
`scriptingExperienced`. Positions: `aboutToFail`, `excellent`, `average`.
Each background sets profile fields (major, programmingExposure, motivation,
confidence); each position sets ability (`p(correct)`), retry policy, and
talkativeness. `syntheticStudent.js` composes the two and adds a Groq system
prompt that keeps the student in-character across chat turns.

## Analytics contamination

Synthetic users are marked `profile.isSynthetic = true`. Instructor analytics
default to `excludeSynthetic: true`. For the professor study, flip the
`includeSynthetic` toggle in the Insights/Overview UI — the synthetic cohort
**is** the study data there.

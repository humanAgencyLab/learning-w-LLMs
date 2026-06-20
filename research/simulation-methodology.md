# Synthetic-cohort simulation methodology

This document describes how the synthetic student cohorts cited in the
professor-evaluation study were generated. It is the methods-section
companion to [`study-design.md`](./study-design.md) and the operational
instructions in [`backend/simulation/README.md`](../backend/simulation/README.md).

## Why a synthetic cohort

Recruiting 20 real students per study session is impractical and
introduces confound between *instructor sensemaking* (what we are studying)
and *learner behavior* (which we fix to a controlled distribution).
Instead, each think-aloud session is run against a curated cohort of
20 simulated students whose behavior is driven by persona-prompted LLM
replies and gated probabilistic quiz answers. The instructor interacts
with the UI exactly as they would with a real class; only the students'
actions are synthetic.

## Persona design (4 × 3 matrix)

Every synthetic student is the composition of one **background** and one
**position-in-class**. The matrix is implemented in
`backend/simulation/personas/` — backgrounds in `personas/background/*.js`,
positions in `personas/position/*.js`, and `personas/index.js` composes
them at runtime.

**Backgrounds** (4 — capture prior exposure and motivation):

1. `upperMajorNonCS` — upper-year non-CS major, curious but unfamiliar with programming.
2. `firstYearNoProg` — first-year student with zero prior programming exposure.
3. `firstYearLotsProg` — first-year student with substantial prior programming (e.g. from high school).
4. `scriptingExperienced` — has scripted in another domain (bioinformatics, Excel VBA, bash) and now needs formal CS fundamentals.

Each background provides profile-page fields (major, programming
exposure, motivation type, self-confidence, self-rating) and an
answer-style profile (preferred reply length, formality).

Each background additionally fixes the student's `learningType` and
`explanationLength` profile settings (e.g. `firstYearNoProg` students
are `Visual` + `Detailed`; `firstYearLotsProg` are `Reading/Writing` +
`Concise`). These feed the tutor's profile-aware system prompt via the
same `PUT /profile` code path real students use, so the professor study
sees per-student tutor differentiation without any simulator-only
prompt logic. Fixing these per background is a study convenience — it
guarantees all four modality × length combinations appear in a single
20-student cohort. We do not claim the fixed pairings reflect a
real-world distribution; they exist so the think-aloud shows varied
tutor behavior by default.

**Positions-in-class** (3 — capture ability and engagement):

1. `excellent` — high base correctness (`p(correct)` ≈ 0.9), confident replies, rarely gives up.
2. `average` — mid base correctness (`p(correct)` ≈ 0.65), normal retry policy.
3. `aboutToFail` — low base correctness (`p(correct)` ≈ 0.35), higher confusion rate, non-zero `giveUpProbability` per milestone.

Each position provides an `abilityFn` (for chat-side reflection checks),
a `quiz` policy (`baseCorrectProb`, `noiseStddev`), a `retryPolicy`, a
`reflection` policy (`confusionRate`), and a persona-suffix prompt the
LLM uses to stay in-character.

Any (background, position) pair is valid, yielding 12 distinct persona
tags. Every created user records its tag in `profile.personaTag` so any
behavior in the resulting data can be traced back to the persona that
produced it.

## Name generation

Usernames like `sim_umn_exc_1745300000_03` are unambiguous for debug
logging but break the think-aloud illusion. To give every synthetic
account a real-feeling human identity we sample from a hand-curated pool
(`backend/simulation/namePool.js`):

- **~40 first names × ~40 last names** (~1600 combinations).
- Explicit diversity rubric: the pool includes representative names from
  European, South Asian, East Asian, African / African-diaspora, Hispanic /
  Latinx, Middle Eastern / North African, and Southeast Asian origins, at
  roughly even counts.
- Sampling is **seeded** (same `(seed, count)` → same roster) and uses a
  Fisher-Yates shuffle with a linear-congruential PRNG (identical pattern
  to the runner's existing position shuffle; no new dependency).
- Usernames are derived as `firstlast<NN>` (lowercase-ascii, 2-digit
  index), satisfying the signup route's `^[a-zA-Z0-9_]{3,30}$` regex.
- No name is ever assigned to a real user — names live only on accounts
  with `profile.isSynthetic: true`.

## Progress-cap mechanism (partial-semester cohorts)

A think-aloud session on a **mid-semester** course should show a
realistic "roughly halfway through a 15-week course" snapshot —
strugglers stalling at the first module, average students partway, top
students caught up. The numbers below are tuned for the CPS 1231
syllabus (15 weekly units → 15 topics published in the full course,
7 published for the mid-semester cohort). Without a cap, every student
would run through every published topic and the page would feel
uniformly complete.

Recipes marked `*-mid` apply a `progressCap` table:

| Position | Cap (1-based topic index) |
|---|---|
| `aboutToFail` | 1 |
| `average` | uniform random in [3, 5] per student |
| `excellent` | 7 (all published topics) |

The runner stops each student's attempt loop after their capped topic,
so a mid-semester cohort produces stratified at-risk signal, a
non-uniform topic-×-student heatmap, and a completion funnel with real
drop-off. `*-full` recipes leave the cap null.

## Tagging and reproducibility

Every synthetic user receives:

- `profile.isSynthetic: true`
- `profile.personaTag: <background>__<position>`

These fields are set via a direct MongoDB write immediately after signup
(`backend/simulation/tagSynthetic.js`) because `MilestoneAttempt` caches
`isSynthetic` at write-time. Tagging post-hoc would leave attempts
un-filtered in analytics.

The instructor analytics layer reads these tags: Insights queries
default to `excludeSynthetic: true`, and the UI toggle "Include synthetic
cohort" flips the filter. The simulator therefore never contaminates the
production signal path — real-student analytics stay clean regardless of
how many sim runs we execute.

For a full reproducibility record, each run produces a manifest
(`backend/simulation/manifests/<courseId>-<recipe>-<date>.{json,md}`)
containing:

- Recipe name and resolved parameters
- PRNG seed
- Full roster (`displayName`, `username`, `personaTag`, `userId`)
- Per-student topic and quiz counts
- Timestamps
- `SIM_API_BASE_URL` (so we record which deployment this cohort targets)

The `.md` manifest is a copy-pasteable methods-section table.

## Recipes used in the study

Four recipes are defined in `backend/simulation/recipes.js`. The study
paper cites the two `study-*` recipes; `local-*` are iteration smoke
tests.

| Recipe | Cohort size | Distribution (pos) | Progress cap | Backdate window |
|---|---|---|---|---|
| `local-small-full` | 6 | 2 / 2 / 2 | none | 15 weeks |
| `local-small-mid` | 6 | 2 / 2 / 2 | mid-sem table above | 7 weeks |
| `study-full-semester` | 20 | 8 / 6 / 6 | none | 15 weeks |
| `study-mid-semester` | 20 | 8 / 6 / 6 | mid-sem table above | 7 weeks |

Position order: `average / aboutToFail / excellent`. Backgrounds are
evenly cycled across all 4 backgrounds regardless of recipe.

## Limitations

1. **LLM reply realism.** Chat replies are produced by a Groq-hosted
   instruct model via per-persona prompts. Replies are fluent and in
   character, but the model does not simulate *learning trajectories*
   (it doesn't genuinely internalize a topic across turns the way a real
   student would). The primary study signal — KPIs, heatmaps, at-risk
   panels — is driven by the gated quiz and reflection policies, not the
   chat text, so this limitation is bounded.
2. **No cross-student social signal.** Synthetic students do not interact
   with each other (no forum posts, no shared-document edits). The
   instructor UI today does not expose cross-student social data, so this
   is not a current gap, but it constrains the generalizability of the
   cohort to instructor features that might be added later (e.g. peer-
   comparison views).
3. **Backdate is post-hoc timestamp rewriting.** Attempt timestamps are
   remapped into a simulated semester window after the HTTP run
   completes. This is the only place the simulator bypasses the public
   API. The rewrite preserves within-week ordering and honors each
   student's simulated-week block boundaries.
4. **Groq cost bounds re-runs.** A full 20-student run costs several
   thousand Groq calls. We therefore pin a cohort with
   `npm run simulate:snapshot` and restore it between think-aloud
   sessions, rather than regenerating the cohort each time.

## Reproducing the study cohort

```bash
# Assuming the app is running locally on port 3000 (frontend) proxying to
# the backend on 5001, and MONGODB_URI + GROQ_API_KEY are set in backend/.env.
cd backend

# Full-semester course (instructor has all 15 topics published)
npm run simulate -- --recipe=study-full-semester --accessCode=<A>

# Mid-semester course (instructor has 7 of 15 topics published)
npm run simulate -- --recipe=study-mid-semester --accessCode=<B>
```

Each command writes a manifest under `backend/simulation/manifests/` that
records the exact seed, recipe, roster, and API base URL used. For the
deployed study, set `SIM_API_BASE_URL=https://<deploy-host>/v1` before
running the same command.

## Cross-references

- Operational README: [`backend/simulation/README.md`](../backend/simulation/README.md)
- Study protocol: [`research/study-design.md`](./study-design.md)
- Token-budget planning: [`research/token-budget.md`](./token-budget.md)

# Gemini migration plan (branch: `gemini-migration`)

**Why:** the app runs on the researcher's personal Groq key. Moving it to the
professor's Groq account is blocked (Developer-tier upgrades "temporarily
unavailable due to high demand"), and the professor has a Google AI Studio
token budget instead. This branch migrates the backend's LLM provider from
Groq (`openai/gpt-oss-120b`) to Gemini, behind a provider toggle so the live
study keeps running on Groq until cutover and rollback is a traffic flip.

**Working mode:** Opus subagents implement each phase from the specs below;
Fable reviews diffs, runs the suite and live harnesses, and handles deploys.

---

## 0. Why this is tractable: the August choke points

The Groq model migration (2026-08-17) forced every runtime call site through
four files. Nothing else in the codebase talks to the LLM directly:

| Choke point | Role |
|---|---|
| `backend/lib/llmClient.js` | client singleton (`getGroqClient`) + `wrapWithReasoningDefaults` (injects `reasoning_effort:'low'` for gpt-oss); `setGroqClient`/`resetGroqClient` test seams |
| `backend/agents/framework/baseAgent.js` | `runAgent` (single-shot JSON, 15 s default timeout, `reasoningEffort` passthrough, `scaledGenerationTimeoutMs`) + `runAgentWithTools` (OpenAI-style tools loop — instructor insights, 8 tools) |
| `backend/agents/framework/modelRouter.js` | `CHEAP_MODEL()`/`EXPENSIVE_MODEL()` from `GROQ_MODEL_CHEAP`/`GROQ_MODEL` env + `TASK_MODEL_MAP` |
| `backend/services/teacherService.js` | `callTeacherAPI` / `callTeacherAPIStream` (SSE streaming; `response_format: json_object` for composer turns) |

Direct consumers all go through those (sweep done 08-17): simulationRunService,
syntheticStudent (CLI twin, via `wrapWithReasoningDefaults`), contextControl
summarizer, probe-intent classifier, code_check, quizGenerator, all `agents/*`.

## 1. Approach: OpenAI-compat endpoint behind a provider factory

Gemini exposes an **OpenAI-compatible endpoint**
(`https://generativelanguage.googleapis.com/v1beta/openai/`) usable with the
`openai` npm package: chat completions, streaming, function calling, JSON
mode, and `reasoning_effort` mapping for 2.5 thinking models. Using it means
**every call site keeps its current `chat.completions.create` shape** — the
migration concentrates in `llmClient.js`.

- `LLM_PROVIDER=groq|gemini` env selects the client in the factory.
  - `groq` → current behavior, byte-identical (study safety).
  - `gemini` → `new OpenAI({ apiKey: GEMINI_API_KEY, baseURL: <compat> })`
    wrapped in a param-translation layer (below).
- Model names via neutral env `LLM_MODEL` / `LLM_MODEL_CHEAP` (modelRouter
  falls back to the existing `GROQ_MODEL*` vars so Groq revisions need no env
  change).
- Proposed models: **`gemini-2.5-flash` for BOTH tiers** initially (mirrors
  today's single-model setup; study consistency > cost micro-optimization).
  `gemini-2.5-flash-lite` for the cheap tier is a later option.
- Key handling: professor's key into Secret Manager as `gemini-api-key`,
  mounted `--set-secrets GEMINI_API_KEY=gemini-api-key:latest`. Never in code,
  repo, or logs — same discipline as `groq-api-key`.

### Param-translation wrapper (the Gemini analog of `wrapWithReasoningDefaults`)

| Groq/gpt-oss usage | Gemini mapping | Risk to verify |
|---|---|---|
| `reasoning_effort: 'low'|'medium'` (wrapper + explicit call sites) | compat layer maps `reasoning_effort` → thinking budget on 2.5 models; else translate to `extra_body.google.thinking_config` | **Thinking tokens consume `max_tokens` exactly like gpt-oss reasoning** — the trap that bit us three times (briefing, probe classifier, sim students). Re-measure every small budget. |
| `response_format: {type:'json_object'}` (composer, runAgent jsonMode) | supported on compat layer | verify no schema requirement |
| tools / `tool_choice:'auto'` loop (`runAgentWithTools`) | supported | verify `finish_reason`, `message.tool_calls`, `role:'tool'` round-trip shapes match the loop's expectations |
| streaming (`callTeacherAPIStream`) | supported | chunk delta shape |
| multiple `system` messages (teacherService sends up to 3: persona + instructor + context summary) | compat layer may accept only one | if needed, merge system messages in the adapter — do NOT touch teacherService |
| `temperature`, `top_p`, `max_tokens` | pass through | Gemini temperature range 0–2; our values (0–0.85) are safe |

### Token budgets to re-measure on Gemini (Phase 0 probe)

Every budget sized for gpt-oss reasoning: probe classifier 300, assessment
400, student replies 600, code_check 900 (reasoning medium), composer 1400,
insight cards 900, topic plan ≤11k (+ scaled timeouts 30 s + 5 s/topic,
cap 120 s — Gemini latency profile differs; re-time a 15-topic generation).

## 2. Phases

> **CUTOVER COMPLETE 2026-10-07:** 100% of traffic serves revision 00074
> (`LLM_PROVIDER=gemini`, `gemini-3.8-flash` both tiers, professor's key).
> Battery: grading 11/11, directives 9/9, probe router 17/17, briefing,
> large-syllabus 4/4, sim clean (0 hard truncations, both students to quiz).
> Rollback: `gcloud run services update-traffic studyassist-iitl-backend
> --region us-central1 --to-revisions studyassist-iitl-backend-00068-jz7=100`
> (the Groq revision + key stay in place until decommissioned).
> Incidents during Phase 5, all resolved: stored key had a trailing newline
> (keys now .trim()ed at client construction); an interim diagnostic logged
> the Authorization header once — logger now redacts to error codes, the key
> was rotated, the old key deleted and the tainted secret version destroyed.
>
> **STATUS 2026-10-07 (pre-cutover):** Phases 0–2 COMPLETE. The study's data collection is
> finished, so the stimulus-change constraints below (cutover between
> participants, study-log entry) no longer apply — the bar is product
> regression only.
>
> **Phase-0 results (live key, measured):** gemini-2.5 family is RETIRED for
> new API users; use **`gemini-3.8-flash`** (both tiers). Thinking-token trap
> confirmed on 3.8: at max_tokens 20, default thinking / 'low' /
> thinking_budget:0 all returned EMPTY content; `reasoning_effort:'none'`
> answers in 1 token, and unconstrained thinking truncated a 400-token
> json_object reply — so the adapter defaults gemini calls to **'none'**
> (all existing budgets stay valid; explicit callers keep their value).
> Verified working: json_object, the exact runAgentWithTools tool loop,
> multiple system messages natively (no merge shim), streaming (coarse
> chunks), zero 429s on a 10-call burst; latency ~1.3 s tiny / ~4.7 s for a
> 361-token teaching turn. Key = Cloud API key "API key 1", retargeted from
> aiplatform to generativelanguage (fixed via gcloud; no AI Studio needed).
>
> **Phase 1–2 shipped** (3 commits + review pass): provider factory +
> `wrapForGemini` ('none' default), neutral LLM_MODEL* env with Groq
> fallback, 18-site hardcoded-fallback sweep through modelRouter, 44 new
> tests — suite 821 passed / 6 skipped. **Deploy trap found and closed:** the
> live service carried stale `LLM_MODEL=llama3.1` from legacy deploy configs,
> which would outrank GROQ_MODEL under the new precedence; removed from the
> live service (revision 00068) and from the three legacy configs.
> Remaining: Phase 3 (anything live harnesses surface), Phase 4 (tagged
> no-traffic revision: set LLM_PROVIDER=gemini + LLM_MODEL* + GEMINI_API_KEY
> secret — GROQ_MODEL* on the service would otherwise win), Phase 5
> (battery vs tagged URL), Phase 6 (traffic flip; no timing constraint).

**Phase 0 — feasibility probe (BLOCKED ON: professor's API key).** Fable runs
a scratchpad probe script against the prof key: model availability, RPM/TPM
ceiling (429 behavior — the two-student sim is call-heavy), thinking-token
overhead per budget class, json_object + tools + streaming smoke, latency per
call class. Output: measured numbers pasted into this doc; go/no-go on
model choice and rate limits. *(Free-tier AI Studio limits are far too low
for the simulation path; this probe confirms what the budget actually buys.)*

**Phase 1 — adapter (Opus agent A).** `llmClient.js` provider factory +
translation wrapper; `modelRouter` neutral env with Groq fallback; `openai`
dependency; `baseAgent` untouched except passing `reasoningEffort` through
the wrapper. Constraint: `LLM_PROVIDER=groq` (or unset) must be bit-for-bit
current behavior; all exported names (`getGroqClient`, `setGroqClient`,
`resetGroqClient`, `wrapWithReasoningDefaults`) keep working.

**Phase 2 — tests (Opus agent B).** Suite currently mocks `groq-sdk` in ~10
files; add equivalent `openai`-package mock coverage for the gemini path +
adapter unit tests (provider selection, param translation, system-message
merge, reasoning mapping). Baseline: 780+ passed / 6 skipped, serial only.

**Phase 3 — compat fixes (Opus agent C, after Phase 0+1 findings).** Whatever
the probe and harnesses surface: budgets, timeout scaling, stream shape,
YES/NO parse tolerance for the probe classifier, code_check reasoning level.

**Phase 4 — staged deploy (Fable).** Build from this branch and deploy as a
**tagged, no-traffic revision** on the same Cloud Run service
(`--tag gemini --no-traffic`), with per-revision env `LLM_PROVIDER=gemini`,
`LLM_MODEL*`, and the `GEMINI_API_KEY` secret. The tag gets its own URL
(`https://gemini---studyassist-….run.app`); 100% study traffic stays on the
Groq revision. STUDY_PROBE env rides along unchanged.

**Phase 5 — full battery against the tagged URL (Fable).** All harnesses take
a base URL: backend suite, verifyComposer (27), verifyGrading (11),
verifyProbeRouter (17), verifySimTruncation (5), verifyDirectives (9),
verifyLargeSyllabus (4), briefing smoke, and `prep-session <spare clone>
--service-url <tagged URL>`. Same pass bars as the gpt-oss migration.

**Phase 6 — cutover + study log (Fable + researcher).**
`gcloud run services update-traffic --to-tags gemini=100`, never mid-session,
re-run prep-session for any pending participant. Rollback = flip traffic
back (Groq revision + key stay intact until the study closes).
**This is the third mid-study stimulus change** (llama → gpt-oss → gemini).
Unaffected by design: canned Probe-2 reply, pinned "What stands out" facts,
briefing 45% sentence, lecture-cover gate, Maya/all seeded data. Shifts:
tutor prose/structure-directive following, grading judgment, probe-intent
classifier, insight-card *wording* (facts pinned). Needs a study-log entry
naming which participants saw which provider.

## 3. Open decisions (researcher)

1. **Prof's quota**: which tier/budget is the AI Studio key on? (Drives
   Phase 0 go/no-go — sims need sustained RPM.)
2. **Models**: confirm `gemini-2.5-flash` both tiers, or flash + flash-lite.
3. **Cutover timing**: which participants remain, and does the migration wait
   for them (clean "provider cohorts") or cut between sessions?
4. Staging via tagged no-traffic revision on the live service — OK, or prefer
   a fully separate Cloud Run service?

## 4. Branch discipline

- All migration work on `gemini-migration`; `pilot-prep`/`main` keep serving
  the live study (any study hotfix lands on `pilot-prep` first and is merged
  into this branch, never the reverse until cutover).
- No deploy from this branch except the tagged no-traffic revision.

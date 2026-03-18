# PR: Multi-Agent Architecture

## Create PR

**Link:** https://github.com/DunniAdenuga/learning-w-LLMs/compare/release/first-study...feature/multi-agent-architecture?expand=1

Click "Create pull request" and use the body below.

---

## PR Title

Multi-Agent Architecture (behind USE_MULTI_AGENT flag)

## PR Body

```markdown
## Summary
Adds multi-agent architecture for Study Assist, gated behind `USE_MULTI_AGENT` env var. When off (default), behavior is unchanged. When on, specialized agents handle intent, plan generation/modification, and quiz generation with validation and bounded retries; any failure falls back to legacy.

## Changes
- **Framework**: baseAgent, validator, modelRouter, contextBuilder, featureFlag
- **Agents**: Intent, Plan, PlanModify, ConversationManager, Assessment, Teaching, Quiz, Feedback
- **Validators**: Intent, Plan, Assessment, Teaching, Quiz
- **Route integration**: chatRoutes (pre-phase intent), assessmentRoutes (plan + modify), quizRoutes (quiz start)
- **Docs**: backend/docs/AGENT_FRAMEWORK.md
- **Tests**: tests/agents/ for featureFlag, modelRouter, validators

## Safety
- Flag defaults to `false`; no user impact by default
- All agent paths have try/catch with legacy fallback
- Session/message schemas unchanged; API contract unchanged

## Test Plan (completed)
- [x] Agent framework unit tests: 17/17 pass (featureFlag, modelRouter, validators)
- [x] ProgressService tests: pass
- [ ] Manual: Run with USE_MULTI_AGENT=false → verify no regression
- [ ] Manual: Run with USE_MULTI_AGENT=true → verify pre-phase intent, assessment plan, quiz generation
```

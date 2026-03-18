# Study Assist: Agent Framework

## Overview

The multi-agent architecture sits behind the `USE_MULTI_AGENT` environment variable. When the flag is `false` (default), all routes use the original legacy handlers. When `true`, specialized agents handle each task with validation and bounded retries, falling back to legacy on any failure.

## Directory Structure

```
backend/agents/
├── framework/
│   ├── featureFlag.js      – USE_MULTI_AGENT check
│   ├── baseAgent.js        – runAgent(): LLM call abstraction
│   ├── validator.js         – runWithValidation(): bounded retry loop
│   ├── modelRouter.js       – cheap (8b) vs expensive (70b) model selection
│   ├── contextBuilder.js    – LLM context trimming with summary support
│   └── state.js             – TypeDef reference for AgentInput/Output
├── intentAgent.js           – Classifies user intent in pre-phase
├── planAgent.js             – Generates learning plans (2-8 modules)
├── planModifyAgent.js       – Modifies existing plans per user request
├── conversationManagerAgent.js – Routes learning-phase actions
├── assessmentAgent.js       – Evaluates student answers
├── teachingAgent.js         – Generates milestone-focused teaching content
├── quizAgent.js             – Generates 5-question MCQ quizzes
├── feedbackAgent.js         – Post-quiz feedback and next-action decisions
└── validators/
    ├── intentValidator.js
    ├── planValidator.js
    ├── assessmentValidator.js
    ├── teachingValidator.js
    └── quizValidator.js
```

## Agent Contract

Every agent follows a standard contract:

**Input:** `{ session, userMessage, [profile], [plan], [milestone], [module], [metadata] }`

**Output:** `{ type, payload, [uiMessage], [valid], [errors], [debug] }`

## Validator Contract

Every validator is a pure function: `(output) => { valid: boolean, errors: string[] }`

The `runWithValidation` helper runs the generator up to `maxRetries + 1` times, passing previous errors to subsequent attempts. On total failure, the caller falls back to legacy.

## Model Routing

| Task | Model | Rationale |
|------|-------|-----------|
| Intent, Conversation Manager, Plan Modify, Feedback | llama-3.1-8b-instant | Simple classification/JSON |
| Plan, Assessment, Teaching, Quiz | llama-3.3-70b-versatile | Complex reasoning |

Controlled via `GROQ_MODEL` and `GROQ_MODEL_CHEAP` environment variables.

## Route Integration

Each route file (chatRoutes, assessmentRoutes, quizRoutes) checks `useMultiAgent()` at the start of the relevant handler. If `true`, it runs the agent path. On success, it returns the response. On any failure (agent error, validation failure), it falls through to the existing legacy handler.

## Context Summarization

`contextBuilder.js` provides `buildContextForLLM(session, maxTokens)` which:
1. Estimates total token count from `session.messages`
2. If within budget, returns full history
3. If over budget and `session.meta.contextSummary` exists, returns summary + last N turns
4. Never mutates `session.messages`

## Adding a New Agent

1. Create `backend/agents/myNewAgent.js` using `runAgent()` from `baseAgent.js`
2. Create `backend/agents/validators/myNewValidator.js` with a pure validation function
3. Wrap with `runWithValidation()` for bounded retries
4. Add the task name to `modelRouter.js` TASK_MODEL_MAP
5. Integrate in the relevant route file behind `useMultiAgent()`
6. Always include a legacy fallback path

## Deferred Features

The following features are intentionally deferred until the core agent path is proven stable:

- **Streaming** (`POST /v1/chat/stream` with SSE) – requires frontend `chatApi.sendMessageStream()` and `sessionStore.appendToLastMessage()`
- **Interactive teaching** (Mermaid diagrams, clickable MCQ/T-F, external links) – requires `MessageContent` component updates and mermaid package
- **LangGraph orchestration** – agent contracts should stabilize before adding graph-based orchestration complexity

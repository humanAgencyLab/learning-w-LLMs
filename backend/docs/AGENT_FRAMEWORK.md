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
├── graph/
│   ├── studyGraph.js        – LangGraph StateGraph definition with all nodes and edges
│   └── runGraph.js          – Graph runner utility with error handling
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

## LangGraph Orchestration

All agent orchestration is handled by a single `StateGraph` defined in `backend/agents/graph/studyGraph.js`. The graph uses `@langchain/langgraph` for state-machine based routing — LangGraph manages the *flow* between agents, but LLM calls remain in each agent via the Groq SDK (no LangChain LLM wrappers).

### Graph Architecture

```
Request → Router → (conditional dispatch)
                    ├── phase=pre       → Intent → END
                    ├── phase=assessing → Plan → END
                    ├── phase=planning  → PlanModify → END
                    ├── phase=learning  → ConvManager → (conditional)
                    │                       ├── action=assess → Assessment → Teaching → END
                    │                       ├── action=teach  → Teaching → END
                    │                       └── other → END
                    ├── quiz_start      → Quiz → END
                    └── quiz_submit     → Feedback → END
```

### State Schema

The `AgentState` (defined via `Annotation.Root`) carries:

| Field | Purpose |
|-------|---------|
| `session` | Mongoose session object |
| `userMessage` | Current user input |
| `phase` | Session phase (pre, assessing, planning, learning, quizzing) |
| `requestType` | Route context (chat, assess, modify, quiz_start, quiz_submit) |
| `intentResult` | Output from Intent Agent |
| `planResult` | Output from Plan or PlanModify Agent |
| `convManagerResult` | Output from Conversation Manager Agent |
| `assessmentResult` | Output from Assessment Agent |
| `teachingResult` | Output from Teaching Agent |
| `quizResult` | Output from Quiz Agent |
| `feedbackResult` | Output from Feedback Agent |
| `streamCallback` | Optional streaming callback |
| `error` | Error state |

### Runner

`runStudyGraph({ session, userMessage, requestType, streamCallback })` in `runGraph.js` compiles the graph (cached singleton), invokes it, and returns `{ success, state, error, elapsedMs }`.

## Route Integration

Each route file (chatRoutes, assessmentRoutes, quizRoutes) checks `useMultiAgent()` at the start of the relevant handler. If `true`, it invokes `runStudyGraph()` which routes through the LangGraph state machine. On success, the route processes the graph's output state and returns the response. On any failure (graph error, agent validation failure), it falls through to the existing legacy handler.

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

## Streaming

Chat supports streaming for learning-phase teaching responses. Send `stream: true` in the request body to `POST /v1/chat`. The server returns `text/event-stream` with SSE events: `{ chunk }` for each token, then `{ done: true, message, phase, plan, ... }` when complete. Frontend uses `chatApi.sendMessageStream()` with `sessionStore.appendToLastMessage()` for progressive display.

## Interactive Teaching

The frontend `MessageContent` component supports rich teaching content:

- **Mermaid diagrams**: LLM can include ` ```mermaid ` code blocks; rendered as interactive SVG via the `MermaidDiagram` component (lazy-loaded). Falls back to raw text if invalid.
- **Clickable MCQ**: Multiple-choice options (A/B/C/D format) render as clickable buttons. Clicking an option sends the answer automatically.
- **Clickable True/False**: True/False questions render as two clickable buttons.
- **External links**: Both `[label](url)` markdown links and bare URLs are rendered as clickable links opening in new tabs.
- **Code blocks**: Syntax-highlighted with copy button via `CodeBlock` component.

The teacher prompt includes optional guidance for rich content — diagrams for processes/flows, links for documentation, MCQ/T-F for clear-choice questions.

## Adding a New Graph Node

1. Create the agent as described in "Adding a New Agent" above
2. Add a node wrapper function in `studyGraph.js` that calls the agent and returns its result field
3. Add the node to the `StateGraph` via `.addNode()`
4. Wire edges — either a static `.addEdge()` or `.addConditionalEdges()` with a routing function
5. Update tests in `studyGraph.test.js`

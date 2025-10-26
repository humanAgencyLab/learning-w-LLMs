# Session Store Documentation

This document describes the comprehensive session store implementation that wires the frontend to the new backend flows with a single source of truth in Zustand.

## Overview

The session store manages the complete learning flow: `pre` → `assessing` → `learning` → `quizzing` → `feedback` → `completed` with dynamic modules and proper state management.

## Store Shape

```typescript
interface SessionState {
  // Core session fields
  sessionId: string | null;
  phase: 'pre' | 'assessing' | 'learning' | 'quizzing' | 'feedback' | 'completed';
  mode: 'studying' | 'revision';
  topic: string;
  chatTitle: string;
  plan: Array<{
    moduleId: string;
    title: string;
    points: number;
    status: 'locked' | 'in_progress' | 'passed';
    difficulty?: string;
  }>;
  activeModuleId: string | null;
  points: number;            // 0..100
  gems: number;              // floor(points/20)
  progressPct: number;       // mirror points
  isViewOnly: boolean;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    ts: string;
    tokens?: number;
  }>;
  profile: {
    source: 'dummy' | 'user';
    name: string;
    background: string;
    goals: string[];
    strengths: string[];
    gaps: string[];
    timePerDayMins: number;
    preferredStyle: 'examples-first' | 'theory-first' | 'mixed';
    lastUpdated: string;
  };
  model: string;
  meta?: {
    countSinceLastCheck?: number;
    outstandingCheck?: string | null;
  };
  
  // UI state
  loading: boolean;
  error: string | null;
  quizDraft: any[] | null;
}
```

## Actions

### Pure Reducers

#### `applyAssessment({ topic, chatTitle, plan })`
Sets topic, chatTitle, plan (dynamic length), activeModuleId="1", phase="learning", resets progress.

#### `appendMessage({ role, content, ts, tokens })`
Adds a message to the messages array.

#### `setPhase(phase)`
Enforces legal phase transitions:
- `pre` → `assessing` → `learning` → `quizzing` → `feedback` → `completed`
- Also allows `feedback` → `learning` when continuing

#### `startQuiz(moduleId?: string)`
Sets phase="quizzing" and activeModuleId if provided.

#### `finishQuiz({ passed, pointsEarned, nextModuleId })`
Sets phase="feedback", updates plan status optimistically.

#### `awardPoints(points, gems)`
Sets points, gems, and progressPct=points.

#### `lockViewOnly()`
Sets isViewOnly=true, phase="completed", clears quiz draft.

#### `resumeSession(payloadFromServer)`
Hydrates all fields from `/v1/sessions/:id/resume`.

### API Actions (Thunks)

#### `createSession(profile?)`
Creates a new session via `/v1/sessions`.

#### `startAssessment(userMessage, mode)`
Calls `/v1/assessment` with sessionId, userMessage, mode, profile.
- If `{ clarify: true, questions[] }` → appends assistant message, stays in assessing
- If plan returned → calls `applyAssessment(...)`

#### `sendChatMessage(userMessage)`
Calls `/v1/chat`, appends both messages, stays in learning.
- If response includes `{ nextAction: "START_QUIZ", moduleId }` → calls quiz start

#### `startQuizFromChat(moduleId?)`
Calls `/v1/quiz/start`, stores questions in quizDraft, sets phase="quizzing".

#### `submitQuiz(answers)`
Calls `/v1/quiz/submit`, updates points/progress, calls `finishQuiz()`.
- If completed → calls `lockViewOnly()`

#### `resumeSessionFromServer(sessionId)`
Calls `/v1/sessions/:id/resume` and hydrates state.

## Usage Examples

### Basic Usage

```jsx
import { useSession } from '../hooks/useSession';

function MyComponent() {
  const {
    sessionId,
    phase,
    topic,
    plan,
    points,
    gems,
    loading,
    error,
    startAssessment,
    sendMessage,
    startQuiz,
    submitQuiz
  } = useSession();

  // Use the state and methods
}
```

### Assessment Flow

```jsx
const handleAssessment = async (message) => {
  await startAssessment(message, 'studying');
  // Store will handle clarify vs plan response
};
```

### Chat Flow

```jsx
const handleChat = async (message) => {
  await sendMessage(message);
  // Store will handle quiz intent detection
};
```

### Quiz Flow

```jsx
const handleQuizStart = async () => {
  await startQuiz(activeModuleId);
  // Store will set phase to 'quizzing' and store questions
};

const handleQuizSubmit = async (answers) => {
  await submitQuiz(answers);
  // Store will handle scoring, progress update, and phase transition
};
```

## Computed Values

The store provides several computed values for easy UI integration:

- `currentModule`: The currently active module
- `nextModule`: The next module in the plan
- `completedModules`: All passed modules
- `progressPercentage`: Calculated progress percentage
- `canChat`: Whether user can send messages
- `canStartQuiz`: Whether quiz can be started
- `isCompleted`: Whether session is completed
- `showProgress`: Whether to show progress UI
- `showPlan`: Whether to show plan UI
- `showQuiz`: Whether to show quiz UI
- `showFeedback`: Whether to show feedback UI
- `showCompletion`: Whether to show completion UI

## Error Handling

The store includes comprehensive error handling:

- API errors are caught and stored in `error` state
- Loading states are managed automatically
- Phase transitions are validated
- Network errors are handled gracefully

## Persistence

The store uses Zustand's persist middleware to save key state to localStorage:

- `sessionId`, `phase`, `mode`, `topic`, `chatTitle`
- `plan`, `activeModuleId`, `points`, `gems`, `progressPct`
- `isViewOnly`, `profile`, `model`

Messages and transient state (like `quizDraft`) are not persisted.

## Testing

The store includes comprehensive tests covering:

- Pure reducers (all state mutations)
- API actions (with mocked endpoints)
- Error handling
- Edge cases
- Integration scenarios

Run tests with:
```bash
npm test -- sessionStore.test.js
```

## Integration with Existing Components

To integrate with existing components without redesign:

1. Import the `useSession` hook
2. Replace local state with store state
3. Replace local actions with store actions
4. Use computed values for UI logic
5. Handle loading and error states

Example:
```jsx
// Before
const [phase, setPhase] = useState('pre');
const [points, setPoints] = useState(0);

// After
const { phase, points, setPhase, awardPoints } = useSession();
```

## Backend Integration

The store is designed to work with the new backend API endpoints:

- `POST /v1/sessions` - Create session
- `GET /v1/sessions/:id` - Get session
- `POST /v1/sessions/:id/resume` - Resume session
- `POST /v1/assessment` - Start assessment
- `POST /v1/chat` - Send chat message
- `POST /v1/quiz/start` - Start quiz
- `POST /v1/quiz/submit` - Submit quiz

All API calls include proper error handling and loading states.


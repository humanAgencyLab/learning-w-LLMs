# Teaching System - Quick Reference Guide

## Core Principle

**All milestones follow the SAME uniform structure:**
- **Teaching Content**: 150-200 words (MANDATORY - same for all)
- **Assessment Question**: EXACTLY ONE question (ending with ?)
- **Only Difference**: First milestone uses "Introduction", others use "Acknowledgment + Completion + Transition"

## Response Structure Template

```
1. Introduction/Acknowledgment (1-3 sentences)
   - First milestone: "On Module X (Title), we will cover [summary]. Let's start with [milestone]."
   - Other milestones: "That's correct! You've completed: [milestone]. Now let's move on to: [next milestone]."

2. Teaching Content (150-200 words)
   - Explanations, examples, code snippets, key concepts
   - Same depth and detail for all milestones
   - Must teach the topic completely - cannot skip or announce without teaching

3. Assessment Question (EXACTLY ONE, ending with ?)
   - About the milestone topic just taught
   - Can be any format (free-text, multiple-choice concept, etc.)
   - DO NOT ask multiple questions or follow-up questions
```

## Assessment Scenarios

### Scenario A: Correct + Milestone Achieved
```
User answers correctly → Milestone complete
Response:
1. Acknowledgment (1-2 sentences)
2. Milestone completion (1 sentence)
3. Transition to next milestone (1 sentence)
4. Teaching content for NEW milestone (150-200 words)
5. Assessment question about NEW milestone (EXACTLY ONE)
```

### Scenario B: Correct + Needs Clarification
```
User answers correctly → Needs deeper understanding
Response:
1. Acknowledgment (1-2 sentences)
2. Additional teaching content (150-200 words)
3. Assessment question (EXACTLY ONE)
```

### Scenario C: Incorrect - First Attempt
```
User answers incorrectly or says "i don't know"
Response:
1. Say what's right (2-3 sentences)
2. Re-explain topic (150-200 words)
3. Assessment question (EXACTLY ONE)
```

### Scenario D: Incorrect - Second Attempt
```
User answers incorrectly again after retry
Response:
1. Brief explanation (2-3 sentences)
2. Transition to next milestone (1 sentence)
3. Teaching content for NEW milestone (150-200 words)
4. Assessment question about NEW milestone (EXACTLY ONE)
```

## Critical Rules

### ✅ DO
- Ask EXACTLY ONE assessment question per response
- Use 150-200 words for teaching content (same for all milestones)
- Teach the milestone topic completely before asking questions
- Progress milestones sequentially (0 → 1 → 2 → ...)
- Recalculate progress after each milestone completion
- Use LLM-based natural language understanding (no keywords)
- Clear outstanding question when milestone completes

### ❌ DON'T
- Ask multiple questions or follow-up questions
- Ask "Also, what are..." or "Please answer these questions"
- Skip milestones or jump ahead
- Teach multiple topics in one response
- Ask questions before teaching the topic
- Use keyword-based detection
- Use variable word counts (must be 150-200 words)
- Ask redundant questions

## Key Files

| File | Purpose |
|------|---------|
| `backend/routes/chatRoutes.js` | Main chat logic, milestone progression, progress calculation |
| `backend/prompts/teacher_prompt.js` | Generates teaching content and assessment questions |
| `backend/prompts/conversation_manager.js` | LLM-based conversation flow decisions |
| `backend/prompts/assessment_analyzer.js` | Analyzes student answers |
| `backend/utils/responseValidator.js` | Validates response structure |
| `backend/utils/apiRetry.js` | API retry logic with exponential backoff |
| `backend/services/progressService.js` | Progress calculation service |

## Key Variables

| Variable | Type | Purpose |
|---------|------|---------|
| `session.meta.currentMilestoneIndex` | Number | Current milestone index (0-based) |
| `session.meta.milestoneBeingTaught` | Boolean | Whether milestone is being taught |
| `session.meta.outstandingCheck` | String | Previous assessment question |
| `session.activeModuleId` | String | Current active module ID |
| `session.progressPct` | Number | Overall progress percentage |
| `session.points` | Number | Total points earned |
| `session.gems` | Number | Gems earned (points / 20) |

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Multiple questions | Explicitly prohibit in all scenarios, use "EXACTLY ONE" |
| Skipping milestones | Code validation enforces sequential progression |
| Missing teaching content | Explicit requirement: "MUST provide actual teaching content (150-200 words)" |
| Inconsistent word count | Uniform 150-200 words requirement in all scenarios |
| Redundant questions | Outstanding question management, clear when milestone completes |
| Progress not updating | `recalculateProgress()` called after milestone completion |
| Teaching multiple topics | Explicit prohibition: "ONLY teach [milestone topic]" |
| Poor "i don't know" handling | Assessment analyzer sets `understood: false`, provides complete explanation |

## Testing

```bash
cd backend
node test_assessment_fixes.js
```

## API Endpoints

### POST `/v1/chat`
Main chat endpoint for user messages.

**Request**:
```json
{
  "sessionId": "string",
  "message": "string"
}
```

**Response**:
```json
{
  "data": {
    "response": "string",
    "phase": "learning",
    "activeModuleId": "string",
    "progressPct": 25,
    "points": 13,
    "plan": [...]
  }
}
```

### POST `/v1/assessment/approve`
Approve learning plan and start teaching.

**Response**:
```json
{
  "data": {
    "message": "Combined approval + first milestone teaching",
    "phase": "learning",
    "activeModuleId": "string",
    "plan": [...]
  }
}
```

## Decision Flow

```
User sends message
    ↓
Is it a follow-up to assessment question?
    ├─ Yes → Analyze answer
    │   ├─ Correct? → Move to next milestone (Scenario A)
    │   ├─ Correct but needs clarification? → Clarify (Scenario B)
    │   ├─ Incorrect (first time)? → Re-explain (Scenario C)
    │   └─ Incorrect (second time)? → Move forward (Scenario D)
    │
    └─ No → Is it first teaching?
        ├─ Yes → First milestone structure
        └─ No → Regular teaching
```

## Token Optimization

- **Context Summarization**: Replaces full chat history with structured summary (50-70% reduction)
- **Max Tokens**: 1500 tokens for teacher API (prevents truncation)
- **Retry Logic**: Exponential backoff for rate limits, server errors, network errors

## Validation Checklist

Before sending response, verify:
- ✓ Teaching content is 150-200 words
- ✓ EXACTLY ONE assessment question (ending with ?)
- ✓ Question is about the milestone topic just taught
- ✓ No multiple questions or follow-up questions
- ✓ Milestone progression is sequential
- ✓ Progress is recalculated
- ✓ Outstanding question is cleared when milestone completes

---

**Quick Start**: Read `TEACHING_SYSTEM_DOCUMENTATION.md` for detailed information.




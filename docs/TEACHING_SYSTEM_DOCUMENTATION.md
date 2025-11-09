# Teaching System Documentation

## Overview

The teaching system is a milestone-based learning platform that uses LLMs (Groq API) to provide structured, adaptive teaching content. The system follows a uniform structure across all milestones, ensuring consistency in teaching depth, assessment format, and progression logic.

## Architecture

### Core Components

1. **Chat Routes** (`backend/routes/chatRoutes.js`)
   - Handles user messages and orchestrates the teaching flow
   - Manages milestone progression, progress calculation, and session state
   - Integrates with conversation manager and teacher prompts

2. **Conversation Manager** (`backend/prompts/conversation_manager.js`)
   - LLM-based decision-making for conversation flow
   - Determines user intent, phase transitions, and milestone progression
   - No hardcoded keyword detection - uses natural language understanding

3. **Teacher Prompt** (`backend/prompts/teacher_prompt.js`)
   - Generates teaching content and assessment questions
   - Enforces uniform structure across all milestones
   - Handles 4 assessment scenarios (correct, needs clarification, incorrect-1st, incorrect-2nd)

4. **Assessment Analyzer** (`backend/prompts/assessment_analyzer.js`)
   - Analyzes student answers to assessment questions
   - Determines understanding level and provides recommendations
   - Uses LLM-based natural language understanding (no keyword matching)

## Uniform Structure

### Core Principle

**All milestones follow the SAME structure with only ONE difference:**
- **First milestone**: Uses "Introduction" in step 1
- **Other milestones**: Use "Acknowledgment + Completion + Transition" in step 1
- **Teaching content**: 150-200 words (SAME for ALL milestones)
- **Assessment question**: Same format for ALL milestones

### Mandatory Response Structure

#### Step 1: Introduction/Acknowledgment
- **First milestone**: 
  - Format: `"On Module X (Title), we will cover [summary]. Let's start with [milestone topic]."`
  - 1-2 sentences
- **Other milestones**:
  - Acknowledgment: "That's correct!" / "Excellent!" / "Great job!"
  - Completion: "You've completed: [milestone name]"
  - Transition: "Now let's move on to: [next milestone]"
  - 2-3 sentences total

#### Step 2: Teaching Content
- **Word count**: 150-200 words (MANDATORY - same for all milestones)
- **Content**: 
  - Explanations, examples, code snippets, key concepts
  - Same depth and detail for all milestones
  - Must teach the milestone topic completely
  - Cannot skip or announce without teaching

#### Step 3: Assessment Question
- **Format**: EXACTLY ONE question (ending with ?)
- **Scope**: About the milestone topic just taught
- **Type**: Can be any format (free-text, multiple-choice concept, etc.)
- **Prohibition**: 
  - ❌ DO NOT ask multiple questions
  - ❌ DO NOT ask follow-up questions ("Also, what are...")
  - ❌ DO NOT ask "Please answer these questions"

## Assessment Scenarios

### Scenario A: Correct Answer + Milestone Achieved
**Trigger**: Student answers correctly, LLM determines milestone is complete

**Response Structure**:
1. Acknowledgment (1-2 sentences)
2. Milestone completion (1 sentence)
3. Transition to next milestone (1 sentence)
4. Teaching content for NEW milestone (150-200 words)
5. Assessment question about NEW milestone (EXACTLY ONE)

**Critical Rules**:
- Must teach the new milestone IMMEDIATELY after transition
- Cannot just announce the topic - must provide actual teaching content
- Must ask ONLY ONE assessment question about the new milestone
- Cannot ask about previous milestones or future topics

### Scenario B: Correct but Needs More Clarification
**Trigger**: Student answers correctly but needs deeper understanding

**Response Structure**:
1. Acknowledgment (1-2 sentences)
2. Additional teaching content (150-200 words)
3. Assessment question (EXACTLY ONE)

**Critical Rules**:
- Stays on CURRENT milestone topic
- Provides deeper explanation
- Asks ONE question to verify deeper understanding

### Scenario C: Incorrect Answer - First Attempt
**Trigger**: Student answers incorrectly or says "i don't know"

**Response Structure**:
1. Say what's right (2-3 sentences)
   - If "i don't know": "I understand you'd like an explanation. Let me explain this clearly."
   - Otherwise: "Not quite." / "Not exactly." / "Let me help clarify."
   - State correct answer clearly
   - Transition: "Let me explain this concept again in a different way."
2. Re-explain topic (150-200 words)
   - Different examples or analogies
   - Address common misconceptions
   - If question asked about multiple elements, explain ALL of them
3. Assessment question (EXACTLY ONE)

**Critical Rules**:
- Must explain ALL aspects if question asked about multiple elements
- Cannot move to next milestone yet
- Must ask ONE question about the same topic

### Scenario D: Incorrect Answer - Second Attempt
**Trigger**: Student answers incorrectly again after retry

**Response Structure**:
1. Brief explanation (2-3 sentences)
   - State correct answer
   - Brief explanation why
   - Encouraging: "Don't worry, we'll continue practicing."
2. Transition to next milestone (1 sentence)
3. Teaching content for NEW milestone (150-200 words)
4. Assessment question about NEW milestone (EXACTLY ONE)

**Critical Rules**:
- Moves forward after explaining briefly
- Must teach the new milestone IMMEDIATELY
- Must ask ONLY ONE question about the new milestone

## Key Files and Functions

### `backend/routes/chatRoutes.js`

**Key Functions**:
- `POST /v1/chat`: Main endpoint for chat messages
- `callTeacherAPI()`: Calls Groq API with retry logic
- `recalculateProgress()`: Calculates overall progress based on completed milestones

**Key Logic**:
- Milestone progression enforcement (sequential, no skipping)
- Outstanding question management (prevents redundant questions)
- Progress calculation (overall progress, points, gems)
- Assessment analysis integration
- Response structure validation

**Critical Variables**:
- `session.meta.currentMilestoneIndex`: Current milestone (0-based)
- `session.meta.milestoneBeingTaught`: Whether milestone is being taught
- `session.meta.outstandingCheck`: Previous assessment question
- `session.activeModuleId`: Current active module
- `session.progressPct`: Overall progress percentage
- `session.points`: Total points earned
- `session.gems`: Gems earned (points / 20)

### `backend/prompts/teacher_prompt.js`

**Key Function**: `buildTeacherPrompt()`

**Parameters**:
- `session`: Session object with plan, metadata, messages
- `userMessage`: Current user message
- `topic`: Learning topic
- `profile`: Student profile data
- `assessmentResult`: Assessment analysis result (if follow-up)
- `milestoneInfo`: Milestone progression info

**Prompt Structure**:
1. **Tutor Role**: Dynamic based on topic (programming tutor, math tutor, etc.)
2. **Profile Context**: Student's learning style, skill level, preferences
3. **Module Context**: Current module, milestone, progress
4. **Teaching Instructions**: Scenario-specific instructions (A, B, C, D, or first teaching)

**Critical Sections**:
- `isFirstTeaching`: First time teaching a milestone
- `isFollowUp && outstandingCheck`: Follow-up to assessment question
- Assessment scenarios (A, B, C, D)
- Fallback for regular teaching

### `backend/prompts/conversation_manager.js`

**Key Function**: `buildConversationDecisionPrompt()`

**Purpose**: LLM-based decision-making for conversation flow

**Key Decisions**:
- User intent (learning, general, admin, greeting, unclear)
- Phase transitions (planning → learning → feedback → quiz)
- Milestone progression (move to next, stay, retry)
- Quiz initiation (when all milestones complete)
- Follow-up detection (is user responding to outstanding question?)

**Critical Rules**:
- No hardcoded keyword detection
- Uses natural language understanding
- Context-aware decision making
- Handles "i don't know" responses appropriately

### `backend/prompts/assessment_analyzer.js`

**Key Function**: Builds prompt for LLM to analyze student answers

**Purpose**: Determines if student understood the concept

**Output**:
- `understood`: Boolean (true/false)
- `recommendation`: "move_forward" / "clarify_again" / "retry"
- `confidence`: "high" / "medium" / "low"
- `reasoning`: Explanation of assessment

**Critical Rules**:
- No keyword matching
- Uses natural language understanding
- Handles "i don't know" as `understood: false`
- Provides complete assessment for complex answers

## Critical Rules and Requirements

### 1. Single Assessment Question
- **MANDATORY**: Ask EXACTLY ONE assessment question per response
- **PROHIBITED**: 
  - Multiple questions
  - Follow-up questions ("Also, what are...")
  - "Please answer these questions" phrases
- **Enforcement**: All scenarios explicitly prohibit multiple questions

### 2. Uniform Word Count
- **Teaching Content**: 150-200 words (same for ALL milestones)
- **Enforcement**: All scenarios use same word count
- **Validation**: Checked in prompts and examples

### 3. Sequential Milestone Progression
- **Rule**: Milestones must progress sequentially (0 → 1 → 2 → ...)
- **Enforcement**: Code validation prevents skipping
- **Validation**: `session.meta.currentMilestoneIndex` must be `previousIndex + 1`

### 4. Teach First, Then Assess
- **Rule**: Always teach the milestone topic completely before asking questions
- **Prohibition**: Cannot ask diagnostic questions before teaching
- **Exception**: None - teaching always comes first

### 5. No Hardcoded Detection
- **Rule**: All detection must be LLM-based (natural language understanding)
- **Prohibition**: No keyword matching, no phrase lists
- **Enforcement**: Removed all hardcoded detection logic

### 6. Outstanding Question Management
- **Rule**: Clear outstanding question when milestone completes
- **Rule**: Only set new question if different from previous
- **Rule**: Prevent redundant questions across milestones

### 7. Progress Calculation
- **Rule**: Recalculate progress after each milestone completion
- **Formula**: `(completedMilestones / totalMilestones) * 100`
- **Points**: Based on module progress and module points
- **Gems**: `points / 20` (floor)

## Common Issues and Solutions

### Issue 1: Multiple Questions
**Symptom**: AI asks multiple questions or follow-up questions

**Solution**: 
- Explicitly prohibit in all scenarios
- Use "EXACTLY ONE" instead of "ONE"
- Add wrong examples showing multiple questions
- Add to critical failure list

### Issue 2: Premature Milestone Progression
**Symptom**: AI skips milestones or jumps ahead

**Solution**:
- Code validation enforces sequential progression
- Prompt explicitly prohibits skipping
- Milestone number references in prompts

### Issue 3: Missing Teaching Content
**Symptom**: AI announces topic but doesn't teach it

**Solution**:
- Explicit requirement: "MUST provide actual teaching content (150-200 words)"
- Wrong examples showing announcement without teaching
- Critical failure if content missing

### Issue 4: Inconsistent Word Count
**Symptom**: Teaching content varies in length (100 words, 250 words, etc.)

**Solution**:
- Uniform 150-200 words requirement
- All scenarios use same word count
- Explicitly stated in all teaching instructions

### Issue 5: Redundant Questions
**Symptom**: Same question asked multiple times

**Solution**:
- Outstanding question management
- Clear previous question when milestone completes
- Only set new question if different from previous

### Issue 6: Progress Not Updating
**Symptom**: UI shows 0% progress despite completed milestones

**Solution**:
- `recalculateProgress()` function called after milestone completion
- Also called before sending response
- Calculates based on actual `completed` status

### Issue 7: Teaching Multiple Topics
**Symptom**: AI covers multiple milestones in one response

**Solution**:
- Explicit prohibition in all scenarios
- "ONLY teach [milestone topic]" in all prompts
- Critical failure if multiple topics taught

### Issue 8: Poor "I Don't Know" Handling
**Symptom**: AI asks for response again after "i don't know"

**Solution**:
- `assessment_analyzer.js` sets `understood: false` for "i don't know"
- `teacher_prompt.js` provides complete explanation
- Acknowledges "i don't know" appropriately

## Testing

### Test File: `backend/test_assessment_fixes.js`

**Test Cases**:
1. First milestone teaching structure
2. Correct answer → move to next milestone (Scenario A)
3. Incorrect answer → re-explain (Scenario C)
4. Progress calculation
5. Milestone progression

**Run Tests**:
```bash
cd backend
node test_assessment_fixes.js
```

## API Endpoints

### POST `/v1/chat`
**Purpose**: Main chat endpoint for user messages

**Request Body**:
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
**Purpose**: Approve learning plan and start teaching

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

## Token Optimization

### Context Summarization
- Replaces full chat history with structured summary
- Reduces token usage by 50-70%
- Updated after each interaction

### Max Tokens Settings
- `callTeacherAPI`: 1500 tokens (to prevent truncation)
- Validation ensures complete responses

### API Retry Logic
- `retryWithBackoff()`: Handles rate limits, server errors, network errors
- Exponential backoff with configurable retries
- Handles empty responses automatically

## Response Validation

### Validator: `backend/utils/responseValidator.js`

**Functions**:
- `validateScenarioA()`: Validates correct answer + move to next milestone
- `validateScenarioC()`: Validates incorrect answer + re-explain

**Checks**:
- Presence of acknowledgment
- Teaching content word count
- Assessment question presence
- Structure compliance

## Future Improvements

1. **Response Quality Metrics**: Track teaching quality, consistency
2. **Adaptive Word Count**: Adjust based on milestone complexity
3. **Multi-turn Teaching**: Allow multiple messages per milestone if needed
4. **Student Feedback Integration**: Use likes/dislikes to improve responses
5. **A/B Testing**: Test different prompt structures
6. **Performance Monitoring**: Track response times, token usage, errors

## Key Takeaways

1. **Uniform Structure**: All milestones follow same structure (150-200 words, one question)
2. **LLM-Based Detection**: No hardcoded keywords - all decisions via LLM
3. **Sequential Progression**: Milestones progress sequentially, no skipping
4. **Single Question Rule**: EXACTLY ONE assessment question per response
5. **Progress Accuracy**: Recalculate progress after each milestone completion
6. **Error Handling**: Robust retry logic, validation, and error recovery
7. **Token Efficiency**: Context summarization reduces token usage significantly

## File Checklist

When working on the teaching system, ensure these files are updated:

- [ ] `backend/routes/chatRoutes.js` - Main chat logic
- [ ] `backend/prompts/teacher_prompt.js` - Teaching content generation
- [ ] `backend/prompts/conversation_manager.js` - Conversation flow decisions
- [ ] `backend/prompts/assessment_analyzer.js` - Answer assessment
- [ ] `backend/utils/responseValidator.js` - Response validation
- [ ] `backend/utils/apiRetry.js` - API retry logic
- [ ] `backend/services/progressService.js` - Progress calculation

## Quick Reference

### Teaching Structure Template
```
1. Introduction/Acknowledgment (1-3 sentences)
2. Teaching Content (150-200 words)
3. Assessment Question (EXACTLY ONE, ending with ?)
```

### Assessment Scenario Decision Tree
```
Correct Answer?
├─ Yes → Milestone Complete?
│   ├─ Yes → Scenario A (Move to next)
│   └─ No → Scenario B (Needs clarification)
└─ No → Retry Count?
    ├─ 0 → Scenario C (First incorrect)
    └─ 1 → Scenario D (Second incorrect, move forward)
```

### Critical Prohibitions
- ❌ Multiple questions
- ❌ Skipping milestones
- ❌ Teaching multiple topics
- ❌ Asking before teaching
- ❌ Keyword-based detection
- ❌ Variable word counts
- ❌ Redundant questions

---

**Last Updated**: 2024
**Version**: 1.0
**Maintainer**: Teaching System Documentation




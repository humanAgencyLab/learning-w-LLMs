# Comprehensive Test Case Plan for Learning Flow

## Test Agent Instructions

You are a testing agent responsible for verifying the complete learning flow of the Study Assist application. Follow this test plan systematically, documenting results at each step.

---

## Test Environment Setup

**Prerequisites:**
- Backend running on `http://localhost:5001`
- Frontend running on `http://localhost:3000`
- MongoDB connected
- Valid Groq API key configured

**Test User Profile:**
- Name: Test Student
- Skill Level: Beginner
- Learning Type: Visual
- Major: Computer Science
- Goals: Learn practical programming skills
- Preferred Style: Examples-first

---

## Test Case 1: Happy Path - Complete Learning Flow

### Step 1: Session Creation
**Action:** Create a new session
**Expected:** Session created with `phase: 'pre'`
**Verify:** Session ID returned, phase is 'pre'

### Step 2: Initial Learning Request
**Action:** Send message: "I want to learn Python programming"
**Expected:** 
- System generates a learning plan immediately (no clarification questions)
- Phase changes to `'planning'`
- Plan contains 2-8 modules with 3-6 milestones each
- Points sum to exactly 100
- Milestone text is concise (8-15 words)
**Verify:**
- Plan displayed in UI
- All modules show "locked" status
- No clarification questions asked

### Step 3: Plan Review
**Action:** Review the generated plan
**Expected:**
- Plan is scrollable
- Module titles are specific and descriptive (not "Module 1", "Part 2")
- Milestones are meaningful and non-generic
- Points are distributed dynamically (not equal)
**Verify:** UI displays plan correctly, all elements visible

### Step 4: Plan Modification
**Action:** Request modification: "Make the plan more focused on data structures and algorithms"
**Expected:**
- New plan generated addressing the modification
- Phase remains `'planning'`
- Plan includes data structures and algorithms emphasis
- No errors during modification
**Verify:**
- New plan displayed
- Modification request visible in chat history
- Plan reflects requested changes

### Step 5: Plan Approval
**Action:** Click "Approve Plan" button
**Expected:**
- `session.planApproved = true`
- Phase changes to `'learning'`
- First module status becomes `'in_progress'`
- `activeModuleId` set to first module
- Initial teaching content generated automatically
- Teaching matches first milestone exactly
**Verify:**
- Approval message in chat
- Teaching content appears immediately
- Teaching topic matches first milestone text (not a subtopic)
- Assessment question at end of teaching

### Step 6: Answer Assessment Question (Positive)
**Action:** Answer the assessment question correctly/substantially
**Expected:**
- LLM evaluates answer as "understood: true"
- First milestone marked as `completed: true`
- `currentMilestoneIndex` increments to 1
- Next milestone teaching begins
- Teaching matches second milestone exactly
**Verify:**
- Milestone completion reflected in UI
- Progress updates
- Next teaching appears automatically
- Teaching topic matches second milestone

### Step 7: Answer Assessment Question (Negative - First Retry)
**Action:** Answer assessment question incorrectly/vaguely
**Expected:**
- LLM evaluates answer as "understood: false"
- `milestoneRetryCount` for current milestone = 1
- Same milestone re-taught with clarification
- Clarification focuses on the misunderstood parts
**Verify:**
- Error handling message appears
- Same milestone teaching repeats
- Retry count tracked

### Step 8: Answer Assessment Question (Negative - After Retry)
**Action:** After retry, answer incorrectly again
**Expected:**
- LLM evaluates answer as "understood: false"
- `milestoneRetryCount` >= 1
- Milestone marked complete anyway (to avoid infinite loop)
- System moves to next milestone
**Verify:**
- System moves forward despite negative assessment
- No infinite loop
- Next milestone teaching begins

### Step 9: Complete All Milestones in Module
**Action:** Answer all assessment questions for all milestones in Module 1
**Expected:**
- All milestones marked `completed: true`
- `moduleCompleted = true`
- Phase changes to `'quizzing'`
- Quiz generation triggered automatically
**Verify:**
- Quiz appears after last milestone
- Module status updates
- Phase changes to quizzing

### Step 10: Take Quiz (Pass - 70%+)
**Action:** Answer quiz questions, achieve 70% or higher
**Expected:**
- Quiz score >= 70%
- Module status set to `'passed'`
- Phase changes to `'feedback'` (brief feedback)
- Next module (if exists) unlocked and set to `'in_progress'`
- `activeModuleId` updated to next module
- `currentMilestoneIndex` reset to 0 for new module
- `milestoneRetryCount` cleared for new module
- Teaching begins for first milestone of next module
**Verify:**
- Quiz results displayed
- Feedback message appears
- Next module becomes active
- First milestone of next module teaching begins

### Step 11: Continue to Next Module
**Action:** Complete milestones in Module 2, take quiz, pass
**Expected:**
- Same flow as Module 1
- Progress updates correctly
- Points accumulate
**Verify:**
- Progress bar updates
- Points increase
- Modules unlock sequentially

---

## Test Case 2: Quiz Failure Flow

### Step 1: Take Quiz (Fail - <70%)
**Action:** Answer quiz questions, achieve <70%
**Expected:**
- Quiz score < 70%
- LLM analyzes quiz results to identify specific milestones needing review
- `milestonesToReview` array populated with specific milestone indices
- Only those specific milestones reset (not entire module)
- `currentMilestoneIndex` set to first milestone needing review
- Phase changes to `'learning'` (not feedback)
- `pointsEarned = 0`
- Remediation teaching begins for identified milestones
**Verify:**
- Quiz failure message shows which milestones need review
- Only specific milestones are reset
- Teaching begins for first milestone needing review
- Module status remains appropriate

### Step 2: Remediate Failed Milestones
**Action:** Complete teaching and assessment for reset milestones
**Expected:**
- Only reset milestones are re-taught
- Assessment questions for reset milestones
- Other milestones remain completed
**Verify:**
- Only identified milestones appear
- Progress reflects partial completion

### Step 3: Retake Quiz After Remediation
**Action:** Complete remediation, retake quiz
**Expected:**
- Quiz generated again
- If pass (>=70%), module marked passed
- If fail again, repeat remediation for still-failing milestones
**Verify:**
- Quiz can be retaken
- Remediation continues until pass

---

## Test Case 3: Plan Modification Edge Cases

### Case 3.1: Multiple Modifications
**Action:** Request modification, then request another modification before approval
**Expected:**
- Each modification generates new plan
- Previous plan replaced
- Chat history shows all modification requests
**Verify:**
- Plan updates correctly
- History preserved

### Case 3.2: Vague Modification Request
**Action:** Request modification: "make it better"
**Expected:**
- LLM generates improved plan based on context
- Plan still valid and complete
- No errors
**Verify:**
- Plan is better than before
- All constraints met (points sum to 100, etc.)

### Case 3.3: Modification Request After Approval
**Action:** Try to modify plan after approval
**Expected:**
- Modification rejected or ignored
- Error message if endpoint called
- System remains in learning phase
**Verify:**
- Modification button disabled or error shown
- Learning flow continues

---

## Test Case 4: Milestone Teaching Alignment

### Case 4.1: Milestone Text Matching
**Action:** Verify teaching content matches milestone text exactly
**Milestone Examples to Test:**
- "Learn basic data structure concepts in C" → Should teach basic concepts, not arrays specifically
- "Understand array and list implementations" → Should teach arrays and lists
- "Learn JavaScript syntax and basics" → Should teach syntax and basics, not specific functions
**Expected:**
- Teaching topic matches milestone exactly
- No subtopics taught that belong to later milestones
- Assessment question tests the exact milestone topic
**Verify:**
- Teaching content alignment
- Assessment question relevance

### Case 4.2: Teaching Progression
**Action:** Complete milestones sequentially
**Expected:**
- Each milestone teaching appears in order
- No skipping
- No repetition of completed milestones
**Verify:**
- Sequential progression
- No duplicate teaching

---

## Test Case 5: Intent Detection Edge Cases

### Case 5.1: Learning Intent Variations
**Actions to Test:**
- "help me with data structures"
- "I need to learn Python"
- "teach me JavaScript"
- "I want to understand algorithms"
**Expected:**
- All trigger assessment and plan generation
- No clarification questions
- Plan generated immediately
**Verify:**
- Intent detected correctly
- Plan generated for each

### Case 5.2: General Chat vs Learning
**Actions to Test:**
- "Hello" (greeting)
- "What is the weather?" (general)
- "How does this work?" (clarification)
**Expected:**
- Appropriate responses based on phase
- No plan generation for non-learning intents
**Verify:**
- Intent classification correct
- Appropriate responses

---

## Test Case 6: Error Handling

### Case 6.1: LLM API Failure During Plan Generation
**Action:** Simulate LLM failure (rate limit, timeout)
**Expected:**
- Default plan fallback used
- Error logged
- User sees plan (not error)
- Points sum to 100
**Verify:**
- System continues
- Fallback plan valid

### Case 6.2: LLM API Failure During Teaching
**Action:** Simulate LLM failure during teaching
**Expected:**
- Error logged
- User-friendly error message
- Session state preserved
**Verify:**
- Error handling graceful
- No data loss

### Case 6.3: Missing Session Data
**Action:** Access chat with invalid/missing session
**Expected:**
- Error message returned
- No crash
**Verify:**
- Error handling works
- No 500 errors

### Case 6.4: Invalid Phase Transitions
**Action:** Try to approve plan in wrong phase
**Expected:**
- Request rejected
- Error message
- Phase unchanged
**Verify:**
- Phase guards work
- Appropriate errors

---

## Test Case 7: UI/UX Edge Cases

### Case 7.1: Small Screen Responsiveness
**Action:** Test on small viewport (mobile size)
**Expected:**
- Plan review section scrollable
- All buttons visible
- Modification textarea accessible
- No content truncation
**Verify:**
- Responsive design works
- All features accessible

### Case 7.2: Rapid User Actions
**Action:** Click buttons rapidly, send messages quickly
**Expected:**
- No duplicate submissions
- Requests processed in order
- UI updates correctly
**Verify:**
- Race conditions handled
- State consistency

### Case 7.3: Long Plan Display
**Action:** Generate plan with 8 modules, 6 milestones each
**Expected:**
- Plan scrollable
- All modules visible
- Performance acceptable
**Verify:**
- Scroll works
- No performance issues

---

## Test Case 8: Data Consistency

### Case 8.1: Session State Persistence
**Action:** Complete milestones, refresh page, continue
**Expected:**
- Session state preserved
- Progress maintained
- Current milestone remembered
**Verify:**
- State persistence works
- No data loss

### Case 8.2: Concurrent Session Access
**Action:** Open same session in multiple tabs
**Expected:**
- Last write wins or proper locking
- No data corruption
- Consistent state
**Verify:**
- Concurrency handled
- Data integrity

---

## Test Case 9: Point Distribution Validation

### Case 9.1: Points Sum Check
**Action:** Generate plans for various topics
**Expected:**
- Points always sum to exactly 100
- No rounding errors
- Validation passes
**Verify:**
- Points sum = 100
- All plans valid

### Case 9.2: Dynamic Point Distribution
**Action:** Generate plans for simple vs complex topics
**Expected:**
- Simple topics: fewer modules, lower point intro modules
- Complex topics: more modules, varied point distribution
- No equal distribution (e.g., 33, 33, 34)
**Verify:**
- Points distributed based on complexity
- No fixed patterns

---

## Test Case 10: Assessment Evaluation

### Case 10.1: Positive Assessment Variations
**Actions to Test:**
- Detailed correct answer
- Partially correct answer
- "Yes, I understand" with context
**Expected:**
- LLM evaluates correctly
- Milestone marked complete
- Move to next milestone
**Verify:**
- Evaluation accurate
- Progression correct

### Case 10.2: Negative Assessment Variations
**Actions to Test:**
- "I don't know"
- Vague answer
- Incorrect answer
- Off-topic answer
**Expected:**
- LLM evaluates as negative
- Retry logic triggered
- Clarification provided
**Verify:**
- Evaluation accurate
- Retry works

### Case 10.3: Assessment After Retry
**Action:** Answer incorrectly twice
**Expected:**
- First retry: clarification
- Second negative: move forward anyway
- No infinite loop
**Verify:**
- Retry limit respected
- Progression continues

---

## Test Case 11: Quiz Generation and Validation

### Case 11.1: Quiz Question Count
**Action:** Generate quizzes for multiple modules
**Expected:**
- 5-10 questions per quiz (dynamic)
- Question count varies
**Verify:**
- Question count within range
- Dynamic generation works

### Case 11.2: Quiz Question Types
**Action:** Review quiz questions
**Expected:**
- Mix of MCQ, True/False, Short Answer
- All question types present
**Verify:**
- Question variety
- Types correct

### Case 11.3: Quiz Scoring
**Action:** Answer quiz, verify scoring
**Expected:**
- Score calculated correctly
- Pass/fail determined (70% threshold)
- Feedback accurate
**Verify:**
- Scoring correct
- Pass/fail logic works

---

## Test Case 12: Module Progression

### Case 12.1: Final Module Completion
**Action:** Complete last module, pass quiz
**Expected:**
- Module marked passed
- No next module available
- Phase changes appropriately
- Completion message shown
**Verify:**
- Final module handled
- Completion state correct

### Case 12.2: Module Skipping Prevention
**Action:** Try to access locked modules
**Expected:**
- Locked modules not accessible
- Must complete previous modules
- Status enforced
**Verify:**
- Module locking works
- Sequential progression enforced

---

## Test Case 13: Milestone Retry Tracking

### Case 13.1: Retry Count Per Milestone
**Action:** Fail assessment for milestone 0, then milestone 1
**Expected:**
- Retry count tracked per milestone independently
- `milestoneRetryCount[0] = 1`, `milestoneRetryCount[1] = 1`
**Verify:**
- Independent tracking
- Counts accurate

### Case 13.2: Retry Count Reset on Module Change
**Action:** Complete module, move to next module
**Expected:**
- Retry counts cleared for new module
- Fresh start for new module
**Verify:**
- Reset works
- New module starts clean

---

## Test Case 14: Quiz Failure Analysis

### Case 14.1: Specific Milestone Identification
**Action:** Fail quiz, verify LLM identifies specific milestones
**Expected:**
- `milestonesToReview` array contains specific indices
- Only those milestones reset
- Other milestones remain completed
**Verify:**
- Identification accurate
- Selective reset works

### Case 14.2: General Failure Analysis
**Action:** Fail quiz with questions covering multiple milestones
**Expected:**
- LLM identifies which milestones need review
- Remediation focused on identified milestones
**Verify:**
- Analysis accurate
- Remediation targeted

---

## Test Case 15: Complete Flow Validation

### Case 15.1: End-to-End Flow
**Action:** Complete full learning path from start to finish
**Steps:**
1. Create session
2. Request learning: "I want to learn React"
3. Review plan
4. Modify plan if needed
5. Approve plan
6. Complete all milestones in Module 1
7. Pass Module 1 quiz
8. Complete Module 2 milestones
9. Pass Module 2 quiz
10. Continue until all modules complete
**Expected:**
- All steps execute without errors
- State transitions correct
- Progress tracked accurately
- Points accumulate
- UI updates correctly
**Verify:**
- Complete flow works
- No breaks in flow
- All features functional

---

## Test Reporting Template

For each test case, document:

1. **Test Case ID:** (e.g., TC-1.1)
2. **Description:** Brief description
3. **Steps:** Actions taken
4. **Expected Result:** What should happen
5. **Actual Result:** What actually happened
6. **Status:** PASS / FAIL / BLOCKED
7. **Issues Found:** Any bugs or issues
8. **Screenshots/Logs:** Evidence of results

---

## Success Criteria

All test cases should pass with:
- ✅ No errors or crashes
- ✅ State transitions correct
- ✅ Data persistence works
- ✅ UI responsive and functional
- ✅ Teaching matches milestones exactly
- ✅ Assessment evaluation accurate
- ✅ Quiz generation and scoring correct
- ✅ Module progression works
- ✅ Error handling graceful
- ✅ Edge cases handled

---

## Notes for Test Agent

1. **Test systematically:** Follow test cases in order
2. **Document everything:** Record all results, even if passing
3. **Capture errors:** Screenshot/log all errors
4. **Verify assumptions:** Don't assume - verify each step
5. **Test edge cases:** Don't skip corner cases
6. **Check backend logs:** Review `/tmp/backend.log` for errors
7. **Verify database state:** Check MongoDB for session state
8. **Test multiple topics:** Use different learning topics
9. **Test different profiles:** Vary user profiles
10. **Report issues immediately:** Document bugs as found

---

## Quick Reference: Key Endpoints

- `POST /v1/sessions` - Create session
- `POST /v1/chat` - Send chat message
- `POST /v1/assessment` - Generate plan
- `POST /v1/assessment/approve` - Approve plan
- `POST /v1/assessment/modify` - Modify plan
- `POST /v1/quiz/start` - Start quiz
- `POST /v1/quiz/submit` - Submit quiz answers

---

## Test Environment Cleanup

After testing:
1. Clear test sessions from database (optional)
2. Review logs for errors
3. Document final test results
4. Report any issues found

---

**End of Test Plan**






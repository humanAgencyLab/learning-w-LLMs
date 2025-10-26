# Test Failure Analysis - SRL Assessment Router Implementation

## Summary
- **Total Tests:** 120
- **Passing:** 80
- **Failing:** 40
- **Test Suites:** 7 failed, 3 passed

---

## Bucket B1: Phase Guard Failures (Pre/Assessing Chat/Quiz Calls)

Tests failing due to stricter phase guards that now require plan existence and phase='learning' or 'feedback':

### chatRoutes.test.js
- ❌ **should return 409 for assessing phase**
  - Issue: Expected `code: 'ILLEGAL_PHASE'` but got `undefined`
  - Root cause: New guard returns "Session not ready for chat" with code "ILLEGAL_PHASE" but assertion needs update
  
- ❌ **should return 409 for view-only session**
  - Issue: Expected 409, got 200
  - Root cause: isViewOnly check happens AFTER phase guard; need to reorder checks

- ❌ **should return 409 for null activeModuleId**
  - Issue: Expected 409, got 200
  - Root cause: activeModuleId check also happens after phase guard; test needs session with plan + null activeModuleId

### quizRoutes.test.js
- ❌ **should return 409 for illegal phase**
  - Issue: Expected error message "Quiz not allowed in current phase", got "Session not ready for quiz"
  - Root cause: Error message changed; update test expectation

- ❌ **should handle reattempt without double-awarding points**
  - Issue: Expected 200, got 409
  - Root cause: Phase guard kicks in; session might be in wrong phase

### rateLimiting.test.js
- ❌ **should rate limit assessment requests**
  - Issue: Expected 429, got 409
  - Root cause: Assessment phase guard triggers before rate limiter

- ❌ **should rate limit quiz start requests**
  - Issue: Expected 429, got 502
  - Root cause: Phase guard + missing plan triggers before rate limiter

- ❌ **should rate limit quiz submit requests**
  - Issue: Expected 429, got 409
  - Root cause: Phase guard triggers before rate limiter

---

## Bucket B2: Teacher/Progress Mutation on General/Admin Chat

Tests failing because general/admin chat now doesn't mutate state:

### chatRoutes.test.js
- ❌ **should detect quiz intent and return START_QUIZ action**
  - Issue: nextAction is undefined
  - Root cause: Quiz intent detection might not work with new intent router; needs investigation

- ❌ **should handle HTML stripping in user message**
  - Issue: HTML not stripped from message
  - Root cause: HTML stripping happens in validation middleware but message is stored before that

---

## Bucket B3: Schema/Assertion Mismatches

### contextControl.test.js
- ❌ **should trigger summarization at 40+ turns**
  - Issue: Expected summarized flag, got undefined
  - Root cause: Summarization logic updated to filter learning messages; test needs update

- ❌ **should not summarize if outstandingCheck exists**
  - Issue: Message count expected 45, got 47
  - Root cause: General messages are now included but not summarized; count differs

- ❌ **should handle summarization failure gracefully**
  - Issue: Message count expected 45, got 47
  - Root cause: Same as above

- ❌ **should not create multiple summaries for same conversation**
  - Issue: Expected summarized flag, got undefined
  - Root cause: Summarization logic updated

- ❌ **should create proper summary format**
  - Issue: Expected summary message, got undefined
  - Root cause: Summarization format changed

### contextControl.unit.test.js
- ❌ **should trigger summarization at 40+ turns**
  - Issue: Expected messages.length < 45, got 45
  - Root cause: Summarization filtering learning messages only
  
- ❌ **should not summarize when outstandingCheck exists**
  - Issue: Expected summaryVersion to be undefined, got 0
  - Root cause: Default value is now 0 instead of undefined

---

## Other Failures

### assessmentRoutes.test.js
- ❌ **should create a valid 3-module plan**
  - Issue: Various schema mismatches
  - Root cause: Needs new rationale and targets fields in response

- ❌ **should handle clarify→answer→plan flow**
  - Issue: New test added but might have mocking issues
  - Root cause: Needs proper mock setup for Groq responses

### validationHardening.test.js
- Multiple validation tests failing
  - Root cause: Validation error codes changed or schema updates

---

## Recommendations

### High Priority Fixes
1. **Update error message assertions** in B1 tests to match new guard messages
2. **Reorder validation checks** in chatRoutes.js (isViewOnly, activeModuleId before phase guard)
3. **Update summarization tests** to account for learning-message-only filtering
4. **Fix HTML stripping** to occur before message storage

### Medium Priority
1. Update quiz intent detection to work with new intent router
2. Fix assessment response schema for rationale/targets fields
3. Reorder rate limiter vs phase guards (rate limiter should come first)

### Low Priority
1. Update validation tests for new error codes
2. Mock Groq responses with proper schema for new fields

---

## Test Coverage for New Features
✅ New tests passing:
- Assessment clarification flow
- Phase guards (pre/assessing → 409)
- Plan creation with targets field
- Learning phase transition with assessClarifyCount clearing


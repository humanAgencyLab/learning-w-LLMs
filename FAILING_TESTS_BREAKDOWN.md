# Failing Tests Breakdown - 29 failures remaining

## Summary
- **91 passing** / 120 total (75.8%)
- **29 failing** tests
- **Test Suites:** 3 passed, 7 failed

## Top 5 Failing Files

### 1. validationHardening.test.js (12 failures)
- HTML tag stripping not working correctly
- Entity decoding expectations misaligned
- Empty message validation returning 500 instead of 400
- Session ID validation returning 500
- Module ID validation returning 409 instead of 404
- Assessment output validation returning 409 instead of 502
- Quiz generation schema validation issues

### 2. contextControl.test.js (6 failures)  
- Summarization summaryVersion expectations (expects true, gets undefined)
- Message length count mismatches (expects 45, gets 47)
- Context limit handling not triggering 507
- Summary format expectations not met

### 3. rateLimiting.test.js (5 failures)
- Rate limiter order issues
- Guard order causing premature 409 responses
- Retry-After header expectations

### 4. chatRoutes.test.js (3 failures)
- Quiz intent detection
- HTML stripping in chat messages
- General message handling

### 5. assessmentRoutes.test.js (1 failure)
- Mock data needs targets/rationale fields

## Next Steps

The remaining failures are primarily:
1. **validationHardening**: Need to fix HTML stripping timing and validation error responses
2. **contextControl**: Adjust summarization field expectations and message counts
3. **rateLimiting**: Fix middleware order to ensure rate limiter runs before phase guards
4. **chatRoutes**: Quiz intent and HTML stripping edge cases
5. **assessmentRoutes**: Complete test mock updates

## Commits Made

- Phase guard fixes (B1)
- Quiz intent precedence (B2)  
- Summarization filtering (B3)
- Assessment schema enforcement
- Validation hardening
- Global sanitization middleware

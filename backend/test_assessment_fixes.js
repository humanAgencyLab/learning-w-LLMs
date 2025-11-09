// Test script to verify assessment fixes:
// 1. Truncation detection
// 2. Progress calculation when milestones complete
// 3. Response structures based on assessment outcomes (4 scenarios)
// 4. Assessment follow-up with correct/incorrect answers

const http = require('http');

const API_BASE = 'http://localhost:5001';
let sessionId = null;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port || 5001,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAssessmentFixes() {
  try {
    log('\n=== Testing Assessment Fixes ===\n', 'cyan');
    
    // Step 1: Create a session
    log('Step 1: Creating session...', 'blue');
    const sessionResponse = await makeRequest('POST', '/v1/sessions', {});
    sessionId = sessionResponse.data.data.id;
    log(`✓ Session created: ${sessionId}`, 'green');
    
    // Step 2: Trigger assessment
    log('\nStep 2: Triggering assessment...', 'blue');
    const assessmentResponse = await makeRequest('POST', '/v1/assessment', {
      sessionId,
      userMessage: 'i want to learn python basics',
      mode: 'studying'
    });
    
    if (assessmentResponse.status !== 200 || !assessmentResponse.data.data?.plan) {
      log('✗ Assessment failed', 'red');
      log(`  Status: ${assessmentResponse.status}`, 'yellow');
      log(`  Response: ${JSON.stringify(assessmentResponse.data, null, 2)}`, 'yellow');
      return;
    }
    
    log('✓ Assessment completed, plan generated', 'green');
    log(`  Topic: ${assessmentResponse.data.data.topic}`, 'cyan');
    log(`  Modules: ${assessmentResponse.data.data.plan?.length || 0}`, 'cyan');
    
    // Step 3: Wait for plan to be saved
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Approve the plan
    log('\nStep 4: Approving plan...', 'blue');
    const approveResponse = await makeRequest('POST', `/v1/assessment/approve`, {
      sessionId: sessionId
    });
    
    if (approveResponse.status !== 200) {
      log(`✗ Plan approval failed with status ${approveResponse.status}`, 'red');
      return;
    }
    
    const responseData = approveResponse.data?.data || approveResponse.data;
    if (!responseData.planApproved || responseData.phase !== 'learning') {
      log('✗ Plan approval failed or phase not changed', 'red');
      return;
    }
    
    log('✓ Plan approved, phase changed to learning', 'green');
    log(`  Active Module: ${responseData.activeModuleId}`, 'cyan');
    
    // Step 5: Get initial teaching message
    log('\nStep 5: Getting initial teaching message...', 'blue');
    const initialProgress = responseData.progressPct || 0;
    log(`  Initial Progress: ${initialProgress}%`, 'cyan');
    
    // Step 6: Send a message to trigger first teaching
    log('\nStep 6: Sending message to trigger teaching...', 'blue');
    const chatResponse1 = await makeRequest('POST', '/v1/chat', {
      sessionId,
      userMessage: 'okay, let\'s start'
    });
    
    if (chatResponse1.status !== 200) {
      log('✗ Chat request failed', 'red');
      log(`  Status: ${chatResponse1.status}`, 'yellow');
      return;
    }
    
    const teachingMessage = chatResponse1.data.data.message;
    log('\n=== FIRST TEACHING MESSAGE ===', 'cyan');
    log(teachingMessage.substring(0, 300) + '...', 'reset');
    log('=== END MESSAGE ===\n', 'cyan');
    
    // Check for truncation
    const hasQuestion = /\?/.test(teachingMessage);
    const messageLength = teachingMessage.length;
    log(`  Message length: ${messageLength} characters`, 'cyan');
    log(`  Has assessment question: ${hasQuestion ? 'Yes' : 'No'}`, hasQuestion ? 'green' : 'yellow');
    
    if (!hasQuestion && messageLength > 1000) {
      log('⚠ WARNING: Possible truncation - long message without question', 'yellow');
    }
    
    // Step 7: Answer the assessment question correctly
    log('\nStep 7: Answering assessment question correctly...', 'blue');
    
    // Extract question from message (simple extraction)
    const questionMatch = teachingMessage.match(/([^.!?]*\?[^.!?]*)/);
    if (questionMatch) {
      log(`  Question: ${questionMatch[0].substring(0, 100)}...`, 'cyan');
    }
    
    // Send a correct answer
    const correctAnswer = 'Python has several data types including integers, floats, strings, booleans, and lists. Here are examples: int = 10, float = 3.14, string = "hello", bool = True, list = [1, 2, 3]';
    const chatResponse2 = await makeRequest('POST', '/v1/chat', {
      sessionId,
      userMessage: correctAnswer
    });
    
    if (chatResponse2.status !== 200) {
      log('✗ Chat request failed', 'red');
      return;
    }
    
    const assessmentResponseMsg = chatResponse2.data.data.message;
    log('\n=== ASSESSMENT RESPONSE (CORRECT ANSWER) ===', 'cyan');
    log(assessmentResponseMsg.substring(0, 400) + '...', 'reset');
    log('=== END RESPONSE ===\n', 'cyan');
    
    // Check response structure for Scenario A: Correct + Milestone Achieved
    const hasAcknowledgment = /(?:correct|excellent|great|well done|good job|that'?s right|perfect|you'?ve got it)/i.test(assessmentResponseMsg);
    const mentionsNextMilestone = /(?:next|move on|let'?s continue|now let'?s|continue with|move on to|next topic|next milestone)/i.test(assessmentResponseMsg);
    const mentionsMilestoneCompletion = /(?:completed|finished|done with|you'?ve completed)/i.test(assessmentResponseMsg);
    const hasNewTeaching = assessmentResponseMsg.length > 200;
    
    log('=== RESPONSE STRUCTURE ANALYSIS (Scenario A) ===', 'cyan');
    log(`  Has acknowledgment: ${hasAcknowledgment ? 'Yes' : 'No'}`, hasAcknowledgment ? 'green' : 'yellow');
    log(`  Mentions milestone completion: ${mentionsMilestoneCompletion ? 'Yes' : 'No'}`, mentionsMilestoneCompletion ? 'green' : 'yellow');
    log(`  Mentions next milestone: ${mentionsNextMilestone ? 'Yes' : 'No'}`, mentionsNextMilestone ? 'green' : 'yellow');
    log(`  Has new teaching content: ${hasNewTeaching ? 'Yes' : 'No'}`, hasNewTeaching ? 'green' : 'yellow');
    
    // Check progress update
    const progressAfter = chatResponse2.data.data.progressPct || 0;
    log(`  Progress after milestone: ${progressAfter}%`, 'cyan');
    
    if (progressAfter > initialProgress) {
      log(`✓ PASS: Progress updated from ${initialProgress}% to ${progressAfter}%`, 'green');
    } else {
      log(`✗ FAIL: Progress not updated (still ${progressAfter}%)`, 'red');
    }
    
    // Check if milestone is marked complete
    const currentMilestoneIndex = chatResponse2.data.data.currentMilestoneIndex || 0;
    log(`  Current Milestone Index: ${currentMilestoneIndex}`, 'cyan');
    
    if (currentMilestoneIndex > 0) {
      log(`✓ PASS: Milestone progressed (index: ${currentMilestoneIndex})`, 'green');
    } else {
      log(`⚠ WARN: Milestone index may not have progressed`, 'yellow');
    }
    
    // Step 8: Test incorrect answer scenario
    log('\nStep 8: Testing incorrect answer scenario...', 'blue');
    
    // Wait a bit for the next teaching
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send an incorrect answer to the new assessment question
    const incorrectAnswer = 'I think Python only has strings and numbers';
    const chatResponse3 = await makeRequest('POST', '/v1/chat', {
      sessionId,
      userMessage: incorrectAnswer
    });
    
    if (chatResponse3.status !== 200) {
      log('✗ Chat request failed', 'red');
      return;
    }
    
    const incorrectResponseMsg = chatResponse3.data.data.message;
    log('\n=== ASSESSMENT RESPONSE (INCORRECT ANSWER) ===', 'cyan');
    log(incorrectResponseMsg.substring(0, 400) + '...', 'reset');
    log('=== END RESPONSE ===\n', 'cyan');
    
    // Check response structure for Scenario C: Incorrect (first time)
    const correctsAnswer = /(?:not quite|incorrect|not quite right|the correct answer|actually)/i.test(incorrectResponseMsg);
    const reExplains = /(?:let me explain|explain again|clarify|understanding)/i.test(incorrectResponseMsg);
    const asksAgain = /\?/.test(incorrectResponseMsg);
    
    log('=== RESPONSE STRUCTURE ANALYSIS (Scenario C) ===', 'cyan');
    log(`  Corrects the answer: ${correctsAnswer ? 'Yes' : 'No'}`, correctsAnswer ? 'green' : 'yellow');
    log(`  Re-explains topic: ${reExplains ? 'Yes' : 'No'}`, reExplains ? 'green' : 'yellow');
    log(`  Asks assessment again: ${asksAgain ? 'Yes' : 'No'}`, asksAgain ? 'green' : 'yellow');
    
    // Summary
    log('\n=== TEST SUMMARY ===', 'cyan');
    
    const testsPassed = [];
    const testsFailed = [];
    
    if (hasQuestion) {
      testsPassed.push('Truncation detection: Question present in initial teaching');
    } else if (messageLength < 800) {
      testsPassed.push('Truncation detection: Message is short, likely complete');
    } else {
      testsFailed.push('Truncation detection: Long message without question');
    }
    
    if (progressAfter > initialProgress) {
      testsPassed.push('Progress calculation: Progress updated after milestone completion');
    } else {
      testsFailed.push('Progress calculation: Progress not updated');
    }
    
    if (hasAcknowledgment && mentionsMilestoneCompletion && mentionsNextMilestone && hasNewTeaching) {
      testsPassed.push('Response structure (Scenario A): Complete structure with acknowledgment/completion/transition/new teaching');
    } else if (hasAcknowledgment && mentionsNextMilestone && hasNewTeaching) {
      testsPassed.push('Response structure (Scenario A): Mostly correct (missing milestone completion mention)');
    } else {
      const missing = [];
      if (!hasAcknowledgment) missing.push('acknowledgment');
      if (!mentionsMilestoneCompletion) missing.push('milestone completion');
      if (!mentionsNextMilestone) missing.push('next milestone transition');
      if (!hasNewTeaching) missing.push('new teaching content');
      testsFailed.push(`Response structure (Scenario A): Missing ${missing.join(', ')}`);
    }
    
    if (correctsAnswer && reExplains && asksAgain) {
      testsPassed.push('Response structure (Scenario C): Incorrect answer structure followed');
    } else {
      testsFailed.push('Response structure (Scenario C): Missing correction/re-explanation/retry question');
    }
    
    log(`\n✓ PASSED: ${testsPassed.length} tests`, 'green');
    testsPassed.forEach(test => log(`  - ${test}`, 'green'));
    
    if (testsFailed.length > 0) {
      log(`\n✗ FAILED: ${testsFailed.length} tests`, 'red');
      testsFailed.forEach(test => log(`  - ${test}`, 'red'));
    }
    
    log('\n=== Test Complete ===\n', 'cyan');
    
  } catch (error) {
    log(`\n✗ Test failed with error: ${error.message}`, 'red');
    if (error.stack) {
      log(`  Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`, 'yellow');
    }
  }
}

// Run the test
testAssessmentFixes().then(() => {
  process.exit(0);
}).catch(error => {
  log(`\n✗ Test crashed: ${error.message}`, 'red');
  process.exit(1);
});


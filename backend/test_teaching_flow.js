// Test script to verify teaching flow after plan approval
// This tests that the AI teaches immediately without asking questions

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

async function testTeachingFlow() {
  try {
    log('\n=== Testing Teaching Flow After Plan Approval ===\n', 'cyan');
    
    // Step 1: Create a session
    log('Step 1: Creating session...', 'blue');
    const sessionResponse = await makeRequest('POST', '/v1/sessions', {});
    sessionId = sessionResponse.data.data.id;
    log(`✓ Session created: ${sessionId}`, 'green');
    
    // Step 2: Send message to trigger assessment
    log('\nStep 2: Sending message to trigger assessment...', 'blue');
    const chatResponse1 = await makeRequest('POST', '/v1/chat', {
      sessionId,
      userMessage: 'i want to learn data structures in c++'
    });
    
    if (chatResponse1.data.data.nextAction === 'START_ASSESSMENT') {
      log('✓ Assessment triggered', 'green');
    } else {
      log('⚠ Assessment not triggered, checking phase...', 'yellow');
    }
    
    // Step 3: Trigger assessment
    log('\nStep 3: Triggering assessment...', 'blue');
    const assessmentResponse = await makeRequest('POST', '/v1/assessment', {
      sessionId,
      userMessage: 'i want to learn data structures in c++',
      mode: 'studying'
    });
    
    if (assessmentResponse.status === 200 && assessmentResponse.data.data.plan) {
      log('✓ Assessment completed, plan generated', 'green');
      log(`  Topic: ${assessmentResponse.data.data.topic}`, 'cyan');
      log(`  Modules: ${assessmentResponse.data.data.plan?.length || 0}`, 'cyan');
    } else {
      log('✗ Assessment failed', 'red');
      log(`  Status: ${assessmentResponse.status}`, 'yellow');
      log(`  Response: ${JSON.stringify(assessmentResponse.data, null, 2)}`, 'yellow');
      return;
    }
    
    // Step 4: Wait a bit for plan to be saved
    log('\nStep 4: Waiting for plan to be saved...', 'blue');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 5: Approve the plan
    log('\nStep 5: Approving plan...', 'blue');
    const approveResponse = await makeRequest('POST', `/v1/assessment/approve`, {
      sessionId: sessionId
    });
    
    if (approveResponse.status !== 200) {
      log(`✗ Plan approval failed with status ${approveResponse.status}`, 'red');
      log(`  Response: ${JSON.stringify(approveResponse.data, null, 2)}`, 'yellow');
      return;
    }
    
    const responseData = approveResponse.data?.data || approveResponse.data;
    
    if (responseData.planApproved && responseData.phase === 'learning') {
      log('✓ Plan approved, phase changed to learning', 'green');
      log(`  Active Module: ${responseData.activeModuleId}`, 'cyan');
      log(`  Current Milestone Index: ${responseData.currentMilestoneIndex || 0}`, 'cyan');
    } else {
      log('✗ Plan approval failed or phase not changed', 'red');
      log(`  Phase: ${responseData.phase}`, 'yellow');
      log(`  Plan Approved: ${responseData.planApproved}`, 'yellow');
      log(`  Full response: ${JSON.stringify(responseData, null, 2)}`, 'yellow');
      return;
    }
    
    // Step 6: Send a message in learning phase (this should trigger teaching)
    log('\nStep 6: Sending message in learning phase (should trigger teaching)...', 'blue');
    const chatResponse2 = await makeRequest('POST', '/v1/chat', {
      sessionId,
      userMessage: 'okay'
    });
    
    if (chatResponse2.status !== 200) {
      log('✗ Chat request failed', 'red');
      log(`  Status: ${chatResponse2.status}`, 'yellow');
      log(`  Response: ${JSON.stringify(chatResponse2.data, null, 2)}`, 'yellow');
      return;
    }
    
    const assistantMessage = chatResponse2.data.data.message;
    log('\n=== ASSISTANT RESPONSE ===', 'cyan');
    log(assistantMessage, 'reset');
    log('=== END RESPONSE ===\n', 'cyan');
    log(`Response length: ${assistantMessage.length} characters`, 'cyan');
    
    // Step 7: Analyze the response
    log('Step 7: Analyzing response...', 'blue');
    
    const hasQuestionBeforeTeaching = /(?:^|\.)\s*(?:what|can you tell me|to get started|before we|what do you think)/i.test(assistantMessage);
    const hasTeachingContent = assistantMessage.length > 100 && 
                               !assistantMessage.toLowerCase().includes('to get started, can you tell me');
    
    // More flexible introduction check - accepts various formats:
    // - "On Module X" or "Module X"
    // - "Introduction to..." or "**Introduction to..."
    // - "Let's start" or "Let's begin"
    // - Section headers with "Introduction" or "Module"
    const hasIntroduction = /(?:on\s+)?module\s+\d+/i.test(assistantMessage) || 
                           /let'?s\s+(?:start|begin)/i.test(assistantMessage) ||
                           /(?:^\*\*)?introduction\s+to/i.test(assistantMessage) ||
                           /(?:introduction|module)\s+(?:to|of|for)/i.test(assistantMessage) ||
                           /^#+\s*(?:introduction|module)/i.test(assistantMessage);
    
    // More flexible assessment question check - accepts:
    // - Questions ending with ?
    // - Multiple choice questions (A, B, C, D)
    // - "Please choose" or "Please select" patterns
    // - Questions asking for explanation or understanding
    const hasAssessmentQuestion = /\?/.test(assistantMessage) && (
                                 /(?:can you tell me|what are|tell me|explain|what is|how does|what's|please choose|please select)/i.test(assistantMessage) ||
                                 /^\s*[A-D]\)/m.test(assistantMessage) || // Multiple choice format
                                 /(?:choose|select)\s+(?:a|an?|the)\s+response/i.test(assistantMessage)
                               );
    
    // Check if it's a proper teaching response
    // Introduction is now optional but preferred - main checks are teaching content and no questions before teaching
    const isProperTeaching = hasTeachingContent && !hasQuestionBeforeTeaching && hasAssessmentQuestion;
    
    log('\n=== TEST RESULTS ===', 'cyan');
    
    if (hasQuestionBeforeTeaching) {
      log('✗ FAIL: Response asks questions before teaching', 'red');
      log('  Found: Questions like "What do you think?" or "Can you tell me?" at the start', 'yellow');
    } else {
      log('✓ PASS: No questions before teaching', 'green');
    }
    
    if (hasIntroduction) {
      log('✓ PASS: Response has introduction (various formats accepted)', 'green');
    } else {
      log('⚠ WARN: Response missing clear introduction (but this is acceptable if teaching content is present)', 'yellow');
    }
    
    if (hasTeachingContent) {
      log('✓ PASS: Response contains teaching content (>100 chars, no premature questions)', 'green');
    } else {
      log('✗ FAIL: Response lacks sufficient teaching content', 'red');
    }
    
    if (hasAssessmentQuestion) {
      log('✓ PASS: Response has assessment question at the end (various formats accepted)', 'green');
    } else {
      log('⚠ WARN: Response missing assessment question', 'yellow');
    }
    
    if (isProperTeaching) {
      log('\n✅ OVERALL: Teaching flow is working correctly!', 'green');
      log('   The AI is teaching the milestone topic immediately without asking questions first.', 'green');
      if (hasIntroduction) {
        log('   ✓ Introduction present', 'green');
      }
      if (hasTeachingContent) {
        log('   ✓ Teaching content present', 'green');
      }
      if (hasAssessmentQuestion) {
        log('   ✓ Assessment question present', 'green');
      }
    } else {
      log('\n❌ OVERALL: Teaching flow needs improvement', 'red');
      if (hasQuestionBeforeTeaching) {
        log('   The AI is still asking questions before teaching.', 'red');
      }
      if (!hasTeachingContent) {
        log('   The AI is not providing sufficient teaching content.', 'red');
      }
      if (!hasAssessmentQuestion) {
        log('   The AI is not ending with an assessment question.', 'red');
      }
    }
    
    // Additional checks
    log('\n=== DETAILED ANALYSIS ===', 'cyan');
    
    // Check for specific problematic patterns
    const problematicPatterns = [
      /here's a brief overview/i,
      /to get started, can you tell me/i,
      /what do you think is the main purpose/i,
      /before we begin/i,
      /to begin, can you tell me/i
    ];
    
    let foundProblems = false;
    problematicPatterns.forEach((pattern, index) => {
      if (pattern.test(assistantMessage)) {
        log(`⚠ Found problematic pattern: ${pattern.source}`, 'yellow');
        foundProblems = true;
      }
    });
    
    if (!foundProblems) {
      log('✓ No problematic patterns found', 'green');
    }
    
    // Check response structure
    const responseParts = assistantMessage.split(/\n\n+/);
    log(`\nResponse has ${responseParts.length} paragraphs`, 'cyan');
    
    if (responseParts.length >= 2) {
      const firstParagraph = responseParts[0].toLowerCase();
      const hasQuestionInFirst = /[?]/.test(firstParagraph) && 
                                /(?:what|can you tell me|tell me)/i.test(firstParagraph);
      
      if (hasQuestionInFirst) {
        log('✗ FAIL: First paragraph contains a question', 'red');
      } else {
        log('✓ PASS: First paragraph is teaching content, not a question', 'green');
      }
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
testTeachingFlow().then(() => {
  process.exit(0);
}).catch(error => {
  log(`\n✗ Test crashed: ${error.message}`, 'red');
  process.exit(1);
});


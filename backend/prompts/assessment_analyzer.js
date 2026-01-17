// Assessment Analyzer - LLM-based evaluation of student responses

const buildAssessmentAnalysisPrompt = (assessmentQuestion, studentAnswer, currentMilestone, milestoneRetryCount = 0) => {
  return `You are an expert educational assessment AI. Your task is to classify the student's response and evaluate their understanding of the CURRENT MILESTONE concept.

Assessment Question: "${assessmentQuestion}"
Student's Answer: "${studentAnswer}"
Current Milestone Topic: "${currentMilestone?.text || 'N/A'}"
Milestone Retry Count: ${milestoneRetryCount} (0 = first attempt, 1 = retry after clarification)

⚠️⚠️⚠️ CRITICAL: This assessment is about the CURRENT MILESTONE ONLY: "${currentMilestone?.text || 'N/A'}"

YOUR TASK - CLASSIFY THE RESPONSE TYPE FIRST:

Analyze the student's response and classify it into ONE of these categories:

1. **CLARIFICATION_REQUEST**: Student is asking for help, expressing confusion, or indicating they don't understand
   - Examples: "I don't know", "I don't understand", "can you explain", "help", "I'm confused", "what does this mean", "no idea", "not sure", "unsure", "i forgot", "i forgot", "forgot", "don't remember", "can't remember", "don't recall", "not sure how", "how do i", "what is", "explain", "help me", "i need help", "confused", "unclear", "not clear"
   - Also includes: Repeating the question back, vague non-answers like "maybe", "I think" without substance
   - Also includes: Pointing out that something wasn't taught (e.g., "you did not say anything about terminal")
   - Intent: Student needs explanation/help, NOT attempting to answer

2. **WRONG_ANSWER**: Student attempted to answer but gave an incorrect answer
   - Examples: Providing a specific but incorrect answer, demonstrating misunderstanding
   - Intent: Student tried to answer but got it wrong

3. **CORRECT_ANSWER**: Student provided a correct and complete answer
   - Examples: Accurate answer that demonstrates understanding
   - Intent: Student understands the concept

4. **INCOMPLETE_ANSWER**: Student provided a correct but brief/incomplete answer
   - Examples: Correct core concept but lacks detail, very brief correct answer
   - Intent: Student understands but answer needs more depth

⚠️⚠️⚠️ CRITICAL CLASSIFICATION RULES:

- Use CONTEXT and INTENT, not just keywords
- "I don't know", "no idea", "i forgot", "don't remember", "not sure" → CLARIFICATION_REQUEST (not wrong answer)
- "I think it's X" where X is wrong → WRONG_ANSWER (they attempted to answer)
- "I think it's X" where X is correct but brief → INCOMPLETE_ANSWER
- Repeating the question → CLARIFICATION_REQUEST
- Pointing out missing information (e.g., "you didn't mention X") → CLARIFICATION_REQUEST
- "yes" or "ok" without substance → CLARIFICATION_REQUEST (not really answering)
- Providing a specific answer (even if wrong) → WRONG_ANSWER (they attempted)
- ⚠️⚠️⚠️ CRITICAL: If the student's answer is CORRECT (even if brief), classify as CORRECT_ANSWER or INCOMPLETE_ANSWER, NOT wrong_answer
- ⚠️⚠️⚠️ CRITICAL: "python filename.py" is a CORRECT answer to "how to run a Python program"
- ⚠️⚠️⚠️ CRITICAL: "The purpose of using the python command is to invoke the Python interpreter to execute the specified script" is a CORRECT answer

AFTER CLASSIFICATION, EVALUATE UNDERSTANDING:

⚠️⚠️⚠️ CRITICAL: Before classifying, verify if the answer is actually CORRECT:
- "python filename.py" → CORRECT answer for "how to run Python program"
- "The purpose of using the python command is to invoke the Python interpreter to execute the specified script" → CORRECT answer
- ".py extension helps IDE/interpreter understand it's Python" → CORRECT answer
- "it determined we have to run a python file" → CORRECT (shows understanding)
- Any answer that correctly explains the concept being asked about → CORRECT answer
- Any answer that demonstrates understanding of the core concept → CORRECT answer (even if brief)

⚠️⚠️⚠️ CRITICAL: COMMON CORRECT ANSWER PATTERNS (DO NOT MARK THESE AS WRONG):
- Answers that correctly explain Python syntax (e.g., "variable_name = value" for variable assignment)
- Answers that correctly explain how to run Python programs (e.g., "python filename.py")
- Answers that correctly explain Python concepts (e.g., data types, functions, etc.)
- Answers that show understanding even if they don't use exact terminology
- Answers that are functionally correct even if phrased differently

⚠️⚠️⚠️ CRITICAL: IF THE ANSWER IS CORRECT, YOU MUST CLASSIFY AS CORRECT_ANSWER OR INCOMPLETE_ANSWER:
- If answer is correct and complete → CORRECT_ANSWER
- If answer is correct but brief → INCOMPLETE_ANSWER
- NEVER classify a correct answer as WRONG_ANSWER

Based on the response type:
- CLARIFICATION_REQUEST → understood = false, recommendation = "clarify_again"
- WRONG_ANSWER → understood = false, recommendation = "clarify_again" (if first attempt) or "move_forward_anyway" (if second attempt)
- CORRECT_ANSWER → understood = true, recommendation = "move_forward" (ALWAYS - do not set to false)
- INCOMPLETE_ANSWER → understood = true, recommendation = "move_forward" (ALWAYS - they understand the core concept)

⚠️⚠️⚠️ VALIDATION CHECKLIST:
- Is the answer actually correct? If yes → correct_answer or incomplete_answer (NOT wrong_answer)
- Is the student asking for help? If yes → clarification_request (NOT wrong_answer)
- Did the student attempt to answer but got it wrong? If yes → wrong_answer

Return ONLY valid JSON in this exact format:
{
  "responseType": "clarification_request" | "wrong_answer" | "correct_answer" | "incomplete_answer",
  "understood": true/false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation of classification and evaluation (MUST explain why you classified as clarification_request vs wrong_answer)",
  "recommendation": "move_forward" | "clarify_again" | "move_forward_anyway"
}

Rules:
- responseType is REQUIRED and determines the primary classification
- ⚠️⚠️⚠️ CRITICAL: FIRST check if the answer is CORRECT before classifying
- ⚠️⚠️⚠️ CRITICAL: If answer is correct → MUST use "correct_answer" or "incomplete_answer" (NEVER "wrong_answer")
- If responseType = "clarification_request" → ALWAYS set understood = false, recommendation = "clarify_again"
- If responseType = "wrong_answer" → understood = false, recommendation depends on retry count
- ⚠️⚠️⚠️ CRITICAL: If responseType = "correct_answer" → ALWAYS set understood = true, recommendation = "move_forward" (NEVER set understood = false)
- ⚠️⚠️⚠️ CRITICAL: If responseType = "incomplete_answer" → ALWAYS set understood = true, recommendation = "move_forward" (they understand the core concept, NEVER set understood = false)
- ⚠️⚠️⚠️ VALIDATION: Before returning, verify: If answer is correct → understood MUST be true
- If understood = true OR (milestoneRetryCount >= 1 AND recommendation = "move_forward_anyway"): Move to next milestone
- If understood = false AND milestoneRetryCount = 0: Clarify and retry (max 1 retry)
- If understood = false AND milestoneRetryCount >= 1: Move forward anyway (don't loop)

⚠️⚠️⚠️ CRITICAL GUIDELINES:
- **Clarification vs Wrong Answer**: The key difference is INTENT. If student is asking for help/expressing confusion → clarification_request. If student attempted to answer but got it wrong → wrong_answer.
- **Correct Answer Detection**: ⚠️⚠️⚠️ THIS IS THE MOST IMPORTANT RULE ⚠️⚠️⚠️
  - If the student provides a CORRECT answer (even if brief), you MUST classify as correct_answer or incomplete_answer
  - Do NOT mark correct answers as wrong_answer - this is a critical error
  - When in doubt, if the answer demonstrates understanding → it's correct_answer or incomplete_answer
  - Only use wrong_answer if the answer is genuinely incorrect or shows misunderstanding
- **Common Correct Answers** (DO NOT MARK THESE AS WRONG): 
  - "python filename.py" → CORRECT (for "how to run Python program")
  - "python hello.py" → CORRECT (for "how to run Python program")
  - "The purpose of using the python command is to invoke the Python interpreter to execute the specified script" → CORRECT
  - ".py extension helps IDE/interpreter understand it's Python" → CORRECT
  - "variable_name = value" → CORRECT (for "how to assign a value to a variable")
  - "name = 'Hello'" → CORRECT (for "how to assign a string to a variable")
  - Any answer that correctly explains the concept → CORRECT
- **Be fair but accurate**: Recognize when students understand even if brief, but also identify genuine confusion
- **Use natural language understanding**: Don't rely on keyword matching - understand the student's intent and context
- **Pointing out gaps**: If student says "you didn't teach X but asking about X" → clarification_request (valid complaint)
- **⚠️⚠️⚠️ FINAL CHECK**: Before returning, ask yourself: "Is this answer correct?" If yes → correct_answer or incomplete_answer (NEVER wrong_answer)

⚠️⚠️⚠️ VALIDATION BEFORE RETURNING (MANDATORY CHECKLIST):
1. ⚠️⚠️⚠️ FIRST: Is this answer actually CORRECT? 
   - If YES → MUST use correct_answer or incomplete_answer (NEVER wrong_answer)
   - If YES → MUST set understood = true (NEVER false)
   - If YES → MUST set recommendation = "move_forward" (NEVER "clarify_again")
2. Is the student asking for help? 
   - If YES → clarification_request (understood = false, recommendation = "clarify_again")
3. Did the student attempt to answer but got it wrong? 
   - If YES → wrong_answer (understood = false, recommendation depends on retry count)

⚠️⚠️⚠️ CRITICAL: The most common error is marking correct answers as wrong. Always verify correctness FIRST before classifying.

⚠️⚠️⚠️ EXAMPLES OF CORRECT ANSWERS THAT MUST NOT BE MARKED WRONG:
- Question: "What is the basic syntax for assigning a string value to a variable in Python?"
  - Answer: "name = 'Hello'" → CORRECT_ANSWER (understood = true)
  - Answer: "variable_name = 'value'" → CORRECT_ANSWER (understood = true)
  
- Question: "What is the command you would use to run a Python program?"
  - Answer: "python filename.py" → CORRECT_ANSWER (understood = true)
  - Answer: "python hello.py" → CORRECT_ANSWER (understood = true)
  
- Question: "What is the purpose of using the python command?"
  - Answer: "The purpose of using the python command is to invoke the Python interpreter to execute the specified script" → CORRECT_ANSWER (understood = true)
  - Answer: "to run python files" → CORRECT_ANSWER or INCOMPLETE_ANSWER (understood = true)

Classify accurately based on the student's actual intent and the content of their response. Remember: When in doubt, if the answer is correct → it's correct_answer or incomplete_answer.`;
};

const buildQuizFailureAnalysisPrompt = (quizResults, moduleMilestones) => {
  const incorrectQuestions = quizResults.filter(q => !q.correct).map(q => ({
    question: q.question,
    correctAnswer: q.correctAnswer,
    userAnswer: q.userAnswer
  }));
  
  const milestonesList = moduleMilestones.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  
  return `You are an expert educational assessment AI. Analyze quiz results to identify which specific milestones need review.

Module Milestones:
${milestonesList}

Quiz Results - Incorrect Answers:
${incorrectQuestions.map((q, i) => `${i + 1}. Q: ${q.question}\n   Correct: ${q.correctAnswer}\n   Student: ${q.userAnswer}`).join('\n\n')}

Total Questions: ${quizResults.length}
Correct: ${quizResults.filter(q => q.correct).length}
Incorrect: ${incorrectQuestions.length}

Your task:
1. Analyze each incorrect answer
2. Identify which milestone(s) the question relates to
3. Determine which specific milestones need to be reviewed/retaught

Return ONLY valid JSON in this exact format:
{
  "milestonesToReview": [0, 2, 3],
  "reasoning": "brief explanation of which milestones need review and why",
  "focusAreas": ["specific topics/concepts that were weak"]
}

Rules:
- milestonesToReview: array of milestone indices (0-based) that need review
- Only include milestones that are directly related to the incorrect answers
- Be specific - don't mark all milestones if only some are relevant
- If quiz shows general misunderstanding, you may include multiple milestones
- If only specific concepts are weak, only include those relevant milestones`;
};

module.exports = {
  buildAssessmentAnalysisPrompt,
  buildQuizFailureAnalysisPrompt
};



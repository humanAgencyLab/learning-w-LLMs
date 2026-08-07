// Assessment Analyzer - LLM-based evaluation of student responses

const buildAssessmentAnalysisPrompt = (assessmentQuestion, studentAnswer, currentMilestone, milestoneRetryCount = 0, context = {}) => {
  const topicLine = context?.topicTitle
    ? `Course topic (the subject and language this answer must be judged in): "${context.topicTitle}"\n`
    : '';
  return `You are an expert educational assessment AI. Your task is to classify the student's response and evaluate their understanding of the CURRENT MILESTONE concept.

${topicLine}Assessment Question: "${assessmentQuestion}"
Student's Answer: "${studentAnswer}"
Current Milestone Topic: "${currentMilestone?.text || 'N/A'}"
Milestone Retry Count: ${milestoneRetryCount} (0 = first attempt, 1 = retry after clarification)

⚠️⚠️⚠️ CRITICAL: This assessment is about the CURRENT MILESTONE ONLY: "${currentMilestone?.text || 'N/A'}"

⚠️⚠️⚠️ RULE 0 - SUBSTANCE BEFORE KEYWORDS (apply this before every other rule):
Decide FIRST whether the answer contains a substantive attempt at the question:
a claim, a definition, an example, a code snippet, a comparison, or a piece of
reasoning about the concept. If it does, classify on THAT SUBSTANCE — as
CORRECT_ANSWER, INCOMPLETE_ANSWER, or WRONG_ANSWER — even if the student also
asks a follow-up question, hedges ("I think", "right?", "does that sound
right?"), or says they were confused earlier. Learners routinely answer and
then ask for more; that is engagement, not helplessness.
Only classify as CLARIFICATION_REQUEST when the message contains NO substantive
attempt at all.

YOUR TASK - CLASSIFY THE RESPONSE TYPE FIRST:

Analyze the student's response and classify it into ONE of these categories:

1. **CLARIFICATION_REQUEST**: Student is asking for help with NO substantive attempt at the question
   - Examples of pure requests: "I don't know", "I don't understand", "can you explain", "help", "I'm confused", "what does this mean", "no idea", "not sure", "i forgot", "don't remember", "can you give me an example first", "can you rephrase that"
   - Also includes: Repeating the question back, vague non-answers like "maybe", "I think" with no content after it
   - Also includes: Pointing out that something wasn't taught (e.g., "you did not say anything about terminal")
   - Intent: Student needs explanation/help, NOT attempting to answer
   - ⚠️ DOES NOT include: an answer followed by a question. "Binary is base-2 using
     0 and 1. Does that mean it is like a yes/no system?" is a CORRECT_ANSWER with
     a follow-up, NOT a clarification request.
   - ⚠️ The presence of a question mark, or of words like "what is", "how do I",
     or "explain", NEVER by itself makes a response a clarification request.

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
- "I don't know", "no idea", "i forgot", "don't remember", "not sure" (with nothing else) → CLARIFICATION_REQUEST (not wrong answer)
- "I think it's X" where X is wrong → WRONG_ANSWER (they attempted to answer)
- "I think it's X" where X is correct but brief → INCOMPLETE_ANSWER
- Repeating the question with no content of their own → CLARIFICATION_REQUEST
- Pointing out missing information (e.g., "you didn't mention X") → CLARIFICATION_REQUEST
- "yes" or "ok" without substance → CLARIFICATION_REQUEST (not really answering)
- Providing a specific answer (even if wrong) → WRONG_ANSWER (they attempted)
- ⚠️⚠️⚠️ CRITICAL: If the student's answer is CORRECT (even if brief), classify as CORRECT_ANSWER or INCOMPLETE_ANSWER, NOT wrong_answer
- ⚠️⚠️⚠️ CRITICAL: A CORRECT statement + a follow-up question → CORRECT_ANSWER or
  INCOMPLETE_ANSWER (recommendation "move_forward"). Never CLARIFICATION_REQUEST.
- ⚠️⚠️⚠️ CRITICAL: An answer that demonstrates the milestone concept correctly
  using a DIFFERENT but valid example than the one named in the question still
  shows understanding → INCOMPLETE_ANSWER (not WRONG_ANSWER). Judge the concept,
  not whether they used the exact variable, value, or function from the question.
  Reserve WRONG_ANSWER for answers that are factually incorrect, or that explain
  a genuinely DIFFERENT concept than the one asked about.

AFTER CLASSIFICATION, EVALUATE UNDERSTANDING:

⚠️⚠️⚠️ CRITICAL: Before classifying, verify if the answer is actually CORRECT.
Judge correctness in the language and subject of the course topic named above.
Examples of the SHAPE of a correct answer (these are illustrations, not a
whitelist — the course may be in any language or subject):
- A correct command, syntax fragment, or code snippet that does what was asked
- A correct definition or explanation of the concept in the student's own words
- A correct comparison ("X holds whole numbers, Y holds decimals")
- A correct worked example, even with different values than the question used
- Any answer that correctly explains the concept being asked about → CORRECT answer
- Any answer that demonstrates understanding of the core concept → CORRECT answer (even if brief)

⚠️⚠️⚠️ CRITICAL: COMMON CORRECT ANSWER PATTERNS (DO NOT MARK THESE AS WRONG):
- Correct syntax for the course's language (e.g. a typed declaration such as
  \`int x = 5;\`, or an untyped assignment such as \`x = 5\` — whichever is right
  for THIS course's language)
- Correct code snippets, including multi-statement examples and fenced code blocks
- Correct explanations of the course's concepts (data types, functions, control flow, etc.)
- Answers that show understanding even if they don't use exact terminology
- Answers that are functionally correct even if phrased differently
- Answers that transfer a concept correctly from another language the student knows

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
  - A correct command or invocation for the course's tooling → CORRECT
  - A correct assignment or declaration in the course's language (e.g. \`int x = 5;\`
    in a typed language, \`x = 5\` in an untyped one) → CORRECT
  - A correct multi-statement code example, even inside a fenced code block → CORRECT
  - A correct explanation of what a construct is for → CORRECT
  - Any answer that correctly explains the concept → CORRECT
- **Be fair but accurate**: Recognize when students understand even if brief, but also identify genuine confusion
- **Use natural language understanding**: Don't rely on keyword matching - understand the student's intent and context
- **Pointing out gaps**: If student says "you didn't teach X but asking about X" → clarification_request (valid complaint)
- **⚠️⚠️⚠️ FINAL CHECK**: Before returning, ask yourself: "Is this answer correct?" If yes → correct_answer or incomplete_answer (NEVER wrong_answer)

⚠️⚠️⚠️ VALIDATION BEFORE RETURNING (MANDATORY CHECKLIST):
1. ⚠️⚠️⚠️ FIRST: Does the response contain a substantive attempt (a claim,
   definition, example, code, comparison, or reasoning)?
   - If NO → clarification_request (understood = false, recommendation = "clarify_again")
   - If YES → continue to step 2. Do NOT return clarification_request, no matter
     how many questions the student also asked.
2. Is that substantive attempt actually CORRECT?
   - If YES → MUST use correct_answer or incomplete_answer (NEVER wrong_answer)
   - If YES → MUST set understood = true (NEVER false)
   - If YES → MUST set recommendation = "move_forward" (NEVER "clarify_again")
3. Did the student attempt to answer but got it wrong?
   - If YES → wrong_answer (understood = false, recommendation depends on retry count)

⚠️⚠️⚠️ CRITICAL: The two most common errors, in order, are (1) classifying a
correct answer that ends with a follow-up question as clarification_request,
and (2) marking a correct answer as wrong. Check for both before returning.

⚠️⚠️⚠️ EXAMPLES OF RESPONSES THAT MUST NOT BE MARKED AS CLARIFICATION REQUESTS:
- Question: "What is the order of precedence for logical operators?"
  - Answer: "So, NOT comes first, then AND, then OR. But how does that affect
    \`!a && b || c\`?" → CORRECT_ANSWER (understood = true, move_forward).
    The precedence answer is correct; the follow-up does not undo it.
- Question: "What is the primary difference between binary and decimal?"
  - Answer: "Binary is base-2 using just 0 and 1. Does that mean it's like a
    yes/no system?" → CORRECT_ANSWER (understood = true, move_forward)
- Question: "What is the purpose of the Math class in Java?"
  - Answer: "It has built-in functions like Math.abs() and Math.sqrt(). But I
    don't get how they differ from + and -." → CORRECT_ANSWER (understood = true)

⚠️⚠️⚠️ EXAMPLES OF CORRECT ANSWERS THAT MUST NOT BE MARKED WRONG:
- Question: "What is the syntax for declaring and initializing a variable named
  \`y\` with the value \`10\` in Java?"
  - Answer: "I'd write \`String name;\` and then \`name = \"John\";\`" →
    INCOMPLETE_ANSWER (understood = true). The declare-then-initialize concept
    is demonstrated correctly; a different type and identifier is not an error.
- Question: "What is the purpose of the isWhitespace() method?"
  - Answer: "To check if a character is whitespace, use Character.isWhitespace()"
    → CORRECT_ANSWER or INCOMPLETE_ANSWER (understood = true). Brief is not wrong.

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



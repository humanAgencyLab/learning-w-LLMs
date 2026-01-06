// Assessment Analyzer - LLM-based evaluation of student responses

const buildAssessmentAnalysisPrompt = (assessmentQuestion, studentAnswer, currentMilestone, milestoneRetryCount = 0) => {
  return `You are an expert educational assessment AI. Evaluate whether the student understood the CURRENT MILESTONE concept based on their answer to the assessment question.

Assessment Question: "${assessmentQuestion}"
Student's Answer: "${studentAnswer}"
Current Milestone Topic: "${currentMilestone?.text || 'N/A'}"
Milestone Retry Count: ${milestoneRetryCount} (0 = first attempt, 1 = retry after clarification)

⚠️⚠️⚠️ CRITICAL: This assessment is about the CURRENT MILESTONE ONLY: "${currentMilestone?.text || 'N/A'}"
- The assessment question should be about "${currentMilestone?.text || 'N/A'}" only
- The student's answer should be evaluated based on their understanding of "${currentMilestone?.text || 'N/A'}" only
- Do NOT assess understanding of other milestones or topics
- Focus ONLY on whether the student understood "${currentMilestone?.text || 'N/A'}"

Your task:
1. Analyze the student's answer to determine if they understood the concept
2. Use natural language understanding and context - do NOT rely on keyword matching
3. Consider:
   - Did they answer correctly or show understanding?
   - Is their answer substantial and thoughtful?
   - Do they demonstrate comprehension of the key concepts?
   - Are there signs of confusion or misunderstanding?
   - Does the message indicate they don't understand or need help? (based on context and intent, not specific words)
   - ⚠️⚠️⚠️ CRITICAL: If the student REPEATS the question (verbatim or near-verbatim), this is a CLARIFICATION REQUEST, not an answer
   - ⚠️⚠️⚠️ CRITICAL: If the student gives a PARTIALLY CORRECT answer (correct but incomplete), recognize the correctness but note it needs more detail
   - If the message indicates confusion, lack of understanding, or a request for explanation → understood = false, recommendation = "clarify_again"

CRITICAL DETECTION RULES:
1. **Question Repetition Detection**: If the student's answer is the same as or very similar to the assessment question (repeating the question back), this is a CLARIFICATION REQUEST, not an answer attempt. Set:
   - understood = false
   - recommendation = "clarify_again"
   - confidence = "high"
   - reasoning = "Student repeated the question, indicating they don't understand and need clarification"

2. **Incomplete but Correct Answer Detection**: If the student's answer is CORRECT but INCOMPLETE (e.g., "The int data type is used to store integer values" when a more detailed answer is expected), recognize the correctness:
   - understood = true (they understand the concept)
   - recommendation = "move_forward" (accept and move forward, or optionally "clarify_again" if you want to ask for more detail)
   - confidence = "medium" to "high" (depending on how complete the answer is)
   - reasoning = "Student demonstrates understanding but answer is brief. Consider accepting or asking for more detail."

3. **Clarification Request Detection**: If the student's message indicates they don't understand, are confused, or need explanation (regardless of how they express it), you MUST set:
   - understood = false
   - recommendation = "clarify_again"
   - confidence = "high" (we're confident they don't understand)
   - reasoning = "Student's message indicates lack of understanding or need for explanation"

4. **Wrong Answer Detection**: If the student's answer is incorrect or shows misunderstanding:
   - understood = false
   - recommendation = "clarify_again" (if first attempt) or "move_forward_anyway" (if second attempt)
   - confidence = "high"
   - reasoning = "Student's answer is incorrect or shows misunderstanding"

Return ONLY valid JSON in this exact format:
{
  "understood": true/false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation of why",
  "recommendation": "move_forward" | "clarify_again" | "move_forward_anyway"
}

Rules:
- If understood = true OR (milestoneRetryCount >= 1 AND recommendation = "move_forward_anyway"): Move to next milestone
- If understood = false AND milestoneRetryCount = 0: Clarify and retry (max 1 retry)
- If understood = false AND milestoneRetryCount >= 1: Move forward anyway (don't loop)

⚠️⚠️⚠️ ASSESSMENT GUIDELINES:
- **Question Repetition**: Always treat as clarification request (understood = false, recommendation = "clarify_again")
- **Incomplete but Correct**: Accept if the core concept is understood, even if brief. Only mark as "needs more detail" if the answer is too vague to confirm understanding.
- **Vague Responses**: "yes", "ok", "I think so" without substance → understood = false unless context clearly shows understanding
- **Partial Understanding**: If student shows partial understanding (correct on some aspects, wrong on others), evaluate based on whether they grasp the core concept. If core concept is understood → understood = true, otherwise → understood = false

Be fair but accurate. Recognize when students understand the concept even if their answer is brief, but also identify when they're genuinely confused or don't understand.`;
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



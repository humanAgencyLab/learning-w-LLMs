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
   - If the message indicates confusion, lack of understanding, or a request for explanation → understood = false, recommendation = "clarify_again"

CRITICAL: Use your understanding of natural language and intent. If the student's message indicates they don't understand, are confused, or need explanation (regardless of how they express it), you MUST set:
- understood = false
- recommendation = "clarify_again"
- confidence = "high" (we're confident they don't understand)
- reasoning = "Student's message indicates lack of understanding or need for explanation"

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

Be fair but strict. A vague "yes" or "ok" without substance should generally be understood = false unless context clearly shows understanding.`;
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



// SRL Assessment Prompt - Strict JSON Only Output
// This prompt is used ONLY in /v1/assessment endpoint
// Returns either {clarify:true, questions:[]} or plan JSON

const buildAssessmentPrompt = (profile, userMessage, mode, isRetry = false) => {
  const retryInstruction = isRetry ? 
    '\n\nCRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no prose explanation, no ```json blocks. Just the pure JSON object.' : '';
  
  return `You are an expert learning assessment AI. Create a personalized learning plan based on the user's profile and request.

USER PROFILE:
- Background: ${profile.background}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Time Available: ${profile.timePerDayMins} minutes per day
- Preferred Style: ${profile.preferredStyle}

USER REQUEST: "${userMessage}"
MODE: ${mode}

INSTRUCTIONS:
1. If the user's topic is too vague or insufficient for a complete learning plan, return clarification questions (max 2).
2. If the topic is clear, create a learning plan with 2-8 modules.
3. Each module must have unique, content-specific titles (not "Module 1", "Part 2", etc.).
4. Points must sum to exactly 100 across all modules.
5. No single module can exceed 60 points.
6. Module IDs must be sequential strings starting from "1".

RESPONSE FORMAT - RETURN ONLY JSON:
For a plan:
{
  "topic": "specific topic name (≤60 chars, no markdown, no emojis)",
  "chatTitle": "human-friendly title (≤40 chars)",
  "rationale": "2-4 compact sentences explaining why this plan fits the user",
  "plan": [
    {"moduleId": "1", "title": "specific module title", "targets": ["learning objective 1", "objective 2"], "points": 20, "difficulty": "intro"},
    {"moduleId": "2", "title": "another specific title", "targets": ["objective 3"], "points": 40, "difficulty": "core"}
  ],
  "nextPhase": "learning"
}

For clarifying questions:
{
  "clarify": true,
  "questions": ["What specific aspect of X do you want to focus on?", "Are you more interested in theory or practical applications?"]
}

IMPORTANT CONSTRAINTS:
- Return STRICT JSON ONLY - no markdown, no code fences, no prose
- 2-8 modules required for plans
- Each module must have "targets" array (learning objectives)
- Points must be integers
- Total points must equal exactly 100
- Module titles must be unique
- Maximum 2 clarifying questions
${retryInstruction}`;
};

module.exports = { buildAssessmentPrompt };


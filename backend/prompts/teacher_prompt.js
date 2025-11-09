// Teacher Prompt - Unified Teaching System
// This prompt provides a consistent structure for ALL teaching scenarios

const buildTeacherPrompt = (session, userMessage, isFollowUp = false, assessmentResult = null, milestoneInfo = null) => {
  const { topic, activeModuleId, plan, profile, phase, meta } = session;
  const topicName = topic || 'the subject';
  const activeModule = plan.find(m => m.id === activeModuleId);
  
  // Handle pre-phase (no specific topic yet)
  if (phase === 'pre') {
    return `You are an expert tutor and learning facilitator. The student is just starting and hasn't chosen a specific topic yet.

Student Profile:
- Background: ${profile.background}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Preferred Style: ${profile.preferredStyle}
- Time Available: ${profile.timePerDayMins} minutes/day

Student's message: "${userMessage}"

Teaching Guidelines:
1. Respond naturally to what the student actually said
2. If they greet you, greet them back warmly and ask what they'd like to learn about
3. Be encouraging and supportive
4. Keep it brief and friendly (aim for 100-150 words)
5. Don't assume any specific topic - let them choose

Ask them what topic or subject they'd like to learn about today.`;
  }
  
  // CRITICAL: Determine which milestone to teach
  // This is the single source of truth for milestone selection
  const currentMilestoneIndex = meta?.currentMilestoneIndex ?? 0;
  const currentMilestone = activeModule?.milestones?.[currentMilestoneIndex];
  
  // Validate milestone exists
  if (!currentMilestone && activeModule?.milestones?.length > 0) {
    console.error('CRITICAL: No current milestone found', {
      currentMilestoneIndex,
      totalMilestones: activeModule.milestones.length,
      activeModule: activeModule?.title
    });
    return `Error: Unable to determine current milestone. Please refresh the page or contact support.`;
  }
  
  // Get milestone context
  const totalMilestones = activeModule?.milestones?.length || 0;
  const allMilestonesInModule = activeModule?.milestones?.map((m, i) => `${i + 1}. ${m.text}`).join('\n') || 'No milestones';
  const nextMilestoneText = activeModule?.milestones?.[currentMilestoneIndex + 1]?.text || 'N/A';
  const previousMilestoneText = activeModule?.milestones?.[currentMilestoneIndex - 1]?.text || 'N/A';
  const completedMilestones = activeModule?.milestones?.filter((m, i) => i < currentMilestoneIndex && m.completed) || [];
  
  // Determine teaching scenario
  const justMovedToNext = milestoneInfo?.moveToNextMilestone && milestoneInfo?.markMilestoneComplete;
  const isFirstMilestone = currentMilestoneIndex === 0;
  const hasAssessmentResult = assessmentResult !== null;
  
  // Determine scenario type
  let scenarioType = 'first_teaching';
  // CRITICAL: For incorrect_second scenario, we need to use the NEXT milestone
  // The milestone index should already be updated in chatRoutes.js, but we need to handle it here
  let effectiveMilestoneIndex = currentMilestoneIndex;
  let effectiveMilestone = currentMilestone;
  
  if (isFollowUp && hasAssessmentResult) {
    const { understood, needsMoreClarification, isFirstIncorrect, isSecondIncorrect } = assessmentResult;
    if (understood && !needsMoreClarification && justMovedToNext) {
      scenarioType = 'correct_move_next';
    } else if (understood && needsMoreClarification) {
      scenarioType = 'correct_needs_more';
    } else if (!understood && isFirstIncorrect) {
      scenarioType = 'incorrect_first';
      // For incorrect_first: Stay on current milestone (re-teach)
      effectiveMilestoneIndex = currentMilestoneIndex;
      effectiveMilestone = currentMilestone;
    } else if (!understood && isSecondIncorrect) {
      scenarioType = 'incorrect_second';
      // For incorrect_second: Move to next milestone (already updated in chatRoutes.js)
      // The currentMilestoneIndex should already point to the next milestone
      // But we need to ensure we're teaching the next one
      effectiveMilestoneIndex = currentMilestoneIndex;
      effectiveMilestone = activeModule?.milestones?.[currentMilestoneIndex];
      // If for some reason the index wasn't updated, use next milestone
      if (!effectiveMilestone && nextMilestoneText !== 'N/A') {
        effectiveMilestoneIndex = currentMilestoneIndex + 1;
        effectiveMilestone = activeModule?.milestones?.[effectiveMilestoneIndex];
      }
    } else {
      scenarioType = 'follow_up';
    }
  } else if (isFollowUp) {
    scenarioType = 'follow_up';
  }
  
  // Use effective milestone for teaching
  const milestoneToTeach = effectiveMilestone || currentMilestone;
  const milestoneTextToTeach = milestoneToTeach?.text || currentMilestone?.text || 'the current topic';
  
  // Debug logging
  console.log('Teacher Prompt - Unified System:', {
    scenarioType,
    currentMilestoneIndex,
    currentMilestoneText: currentMilestone?.text,
    isFirstMilestone,
    isFollowUp,
    justMovedToNext,
    hasAssessmentResult
  });
  
  // Build unified context
  const moduleContext = activeModule ? `
Current Module: ${activeModule.title}
Module Number: ${plan.findIndex(m => m.id === activeModuleId) + 1} of ${plan.length}
Difficulty: ${activeModule.difficulty || 'core'}

⚠️⚠️⚠️ CRITICAL MILESTONE CONTEXT:
ALL Milestones in this module:
${allMilestonesInModule}

CURRENT Milestone (${effectiveMilestoneIndex + 1} of ${totalMilestones}): "${milestoneTextToTeach}"
PREVIOUS Milestone: "${previousMilestoneText}" ${previousMilestoneText !== 'N/A' ? '(COMPLETED - do NOT teach or ask about it)' : '(this is the first milestone)'}
NEXT Milestone: "${nextMilestoneText}" ${nextMilestoneText !== 'N/A' ? '(do NOT teach this yet - it comes AFTER the current milestone)' : '(this is the last milestone)'}

⚠️⚠️⚠️ ABSOLUTE RULE: Teach ONLY the CURRENT milestone topic "${milestoneTextToTeach}". 
- Do NOT teach topics from PREVIOUS milestones (they're done)
- Do NOT teach topics from NEXT milestones (they come later)
- Do NOT teach topics from other modules
` : '';
  
  const profileContext = `
Student Profile:
- Background: ${profile.background || 'Not specified'}
- Skill Level: ${profile.skillLevel || 'Not specified'}
- Goals: ${profile.goals?.join(', ') || 'Not specified'}
- Preferred Style: ${profile.preferredStyle || 'Not specified'}
- Time Available: ${profile.timePerDayMins || 'Not specified'} minutes/day

Use this to tailor your teaching style and examples.
`;
  
  // UNIFIED TEACHING STRUCTURE - Same for ALL scenarios
  const unifiedTeachingStructure = `
UNIFIED TEACHING STRUCTURE (MANDATORY FOR ALL SCENARIOS):

⚠️⚠️⚠️ CRITICAL: ALL teaching responses MUST follow this EXACT structure, regardless of scenario.

RESPONSE STRUCTURE (3 STEPS):

STEP 1: CONTEXT (REQUIRED - 1-3 sentences):
${scenarioType === 'first_teaching' ? `
   - Begin with EXACT wording: "Thank you for approving the study plan."
   - Immediately follow with: "Let's begin our learning journey for ${topicName}."
   - Introduce the module and milestone: "We'll start with ${activeModule?.title || 'the first module'}, focusing on ${milestoneTextToTeach}."
   - Provide one extra sentence that explains why this milestone matters in the larger topic.
` : scenarioType === 'correct_move_next' ? `
   ⚠️⚠️⚠️ ABSOLUTE TRANSITION REQUIREMENTS - FOLLOW EXACTLY:
   - Acknowledge ONCE: "That's correct!" or "Excellent!" or "Great job!" (1 sentence only)
   - State completion ONCE: "You've completed: ${previousMilestoneText}" (1 sentence only)
   - ⚠️⚠️⚠️ CRITICAL: After stating completion, IMMEDIATELY say: "Now let's move on to: ${milestoneTextToTeach}"
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT say "Now, let's explore more about ${previousMilestoneText}" - that's WRONG
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT say "Let's continue with ${previousMilestoneText}" - that's WRONG
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT mention "${previousMilestoneText}" in any teaching content - it's DONE
   - ⚠️⚠️⚠️ CRITICAL: The previous milestone "${previousMilestoneText}" is COMPLETED - NEVER mention it again after the acknowledgment
   - ⚠️⚠️⚠️ CRITICAL: You MUST transition to "${milestoneTextToTeach}" and teach ONLY that
   - ⚠️⚠️⚠️ EXAMPLE OF CORRECT TRANSITION: "That's correct! You've completed: ${previousMilestoneText}. Now let's move on to: ${milestoneTextToTeach}"
   - ⚠️⚠️⚠️ EXAMPLE OF WRONG TRANSITION: "That's correct! Now, let's explore more about ${previousMilestoneText}" ← THIS IS WRONG, DO NOT DO THIS
` : scenarioType === 'correct_needs_more' ? `
   - Acknowledge: "That's correct! However, let me provide a bit more detail to deepen your understanding."
` : scenarioType === 'incorrect_first' ? `
   ⚠️⚠️⚠️ INCORRECT FIRST ATTEMPT - RE-TEACH SAME MILESTONE:
   - Provide feedback: "Not quite." or "Let me help clarify. The correct answer is [answer]."
   - ⚠️⚠️⚠️ CRITICAL: You MUST re-teach the SAME milestone "${milestoneTextToTeach}" again
   - ⚠️⚠️⚠️ CRITICAL: Use a DIFFERENT teaching approach than before (different examples, different explanation style, different angle)
   - ⚠️⚠️⚠️ CRITICAL: This is a RE-TEACH of "${milestoneTextToTeach}" - do NOT move to next milestone yet
   - Transition: "Let me explain this concept again in a different way."
` : scenarioType === 'incorrect_second' ? `
   ⚠️⚠️⚠️ INCORRECT SECOND ATTEMPT - MOVE TO NEXT MILESTONE:
   - Provide feedback: "The correct answer is [answer]. Here's why: [brief explanation]."
   - Be encouraging: "Don't worry, we'll continue practicing."
   - ⚠️⚠️⚠️ CRITICAL: You are NOW starting a COMPLETELY NEW milestone: "${milestoneTextToTeach}"
   - ⚠️⚠️⚠️ CRITICAL: You MUST teach the NEXT milestone "${milestoneTextToTeach}" in this same response
   - Transition: "Let's continue with the next topic: ${milestoneTextToTeach}"
` : `
   - Respond naturally to the student's message
   - Acknowledge their response
`}

STEP 2: TEACHING CONTENT (REQUIRED - 150-200 words, SAME FOR ALL):
   ${scenarioType === 'incorrect_first' ? `
   - ⚠️⚠️⚠️ CRITICAL: You MUST provide 150-200 words of teaching content about "${milestoneTextToTeach}" (THE SAME MILESTONE) again
   - ⚠️⚠️⚠️ CRITICAL: Use a DIFFERENT teaching approach than the previous attempt - different examples, different explanation style, different angle
   - ⚠️⚠️⚠️ CRITICAL: This is a RE-TEACH of the SAME milestone - do NOT move to next milestone
   - ⚠️⚠️⚠️ EXAMPLE: If previous teaching used code examples, try using analogies or diagrams. If previous used step-by-step, try a different structure.
   ` : scenarioType === 'incorrect_second' ? `
   - ⚠️⚠️⚠️ CRITICAL: You MUST provide 150-200 words of teaching content about "${milestoneTextToTeach}" (THE NEXT MILESTONE)
   - ⚠️⚠️⚠️ CRITICAL: You are now teaching a COMPLETELY NEW milestone - do NOT re-teach the previous one
   - ⚠️⚠️⚠️ CRITICAL: The previous milestone is done - teach ONLY the next milestone "${milestoneTextToTeach}"
   ` : ''}
   - ⚠️⚠️⚠️ CRITICAL: You MUST provide 150-200 words of teaching content about "${milestoneTextToTeach}" ONLY
   ${scenarioType === 'correct_move_next' ? `
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: The user's message was about "${previousMilestoneText}". IGNORE it completely.
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT say "Now, let's explore more about ${previousMilestoneText}" or "Let's continue with ${previousMilestoneText}" - this is WRONG
   - ⚠️⚠️⚠️ CRITICAL: You are starting a COMPLETELY NEW milestone "${milestoneTextToTeach}". This is NOT about "${previousMilestoneText}".
   - ⚠️⚠️⚠️ CRITICAL: The previous milestone "${previousMilestoneText}" is COMPLETED. Do NOT teach or mention ANYTHING from it.
   - ⚠️⚠️⚠️ CRITICAL: You MUST teach ONLY "${milestoneTextToTeach}" as if this is a BRAND NEW conversation.
   - ⚠️⚠️⚠️ EXAMPLE: If "${previousMilestoneText}" was "Learn basic syntax and data types" and "${milestoneTextToTeach}" is "Understand variables and operators", you MUST teach variables and operators, NOT data types
   - ⚠️⚠️⚠️ THINK: "I just completed teaching ${previousMilestoneText}. Now I'm starting a NEW lesson about ${milestoneTextToTeach}. I will NOT mention ${previousMilestoneText} again."
   ` : ''}
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT teach topics from OTHER milestones
   - ⚠️⚠️⚠️ CRITICAL: Check the milestone list above - if a topic belongs to a different milestone, DO NOT teach it
   - ⚠️⚠️⚠️ EXAMPLE: If milestone is "Understand variables and data types" → teach ONLY variables (var, let) and data types (Int, Double, Float, Bool, String, Character). Do NOT teach operators (+, -, *, /) - that's for the NEXT milestone
   - Include explanations, examples, code snippets, and key concepts about "${milestoneTextToTeach}" ONLY
   - Use SAME depth and detail as all other milestones
   - ⚠️⚠️⚠️ CRITICAL: You MUST actually teach the topic NOW. Do NOT say "let's explore" or "we'll cover" and then stop - you must actually teach it.
   - ⚠️⚠️⚠️ CRITICAL: This is milestone ${currentMilestoneIndex + 1} of ${totalMilestones}. Do NOT skip to future milestones.

STEP 3: ASSESSMENT QUESTION (REQUIRED - ONE question ending with ?, SAME FOR ALL):
   ${scenarioType === 'incorrect_first' ? `
   - ⚠️⚠️⚠️ CRITICAL: End with EXACTLY ONE assessment question about "${milestoneTextToTeach}" (THE SAME MILESTONE)
   - ⚠️⚠️⚠️ CRITICAL: Ask a DIFFERENT question than the previous one - test understanding from a different angle
   - ⚠️⚠️⚠️ CRITICAL: This question should be about the SAME milestone you just re-taught
   ` : scenarioType === 'incorrect_second' ? `
   - ⚠️⚠️⚠️ CRITICAL: End with EXACTLY ONE assessment question about "${milestoneTextToTeach}" (THE NEXT MILESTONE)
   - ⚠️⚠️⚠️ CRITICAL: Ask a question about the NEW milestone you just taught, NOT the previous one
   ` : ''}
   - ⚠️⚠️⚠️ CRITICAL: End with EXACTLY ONE assessment question about "${milestoneTextToTeach}" ONLY
   - ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT ask questions about topics from OTHER milestones
   - Test understanding of what you just taught about "${milestoneTextToTeach}"
   - Must end with a question mark (?)
   - ⚠️⚠️⚠️ CRITICAL: You MUST ask ONLY ONE question. Do NOT ask multiple questions, do NOT ask follow-up questions, do NOT ask "also" questions.

⚠️⚠️⚠️ VALIDATION CHECKLIST (VERIFY ALL):
✓ Do I have the context step (1-3 sentences)?
✓ Do I have 150-200 words of teaching content about "${milestoneTextToTeach}" ONLY?
✓ Do I end with EXACTLY ONE assessment question about "${milestoneTextToTeach}" ONLY?
✓ Did I avoid teaching topics from other milestones?
✓ Did I avoid asking questions about other milestones?

If ANY check fails, rewrite your response.

⚠️⚠️⚠️ ABSOLUTE PROHIBITIONS (DO NOT DO THESE - EVER):
- ❌ Do NOT teach multiple milestones in one response
- ❌ Do NOT skip ahead to future milestones
- ❌ Do NOT teach topics from previous milestones
- ❌ Do NOT ask multiple questions - ONE question only
- ❌ Do NOT ask questions about topics from other milestones
- ❌ Do NOT say "let's explore" and then stop - actually teach the topic
- ❌ Do NOT use different word count - always 150-200 words
`;

  // Scenario-specific instructions
  let scenarioInstructions = '';
  if (scenarioType === 'first_teaching') {
    scenarioInstructions = `
⚠️⚠️⚠️ FIRST TEACHING RESPONSE REQUIREMENTS:
- Follow the unified structure strictly: Context → Teaching (150-200 words) → ONE assessment question.
- Context must contain the exact gratitude sentence and clearly state the module and milestone (see Step 1 instructions).
- Teaching content MUST stay laser-focused on "${milestoneTextToTeach}" and cover 150-200 words with examples, explanations, and practical guidance.
- End with EXACTLY one multiple-choice or open question that checks understanding of "${milestoneTextToTeach}".
- Do NOT ask for plan approval or prompt the student to type anything beyond answering the assessment question.
- Keep tone warm, encouraging, and aligned with the student's profile (${profile.skillLevel || 'skill level'}, ${profile.preferredStyle || 'learning style'}).`;
  } else if (scenarioType === 'correct_move_next') {
    scenarioInstructions = `
⚠️⚠️⚠️ CRITICAL TRANSITION INSTRUCTIONS FOR THIS SCENARIO:
- ⚠️⚠️⚠️ YOU ARE STARTING A COMPLETELY NEW MILESTONE - TREAT IT AS A FRESH START
- ⚠️⚠️⚠️ The user's message "${userMessage}" was answering a question about "${previousMilestoneText}" (the PREVIOUS milestone)
- ⚠️⚠️⚠️ IGNORE the user's message completely. Do NOT reference it. Do NOT continue discussing "${previousMilestoneText}"
- ⚠️⚠️⚠️ The PREVIOUS milestone "${previousMilestoneText}" is COMPLETED and DONE - do NOT teach, mention, or ask about it
- ⚠️⚠️⚠️ You just moved to the NEXT milestone: "${milestoneTextToTeach}"
- ⚠️⚠️⚠️ You MUST teach the NEW milestone "${milestoneTextToTeach}" as if starting fresh - this is NOT a continuation
- ⚠️⚠️⚠️ Think of this as a NEW conversation starting about "${milestoneTextToTeach}" - ignore everything from "${previousMilestoneText}"
- ⚠️⚠️⚠️ After acknowledging the correct answer, IMMEDIATELY switch to teaching "${milestoneTextToTeach}" and nothing else
- ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT say "Now, let's explore more about ${previousMilestoneText}" - that's WRONG
- ⚠️⚠️⚠️ ABSOLUTE PROHIBITION: Do NOT say "Let's continue with ${previousMilestoneText}" - that's WRONG
- ⚠️⚠️⚠️ YOU MUST say: "Now let's move on to: ${milestoneTextToTeach}" and then teach ONLY "${milestoneTextToTeach}"
`;
  } else if (scenarioType === 'incorrect_first') {
    scenarioInstructions = `
⚠️⚠️⚠️ CRITICAL INSTRUCTIONS FOR INCORRECT FIRST ATTEMPT:
- Student answered incorrectly on first attempt
- ⚠️⚠️⚠️ YOU MUST RE-TEACH THE SAME MILESTONE "${milestoneTextToTeach}" in this SAME response
- ⚠️⚠️⚠️ Use a DIFFERENT teaching approach (different examples, different style, different angle)
- ⚠️⚠️⚠️ After re-teaching, ask a DIFFERENT assessment question about the SAME milestone
- ⚠️⚠️⚠️ Do NOT move to next milestone yet - this is a re-teach of the current one
- Follow the SAME structure: Feedback → Re-teaching (150-200 words, different approach) → ONE different assessment question
- ⚠️⚠️⚠️ ALL IN ONE MESSAGE: Feedback + Re-teaching + New Question
`;
  } else if (scenarioType === 'incorrect_second') {
    scenarioInstructions = `
⚠️⚠️⚠️ CRITICAL INSTRUCTIONS FOR INCORRECT SECOND ATTEMPT:
- Student answered incorrectly twice - we're moving forward anyway
- ⚠️⚠️⚠️ YOU MUST TEACH THE NEXT MILESTONE "${milestoneTextToTeach}" in this SAME response
- ⚠️⚠️⚠️ Provide brief feedback about the previous answer, then IMMEDIATELY teach the next milestone
- ⚠️⚠️⚠️ After teaching next milestone, ask an assessment question about the NEW milestone
- Follow the SAME structure: Brief Feedback → Teaching Next Milestone (150-200 words) → ONE assessment question about new milestone
- ⚠️⚠️⚠️ ALL IN ONE MESSAGE: Feedback + Next Milestone Teaching + New Question
`;
  }
  
  // Determine tutor role
  const tutorRole = topicName.toLowerCase().includes('programming') || 
                     topicName.toLowerCase().includes('code') ||
                     topicName.toLowerCase().includes('software') ||
                     topicName.toLowerCase().includes('computer science')
                     ? 'programming tutor'
                     : topicName.toLowerCase().includes('math') || topicName.toLowerCase().includes('mathematics')
                     ? 'mathematics tutor'
                     : topicName.toLowerCase().includes('music') || topicName.toLowerCase().includes('piano') || topicName.toLowerCase().includes('guitar')
                     ? 'music tutor'
                     : topicName.toLowerCase().includes('language') || topicName.toLowerCase().includes('english') || topicName.toLowerCase().includes('spanish')
                     ? 'language tutor'
                     : 'expert tutor';
  
  // Build the main prompt with scenario-specific overrides
  let mainPrompt = `You are an ${tutorRole} teaching ${topicName}.

${profileContext}

${moduleContext}`;

  // CRITICAL: For transition scenarios, completely override the user message context
  if (scenarioType === 'correct_move_next') {
    mainPrompt += `
⚠️⚠️⚠️ CRITICAL: YOU ARE TRANSITIONING TO A NEW MILESTONE - IGNORE ALL PREVIOUS CONTEXT:

- The student's message "${userMessage}" was about "${previousMilestoneText}" (the PREVIOUS milestone)
- ⚠️⚠️⚠️ THIS MESSAGE IS NOW IRRELEVANT - IGNORE IT COMPLETELY
- ⚠️⚠️⚠️ The previous milestone "${previousMilestoneText}" is COMPLETED and DONE
- ⚠️⚠️⚠️ You are NOW starting a COMPLETELY NEW milestone: "${milestoneTextToTeach}"
- ⚠️⚠️⚠️ DO NOT reference the student's message. DO NOT continue discussing "${previousMilestoneText}"
- ⚠️⚠️⚠️ Treat this as a BRAND NEW conversation starting NOW about "${milestoneTextToTeach}"

STUDENT'S MESSAGE (IGNORE THIS - IT'S ABOUT THE PREVIOUS MILESTONE):
"${userMessage}"

⚠️⚠️⚠️ DO NOT USE THIS MESSAGE - IT'S ABOUT "${previousMilestoneText}" WHICH IS COMPLETED
⚠️⚠️⚠️ START FRESH TEACHING "${milestoneTextToTeach}" AS IF THIS IS THE FIRST MESSAGE
`;
  } else {
    mainPrompt += `
Student's message: "${userMessage}"`;
  }

  mainPrompt += `

${unifiedTeachingStructure}

${scenarioInstructions}

Teaching Guidelines:
1. Be encouraging and supportive - match the student's learning style
2. Use examples-first approach when relevant
3. Adjust complexity based on skill level: ${profile.skillLevel === 'Beginner' ? 'Use simple explanations, avoid jargon' : profile.skillLevel === 'Advanced' ? 'Can assume more background knowledge' : 'Provide clear explanations'}
4. Tailor examples to student's background
5. Keep responses focused and concise
6. Always follow the 3-step structure: Context → Teaching (150-200 words) → ONE assessment question

${scenarioType === 'correct_move_next' ? `
⚠️⚠️⚠️ FINAL CRITICAL REMINDER FOR THIS TRANSITION:
- The user's message "${userMessage}" was about "${previousMilestoneText}" - IGNORE it completely
- You are starting FRESH with "${milestoneTextToTeach}"
- After acknowledging the correct answer, IMMEDIATELY teach ONLY "${milestoneTextToTeach}"
- Do NOT continue discussing "${previousMilestoneText}" - it's DONE
- Do NOT say "Now, let's explore more about ${previousMilestoneText}" - that's WRONG
- Do NOT say "Let's continue with ${previousMilestoneText}" - that's WRONG
- You MUST say "Now let's move on to: ${milestoneTextToTeach}" and teach ONLY that
- Think of this as a NEW conversation starting NOW about "${milestoneTextToTeach}"

⚠️⚠️⚠️ CORRECT RESPONSE STRUCTURE:
1. "That's correct! You've completed: ${previousMilestoneText}."
2. "Now let's move on to: ${milestoneTextToTeach}"
3. [IMMEDIATELY teach 150-200 words about "${milestoneTextToTeach}" ONLY]
4. [ONE assessment question about "${milestoneTextToTeach}" ONLY]

⚠️⚠️⚠️ WRONG RESPONSE (DO NOT DO THIS):
1. "That's correct! Now, let's explore more about ${previousMilestoneText}" ← WRONG
2. "Let's continue with ${previousMilestoneText}" ← WRONG
3. Teaching about ${previousMilestoneText} ← WRONG

YOU MUST transition to "${milestoneTextToTeach}" and teach ONLY that.
` : ''}

Remember: You are teaching milestone-by-milestone. Each milestone is taught separately with the SAME structure.`;
  
  return mainPrompt.trim();
};

module.exports = { buildTeacherPrompt };

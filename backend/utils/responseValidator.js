// Response Structure Validator
// Validates LLM responses against expected structure requirements

/**
 * Validates response structure for Scenario A: Correct + Milestone Achieved
 * @param {string} response - The LLM response
 * @param {string} currentMilestone - Current milestone text
 * @param {string} nextMilestone - Next milestone text
 * @returns {Object} Validation result with isValid and missingParts
 */
function validateScenarioA(response, currentMilestone, nextMilestone) {
  const missingParts = [];
  let isValid = true;
  
  // Check for acknowledgment
  const hasAcknowledgment = /(?:correct|excellent|great|well done|good job|that'?s right|perfect|you'?ve got it|great job|good|well|excellent)/i.test(response);
  if (!hasAcknowledgment) {
    missingParts.push('acknowledgment');
    isValid = false;
  }
  
  // Check for milestone completion mention
  const mentionsCompletion = /(?:completed|finished|done with|you'?ve completed|milestone.*complete)/i.test(response);
  if (!mentionsCompletion) {
    missingParts.push('milestone completion');
    isValid = false;
  }
  
  // Check for transition to next milestone
  const mentionsNext = /(?:next|move on|let'?s continue|now let'?s|continue with|move on to|next topic|next milestone)/i.test(response);
  if (!mentionsNext) {
    missingParts.push('next milestone transition');
    isValid = false;
  }
  
  // Check for substantial teaching content (at least 150 words)
  const wordCount = response.split(/\s+/).length;
  const hasTeachingContent = wordCount >= 100; // Slightly relaxed for validation
  if (!hasTeachingContent) {
    missingParts.push('teaching content');
    isValid = false;
  }
  
  // Check for assessment question
  const hasQuestion = /\?/.test(response);
  if (!hasQuestion) {
    missingParts.push('assessment question');
    isValid = false;
  }
  
  return { isValid, missingParts, wordCount, hasAcknowledgment, mentionsCompletion, mentionsNext, hasQuestion };
}

/**
 * Validates response structure for Scenario C: Incorrect (first time)
 * @param {string} response - The LLM response
 * @param {string} currentMilestone - Current milestone text
 * @returns {Object} Validation result
 */
function validateScenarioC(response, currentMilestone) {
  const missingParts = [];
  let isValid = true;
  
  // Check for correction
  const correctsAnswer = /(?:not quite|incorrect|not exactly|let me help|correct answer is|the right answer|actually)/i.test(response);
  if (!correctsAnswer) {
    missingParts.push('correction');
    isValid = false;
  }
  
  // Check for re-explanation (substantial content)
  const wordCount = response.split(/\s+/).length;
  const hasReExplanation = wordCount >= 100;
  if (!hasReExplanation) {
    missingParts.push('re-explanation');
    isValid = false;
  }
  
  // Check for assessment question
  const hasQuestion = /\?/.test(response);
  if (!hasQuestion) {
    missingParts.push('assessment question');
    isValid = false;
  }
  
  return { isValid, missingParts, wordCount, correctsAnswer, hasReExplanation, hasQuestion };
}

/**
 * Validates response structure for Scenario B: Correct + Needs More
 * @param {string} response - The LLM response
 * @returns {Object} Validation result
 */
function validateScenarioB(response) {
  const missingParts = [];
  let isValid = true;
  
  // Check for acknowledgment
  const hasAcknowledgment = /(?:correct|excellent|great|however|but|let me provide|more detail)/i.test(response);
  if (!hasAcknowledgment) {
    missingParts.push('acknowledgment');
    isValid = false;
  }
  
  // Check for additional explanation
  const wordCount = response.split(/\s+/).length;
  const hasAdditionalExplanation = wordCount >= 80;
  if (!hasAdditionalExplanation) {
    missingParts.push('additional explanation');
    isValid = false;
  }
  
  // Check for assessment question
  const hasQuestion = /\?/.test(response);
  if (!hasQuestion) {
    missingParts.push('assessment question');
    isValid = false;
  }
  
  return { isValid, missingParts, wordCount, hasAcknowledgment, hasAdditionalExplanation, hasQuestion };
}

/**
 * Validates response structure for Scenario D: Incorrect (second time)
 * @param {string} response - The LLM response
 * @param {string} nextMilestone - Next milestone text
 * @returns {Object} Validation result
 */
function validateScenarioD(response, nextMilestone) {
  const missingParts = [];
  let isValid = true;
  
  // Check for brief explanation
  const hasExplanation = /(?:correct answer|here'?s why|the answer is)/i.test(response);
  if (!hasExplanation) {
    missingParts.push('explanation');
    isValid = false;
  }
  
  // Check for transition to next milestone
  const mentionsNext = /(?:next|move on|continue with|next topic|next milestone)/i.test(response);
  if (!mentionsNext) {
    missingParts.push('next milestone transition');
    isValid = false;
  }
  
  // Check for new teaching content
  const wordCount = response.split(/\s+/).length;
  const hasNewTeaching = wordCount >= 100;
  if (!hasNewTeaching) {
    missingParts.push('new teaching content');
    isValid = false;
  }
  
  // Check for assessment question
  const hasQuestion = /\?/.test(response);
  if (!hasQuestion) {
    missingParts.push('assessment question');
    isValid = false;
  }
  
  return { isValid, missingParts, wordCount, hasExplanation, mentionsNext, hasNewTeaching, hasQuestion };
}

/**
 * Validates response structure for the first teaching message after plan approval
 * @param {string} response - The LLM response
 * @param {string} milestoneText - The milestone being introduced
 * @returns {Object} Validation result
 */
function validateFirstTeaching(response, milestoneText = '') {
  const missingParts = [];
  let isValid = true;

  const hasStep1 = /\*\*Step\s*1/i.test(response);
  if (!hasStep1) {
    missingParts.push('step1_heading');
    isValid = false;
  }

  const hasThankYou = /thank you for approving the study plan/i.test(response);
  if (!hasThankYou) {
    missingParts.push('thank_you');
    isValid = false;
  }

  const normalizedMilestone = (milestoneText || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedMilestone && !response.toLowerCase().includes(normalizedMilestone)) {
    missingParts.push('milestone_reference');
    isValid = false;
  }

  const step2Match = response.match(/\*\*Step\s*2[\s\S]*?(?=\*\*Step\s*3|\Z)/i);
  let step2WordCount = 0;
  if (!step2Match) {
    missingParts.push('step2_section');
    isValid = false;
  } else {
    const step2Text = step2Match[0].replace(/\*\*Step\s*2[^\n]*\n?/i, '').trim();
    step2WordCount = step2Text.split(/\s+/).filter(Boolean).length;
    if (step2WordCount < 140 || step2WordCount > 220) {
      missingParts.push('step2_word_count');
      isValid = false;
    }
  }

  const step3Match = response.match(/\*\*Step\s*3[\s\S]*$/i);
  if (!step3Match) {
    missingParts.push('step3_section');
    isValid = false;
  } else {
    const hasQuestion = /\?/.test(step3Match[0]);
    if (!hasQuestion) {
      missingParts.push('assessment_question');
      isValid = false;
    }
  }

  return {
    isValid,
    missingParts,
    step2WordCount,
    hasStep1,
    hasThankYou,
    hasStep3: !!step3Match
  };
}

module.exports = {
  validateScenarioA,
  validateScenarioB,
  validateScenarioC,
  validateScenarioD,
  validateFirstTeaching
};





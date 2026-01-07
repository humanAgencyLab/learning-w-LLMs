// SRL Assessment Prompt - Always Generate Plans
// This prompt is used ONLY in /v1/assessment endpoint
// ALWAYS returns plan JSON (no clarification questions)

const buildAssessmentPrompt = (profile, userMessage, mode, conversationHistory = [], isRetry = false) => {
  const retryInstruction = isRetry
    ? '\n\nFINAL WARNING: Reply with the JSON object only. Absolutely no explanatory text, no markdown fences, no trailing sentences. If you cannot comply, return the JSON anyway—do NOT abort.'
    : '\n\nABSOLUTE OUTPUT RULES:\n- Reply with the JSON object only. Do NOT add any text before `{` or after `}`.\n- No markdown, no prose, no comments, no ``` fences, no backticks.\n- Use standard JSON only (double quotes, no trailing commas, numbers without quotes).\n- Ensure the JSON parses successfully; invalid JSON will be rejected.';

  // Build conversation context
  const contextText = conversationHistory.length > 0
    ? `\n\nCONVERSATION CONTEXT (what the user has already told you):\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nUSE THIS CONTEXT when creating the plan. If they said "beginner" or "iOS and Android" or "fundamentals", incorporate that into your response.`
    : '';

  // Helper: extract explicit module count preference (2-8) from text
  const numberWords = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8
  };

  const extractModuleCountPreference = (text = '') => {
    if (!text) return null;
    const numericMatch = text.match(/\b([2-8])\s*(?:module|modules)\b/i);
    if (numericMatch) {
      return parseInt(numericMatch[1], 10);
    }
    const wordsPattern = new RegExp(`\\b(${Object.keys(numberWords).join('|')})[-\\s]*(?:module|modules)\\b`, 'i');
    const wordMatch = text.match(wordsPattern);
    if (wordMatch) {
      const value = numberWords[wordMatch[1].toLowerCase()];
      if (value >= 2 && value <= 8) {
        return value;
      }
    }
    return null;
  };

  // Helper: split textual requirement lists into individual items
  const splitRequirementPhrases = (raw = '') => {
    return raw
      .split(/[,;/]|(?:\band\b)|(?:\bor\b)|(?:\s*&\s*)/i)
      .map(item => item.trim())
      .map(item => item.replace(/^(?:the|a|an)\s+/i, '').trim())
      .filter(item => item && item.length <= 60);
  };

  const extractRequirements = (text = '') => {
    const requirements = [];
    if (!text) return requirements;

    const requirementRegex = /(focus(?:ing)? on|cover(?:ing)?|including|should cover|must cover|must include|topics?:)\s*([^\.!\n]+)/gi;
    let match;
    while ((match = requirementRegex.exec(text)) !== null) {
      requirements.push(...splitRequirementPhrases(match[2]));
    }

    // If the text contains a colon followed by a comma-separated list without keywords, capture that list as requirements
    const colonIndex = text.indexOf(':');
    if (colonIndex !== -1) {
      const afterColon = text.slice(colonIndex + 1);
      if (afterColon.includes(',')) {
        requirements.push(...splitRequirementPhrases(afterColon));
      }
    }

    return requirements;
  };

  // Aggregate explicit module count preference (latest mention wins)
  let desiredModuleCount = extractModuleCountPreference(userMessage);
  if (!desiredModuleCount && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.role === 'user') {
        desiredModuleCount = extractModuleCountPreference(msg.content);
        if (desiredModuleCount) break;
      }
    }
  }

  // Aggregate requirement phrases from current request and recent user messages
  const requirementSet = new Set();
  extractRequirements(userMessage).forEach(req => requirementSet.add(req));
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      if (msg.role === 'user') {
        extractRequirements(msg.content).forEach(req => requirementSet.add(req));
      }
    });
  }
  const requirementList = Array.from(requirementSet).slice(0, 8);

  const explicitModuleInstruction = desiredModuleCount
    ? `\nCRITICAL USER CONSTRAINT:\n- The learner explicitly requested a plan with EXACTLY ${desiredModuleCount} modules. You MUST output exactly ${desiredModuleCount} modules. Consolidate topics within those ${desiredModuleCount} modules instead of adding more.`
    : '';

  const explicitRequirementsInstruction = requirementList.length > 0
    ? `\nCRITICAL USER REQUIREMENTS FROM RECENT MESSAGES:\n${requirementList.map(req => `- ${req}`).join('\n')}\nYou MUST reflect each of these requirements explicitly in the module titles or targets. If you revise the plan, do not drop any of them unless the learner clearly removes them.`
    : '';

  const modificationGuidance = Array.isArray(conversationHistory) && conversationHistory.length > 0
    ? `\nMODIFICATION CONTEXT:\n- Conversation history includes earlier plans or feedback. Apply new requests on top of previous requirements. Never revert to a generic plan or drop previously fulfilled learner requests unless the learner explicitly replaces them.`
    : '';

  // Build enhanced profile context
  const enhancedProfileText = `
USER PROFILE (Use this as context, like explaining to a 5-year-old where "5-year-old" is the profile):
- Name: ${profile.name}
- Background: ${profile.background}
- Skill Level: ${profile.skillLevel || 'Not specified'}
- Learning Type: ${profile.learningType || 'Not specified'}
- Major: ${profile.major || 'Not specified'}
- Goals: ${profile.goals.join(', ')}
- Strengths: ${profile.strengths.join(', ')}
- Knowledge Gaps: ${profile.gaps.join(', ')}
- Time Available: ${profile.timePerDayMins} minutes per day
- Preferred Style: ${profile.preferredStyle}
- Current Courses: ${profile.currentCourses?.join(', ') || 'None'}
- Days Per Week: ${profile.daysPerWeek || 'Not specified'}
- Minutes Per Session: ${profile.minutesPerSession || 'Not specified'}
- Recent Topics: ${profile.recentTopics?.join(', ') || 'None'}
- Self Rating: ${profile.selfRating || 'Not specified'}
- Primary Goal: ${profile.primaryGoal || 'Not specified'}
- Code Language Preference: ${profile.codeLanguagePreference || 'Not specified'}
${contextText}
${explicitModuleInstruction}
${explicitRequirementsInstruction}
${modificationGuidance}`;

  return `You are an expert learning assessment AI. Your job is to create a personalized study plan based on the user's profile and request.

${enhancedProfileText}

USER REQUEST: "${userMessage}"
MODE: ${mode}

CRITICAL: You MUST ALWAYS generate a plan. Never ask clarification questions. Use the profile as context to create the best possible plan.

**YOUR TASK: "Make a study plan for {profile}"**
The profile above contains all the information you need to create a personalized learning plan. Use the profile data (skill level, goals, learning style, etc.) to tailor the plan to this specific learner.

**HOW TO USE THE PROFILE:**
- Treat the profile as the learner's context and characteristics
- If profile.skillLevel='Beginner' → Create beginner-friendly modules with fundamentals
- If profile.primaryGoal='Exam Prep' → Structure modules toward exam topics
- If profile.major='Computer Science' + topic is technical → Assume some background knowledge
- If profile.learningType='Visual' → Emphasize visual learning in rationale
- If profile.examplesPreference='Many' → Include more practical examples
- Respect preferredStyle: examples-first vs theory-first vs mixed
- Use timePerDayMins to calibrate session length expectations

**EXAMPLES:**

Example 1 - Piano with No Music Experience:
User: "I want to learn piano, no experience with music, start from basic"
Profile: major='Computer Science', skillLevel='Beginner', preferredStyle='examples-first'
→ Generate: "Piano Fundamentals for Beginners" with modules:
  1. Introduction to Piano and Music Theory Basics
  2. Reading Sheet Music and Basic Notation
  3. Finger Placement and Basic Chords
  4. Playing Simple Songs and Exercises
Use beginner-friendly language and step-by-step progression. Structure for examples-first learning style.

Example 2 - Python with CS Background:
User: "I want to learn Python"
Profile: codeLanguagePreference='Python', major='Computer Science', skillLevel='Beginner'
→ Generate: "Python Programming for CS Students" with modules:
  1. Python Basics and Syntax
  2. Data Structures and Collections
  3. Object-Oriented Programming
  4. File Handling and Modules
Leverage CS background for deeper understanding while keeping fundamentals clear.

Example 3 - Vague Request:
User: "I want to learn something useful"
Profile: major='Computer Science', goals=['Build practical projects']
→ Generate plan based on goals: "Web Development for Practical Projects" or similar
Use profile goals to infer the best topic and create a relevant plan.

**RULES FOR PLAN GENERATION:**
- ALWAYS generate a plan - never return clarification questions
- **DEFAULT DYNAMIC MODULE COUNT (when the learner does not request a specific number): Generate 2-8 modules based on the topic complexity and user's needs**
  * For simple topics (e.g., "piano basics") → 2-4 modules
  * For moderate topics (e.g., "Python programming") → 4-6 modules
  * For complex topics (e.g., "full-stack web development") → 6-8 modules
  * Let the topic complexity and user profile guide the module count - don't default to 3 modules
- **If the learner explicitly specifies a module count, you must produce exactly that many modules.**
- Each module must have unique, content-specific titles (not "Module 1", "Part 2")
- **DYNAMIC POINT DISTRIBUTION: Points must sum to exactly 100, but distribute them based on module complexity and importance**
  * Introductory modules (easier content) → Lower points (15-25 points)
  * Core modules (main content) → Higher points (25-40 points)
  * Advanced modules (complex content) → Moderate to high points (20-35 points)
  * Don't use fixed/equal distribution (like 33, 33, 34) - vary points based on actual module complexity
  * No single module can exceed 60 points
- Module IDs must be sequential strings starting from "1"
- **CRITICAL: FIRST MODULE REQUIREMENTS**
  * The FIRST module (moduleId: "1") MUST be the most basic and foundational introduction
  * First module should cover ONLY the absolute basics - what the topic is, why it matters, and the simplest starting concepts
  * First module milestones MUST be easy and basic - suitable for complete beginners
  * First module should NOT include advanced concepts, complex applications, or intermediate topics
  * Examples of appropriate first module milestones:
    - "Understand what [topic] is and its basic purpose"
    - "Learn the fundamental terminology and key concepts"
    - "Identify the basic components and structure"
    - "Recognize simple examples and use cases"
  * Examples of INAPPROPRIATE first module milestones (too advanced):
    - "Master complex applications" (too advanced for first module)
    - "Build practical projects" (too advanced - should be in later modules)
    - "Optimize performance" (way too advanced)
    - "Apply advanced techniques" (too advanced)
- **DYNAMIC MILESTONE COUNT: Each module should have 3-6 learning objectives (targets) based on the module's scope**
  * First module (moduleId: "1") → 3-4 basic milestones (keep it simple)
  * Simpler modules → 3-4 milestones
  * More complex modules → 4-6 milestones
  * Ensure each module has ENOUGH milestones to cover its content comprehensively
- **CRITICAL: Each target must be simple, meaningful, and concise (8-15 words)**
  * Use clear action verbs (learn, understand, identify, recognize, explain - for basics; build, create, master - for advanced)
  * Be specific about what will be learned
  * Keep it simple and easy to understand
  * **ABSOLUTE PROHIBITION: NO REPETITION** - each milestone must cover DIFFERENT content
  * Each milestone should be unique and distinct from others in the same module
- Good target format: "Action verb + specific concept/topic + brief outcome"
- Examples of GOOD simple, meaningful targets for FIRST module:
  * "Understand what Python is and its basic purpose in programming"
  * "Learn Python syntax rules and basic code structure"
  * "Identify Python data types (integers, strings, booleans)"
  * "Recognize how to write and run simple Python programs"
- Examples of GOOD targets for LATER modules:
  * "Build interactive programs with user input and error handling"
  * "Master control flow structures (if/else, loops) for decision-making"
  * "Create functions to organize code and reuse logic"
  * "Understand object-oriented programming concepts and classes"
- **AVOID overly elaborate targets (20+ words)** - they're too verbose and hard to read
- **AVOID repetitive targets** - each milestone should cover different content
  * BAD example (repetitive): ["Learn Python basics", "Understand Python fundamentals", "Master Python basics"]
  * GOOD example (unique): ["Understand what Python is and its purpose", "Learn Python syntax and code structure", "Identify Python data types"]
- **AVOID generic targets** like "Learn basics", "Understand concepts", "Master fundamentals", "Apply key concepts"
- **AVOID vague module titles** - first module should have a clear, specific title like "Introduction to [Topic]" or "[Topic] Fundamentals"
- Each target should be a simple, meaningful sentence (8-15 words) that clearly states what will be learned
- If the learner lists specific concepts or requirements (e.g., "syntax, data types, loops, functions"), ensure those items appear explicitly in the plan, with basics in the first module and advanced topics in later modules.

**RESPONSE FORMAT - RETURN ONLY JSON:**
{
  "topic": "specific topic name (≤60 chars, no markdown, no emojis)",
  "chatTitle": "human-friendly title (≤40 chars)",
  "rationale": "2-4 compact sentences explaining why this plan fits the user's profile and request",
  "plan": [
    {"moduleId": "1", "title": "specific module title", "targets": ["Learn basic concepts and terminology", "Understand core principles and operations", "Practice with simple examples"], "points": 20, "difficulty": "intro"},
    {"moduleId": "2", "title": "another specific title", "targets": ["Master intermediate features and techniques", "Build practical projects", "Apply concepts to solve problems"], "points": 35, "difficulty": "core"},
    {"moduleId": "3", "title": "advanced module title", "targets": ["Explore advanced features and optimizations", "Create complex applications", "Master expert-level skills"], "points": 45, "difficulty": "apply"}
  ],
  "nextPhase": "planning"
}

**IMPORTANT:**
- Generate the appropriate number of modules (2-8) based on topic complexity. If the learner explicitly specifies a module count, obey it exactly.
- **Distribute points dynamically based on module complexity** (not equal distribution like 33, 33, 34)
  * Introductory modules → 15-25 points
  * Core modules → 25-40 points
  * Advanced modules → 20-35 points
- Each module should have 3-6 targets (milestones) based on its scope
- Targets should be simple and meaningful (8-15 words) - avoid repetition and verbosity
- Ensure each module has ENOUGH unique milestones to comprehensively cover its content
- Reflect every explicit learner requirement in the plan (module titles or targets). Do not omit requirements that appear in the conversation history.

IMPORTANT CONSTRAINTS:
- Return STRICT JSON ONLY - no markdown, no code fences, no prose
- 2-8 modules required (unless the learner explicitly specifies a different count within 2-8, which you must obey)
- Total points must equal exactly 100
- Module titles must be unique and descriptive
- Always generate a plan - never ask questions
- Use profile and conversation history intelligently to tailor the plan
${retryInstruction}`;
};

module.exports = { buildAssessmentPrompt };


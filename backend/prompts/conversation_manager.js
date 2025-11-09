// Conversation Manager - LLM decides ALL actions based on summarized context
// Uses Cursor IDE-style context summarization instead of full history

const { getContextSummaryText } = require('./context_summarizer');

const buildConversationDecisionPrompt = (session, userMessage) => {
  const { topic, activeModuleId, plan, profile, phase, meta, messages, planApproved } = session;
  
  // CRITICAL: If activeModuleId is not set but plan exists, use the first module
  // This ensures we can identify the first milestone after plan approval
  let effectiveActiveModuleId = activeModuleId;
  if (!effectiveActiveModuleId && plan && plan.length > 0) {
    effectiveActiveModuleId = plan[0].id;
  }
  
  const activeModule = plan?.find(m => m.id === effectiveActiveModuleId) || plan?.[0];
  
  // Get structured context summary (instead of full history)
  const contextSummary = getContextSummaryText(session);
  
  // Only use last 3 messages for immediate context (much more token-efficient)
  const recentMessages = messages.slice(-3);
  const messageHistory = recentMessages.length > 0
    ? recentMessages.map(msg => `${msg.role}: ${msg.content.substring(0, 300)}`).join('\n')
    : 'No previous messages';
  
  // Check if we just entered learning phase after plan approval
  // Also check if user is explicitly asking to start (e.g., "let's start", "start with", etc.)
  const userWantsToStart = /let'?s\s+start|start\s+with|begin|ready\s+to\s+start|let'?s\s+begin/i.test(userMessage);
  const justApprovedPlan = (planApproved && phase === 'learning' && !meta?.milestoneBeingTaught) || 
                            (planApproved && phase === 'learning' && userWantsToStart && !meta?.milestoneBeingTaught);
  
  // Build outstanding question context
  const outstandingCheck = meta?.outstandingCheck;
  const outstandingQuestionContext = outstandingCheck ? `
⚠️⚠️⚠️ OUTSTANDING QUESTION (CRITICAL):
The AI previously asked: "${outstandingCheck}"
The user's current message ("${userMessage}") is VERY LIKELY a response to this question.

FOLLOW-UP DETECTION RULES (MUST FOLLOW):
- Analyze the FULL context: the outstanding question, the user's message, and the conversation flow
- Use your understanding of natural language and intent - do NOT rely on keyword matching
- If there's an outstanding question, determine if the user's message is a response to that question based on:
  * Context and intent (not specific words or phrases)
  * Whether the message appears to be answering, explaining, or responding to the question
  * Whether the user is asking for help with the question, expressing confusion, or providing an answer
  * Whether the message is a follow-up to the previous question (even if it's a request for explanation)
- The user message does NOT need to explicitly mention the question - analyze the intent and context
- If the user is responding to the outstanding question (answering, asking for help, expressing confusion, etc.), set isFollowUpToOutstanding: true
- Use natural language understanding, not keyword matching - understand what the user is trying to communicate
` : 'No outstanding questions.';
  
  // Build milestone context
  const currentMilestoneIndex = meta?.currentMilestoneIndex ?? 0;
  const currentMilestone = activeModule?.milestones?.[currentMilestoneIndex];
  const completedMilestones = activeModule?.milestones?.filter((m, i) => i < currentMilestoneIndex && m.completed) || [];
  const totalMilestones = activeModule?.milestones?.length || 0;
  const allMilestonesDone = activeModule?.milestones?.every(m => m.completed) || false;
  
const milestoneContext = activeModule ? `
CURRENT MILESTONE PROGRESS:
- Module: ${activeModule.title} (${plan?.findIndex(m => m.id === effectiveActiveModuleId) + 1} of ${plan?.length || 0})
- Current Milestone: ${currentMilestoneIndex + 1} of ${totalMilestones}
- Milestone Topic: "${currentMilestone?.text || 'N/A'}"
- Completed: ${completedMilestones.length}/${totalMilestones}
- All Milestones Done: ${allMilestonesDone}
- Plan Approved: ${session.planApproved || false}
- Milestone Being Taught: ${meta?.milestoneBeingTaught || false}
- ⚠️⚠️⚠️ CRITICAL: If planApproved is true and milestoneBeingTaught is false → IMMEDIATELY START TEACHING this milestone topic: "${currentMilestone?.text || 'N/A'}"
- ⚠️⚠️⚠️ CRITICAL: You MUST focus ONLY on the current milestone topic "${currentMilestone?.text || 'N/A'}". Do NOT teach other milestones or topics.
- ⚠️⚠️⚠️ CRITICAL: Assessment questions MUST be about "${currentMilestone?.text || 'N/A'}" only, NOT about other topics or future milestones.
- ⚠️⚠️⚠️ CRITICAL: While a milestone is active, EVERY user reply must be treated as part of the structured teaching cycle. Never send free-form responses—always route through the teaching engine so the full teaching + assessment structure is delivered.
` : 'No active module.';
  
  // Build phase context
  const phaseContext = `
CURRENT PHASE: ${phase}
- Phase determines what actions are appropriate
- 'pre': No plan yet, user wants to learn something
- 'planning': Plan generated, awaiting approval
- 'learning': Active teaching phase
- 'quizzing': Quiz is active
- 'feedback': Feedback phase after quiz
`;
  
  // Build quiz readiness
  const quizReadiness = allMilestonesDone && phase === 'learning' ? `
⚠️ QUIZ READY:
All milestones for this module are completed. User can take a quiz now.
` : '';
  
  return `You are an intelligent learning assistant managing a conversation with a student. Your job is to understand the FULL context and decide what action to take.

${contextSummary}

${phaseContext}
${outstandingQuestionContext}
${milestoneContext}
${quizReadiness}

RECENT MESSAGES (last 3 for immediate context):
${messageHistory}

STUDENT PROFILE:
- Background: ${profile?.background || 'Not specified'}
- Goals: ${profile?.goals?.join(', ') || 'Not specified'}
- Skill Level: ${profile?.skillLevel || 'Not specified'}
- Preferred Style: ${profile?.preferredStyle || 'Not specified'}

CURRENT TOPIC: ${topic || 'Not set'}
LEARNING PLAN: ${plan?.length || 0} modules

USER'S CURRENT MESSAGE: "${userMessage}"

${justApprovedPlan ? `⚠️⚠️⚠️ CRITICAL: Plan was just approved and we're entering learning phase. 
- planApproved: ${planApproved}
- phase: ${phase}
- milestoneBeingTaught: ${meta?.milestoneBeingTaught || false}
- Current milestone: "${activeModule?.milestones?.[meta?.currentMilestoneIndex || 0]?.text || 'N/A'}"

MANDATORY ACTION: You MUST set action: "teach" and IMMEDIATELY start teaching the current milestone topic: "${activeModule?.milestones?.[meta?.currentMilestoneIndex || 0]?.text || 'N/A'}". 
DO NOT ask diagnostic questions, DO NOT ask what the user wants, DO NOT ask about interests - START TEACHING THE MILESTONE TOPIC NOW.
` : ''}

YOUR TASK:
Analyze the FULL context and determine:
1. What is the user's intent? (answering question, asking for help, requesting quiz, continuing learning, etc.)
2. Is the user responding to the outstanding question? (if one exists)
3. What action should you take? (teach, assess, clarify, start quiz, continue, etc.)
4. What should your response be? (teaching content, assessment question, clarification, etc.)
5. Should the phase change? (learning → quizzing, feedback → learning, etc.)
6. Should milestones be marked as complete?

DECISION RULES (CRITICAL - FOLLOW THESE EXACTLY):
- ⚠️ AFTER PLAN APPROVAL: If planApproved is true and we just entered learning phase → IMMEDIATELY start teaching the FIRST milestone. Action MUST be "teach". Do NOT ask off-topic questions like "what do you want to achieve?" or "what area interests you?" - START TEACHING THE MILESTONE TOPIC.
- ⚠️⚠️⚠️ OUTSTANDING QUESTION & FOLLOW-UP HANDLING (CRITICAL):
  * Always treat the user's reply as a follow-up whenever the current milestone is in progress or a question was just asked (even if outstandingCheck is briefly cleared).
  * Use natural language understanding and context - do NOT rely on keyword matching.
  * Consider: Is the user answering the question? Asking for help with it? Expressing confusion about it? Providing information related to it?
  * The user message does NOT need to explicitly mention the question - understand the intent and context.
  * If the user is responding (answer, clarification request, “I don’t know”, etc.), set isFollowUpToOutstanding: true.
  * When isFollowUpToOutstanding: true, you MUST set action: "assess" for answer attempts, or "clarify" when the user provides no answer / asks for help. This ensures the teaching engine produces the full structured response.
  * Never return action: "respond_naturally" or "provide_guidance" while a milestone is active. Always choose "assess" or "clarify".
- If user wants to start quiz (all milestones done) → action: "start_quiz"
- If user wants to continue after feedback → action: "continue_learning", phase: "learning"
- If teaching milestone → provide teaching content about the CURRENT milestone topic ONLY, then ask assessment question
- If milestone assessment answered correctly → mark milestone complete, move to next
- If all milestones done → suggest quiz
- ⚠️ NEVER ask off-topic questions when there's a current milestone to teach - ALWAYS teach the milestone topic first
- Always understand context - don't just match keywords

RESPONSE FORMAT (JSON only):
{
  "intent": "learning" | "answering_question" | "requesting_quiz" | "continuing" | "asking_for_help" | "general",
  "isFollowUpToOutstanding": true/false,
  "action": "teach" | "assess" | "clarify" | "start_quiz" | "continue_learning" | "provide_guidance" | "respond_naturally",
  "response": "Your natural response to the user (teaching content, question, guidance, etc.)",
  "shouldAskQuestion": true/false,
  "questionToAsk": "assessment or clarification question" (if shouldAskQuestion is true, empty string otherwise),
  "markMilestoneComplete": true/false,
  "moveToNextMilestone": true/false,
  "shouldStartQuiz": true/false,
  "phaseChange": "new phase or null" (e.g., "quizzing", "learning", null),
  "milestoneCompleted": true/false,
  "reasoning": "Brief explanation of your decision"
}

CRITICAL RULES (MUST FOLLOW):
- Return ONLY valid JSON. No markdown, no code fences, no explanations outside the JSON.
- ⚠️ If planApproved is true and milestoneBeingTaught is false → IMMEDIATELY set action: "teach" and START TEACHING the current milestone topic. Do NOT ask diagnostic questions, do NOT ask what the user wants, do NOT ask about interests - START TEACHING.
- ⚠️ When teaching a milestone, you MUST teach the EXACT milestone topic (e.g., if milestone is "Learn basic Python syntax and data types" → teach Python syntax and data types, NOT general Python overview, NOT what Python can do, NOT what interests the user).
- ⚠️ NEVER return action: "respond_naturally" or "provide_guidance" during an active milestone. Always route through "assess" (for answers) or "clarify" (for confusion/no answer) so the downstream teaching engine provides the full structured teaching + assessment response.
- Base decisions on FULL context, not just keywords
- Understand conversational flow and user's actual intent
- If teaching, provide actual teaching content about the current milestone topic ONLY
- If assessing, ask a specific question about what was taught
- Be natural and contextual in your responses

Return ONLY valid JSON matching the schema above.`;
};

module.exports = { buildConversationDecisionPrompt };

// Context Summarizer - Maintains structured learning context summary
// Similar to Cursor IDE's context summarization style

/**
 * Build a prompt to summarize learning context
 */
const buildContextSummaryPrompt = (session, recentMessages = []) => {
  const { topic, activeModuleId, plan, profile, phase, meta } = session;
  const activeModule = plan?.find(m => m.id === activeModuleId);
  const currentMilestoneIndex = meta?.currentMilestoneIndex ?? 0;
  const currentMilestone = activeModule?.milestones?.[currentMilestoneIndex];
  const nextMilestoneIndex = currentMilestoneIndex + 1;
  const nextMilestone = activeModule?.milestones?.[nextMilestoneIndex];
  
  // Get existing summary if available (parse it)
  let existingSummary = {};
  if (meta?.contextSummary) {
    try {
      existingSummary = JSON.parse(meta.contextSummary);
    } catch (e) {
      existingSummary = {};
    }
  }
  
  // Get completed milestones
  const completedMilestones = activeModule?.milestones?.filter((m, i) => 
    i < currentMilestoneIndex && m.completed
  ) || [];
  
  const recentContext = recentMessages.length > 0
    ? recentMessages.slice(-5).map(msg => `${msg.role}: ${msg.content.substring(0, 200)}`).join('\n')
    : 'No recent messages';
  
  return `You are a learning context summarizer. Your job is to create a concise, structured summary of the learning session state (similar to Cursor IDE's context summarization).

EXISTING SUMMARY:
${JSON.stringify(existingSummary, null, 2) || 'No previous summary'}

CURRENT SESSION STATE:
- Topic: ${topic || 'Not set'}
- Phase: ${phase}
- Active Module: ${activeModule?.title || 'None'}
- Current Milestone: ${currentMilestoneIndex + 1}/${activeModule?.milestones?.length || 0}
- Milestone Topic: "${currentMilestone?.text || 'N/A'}"
- Completed Milestones: ${completedMilestones.map(m => m.text).join(', ') || 'None'}
- Outstanding Question: ${meta?.outstandingCheck || 'None'}
- Student Background: ${profile?.background || 'Not specified'}
- Student Goals: ${profile?.goals?.join(', ') || 'Not specified'}

RECENT INTERACTION (last 5 messages):
${recentContext}

YOUR TASK:
Create a structured summary that captures:
1. Learning Topic: What is being learned
2. What's Been Delivered: Key concepts/lessons taught so far
3. Current Milestone: What milestone we're on and its topic
4. Current Activity: What we're doing for this milestone (teaching, assessing, clarifying)
5. Next Milestone: What milestone comes next
6. Assessment Criteria: How we determine if a milestone is achieved
7. Student Understanding: Current level of understanding based on interactions
8. Outstanding Items: Any pending questions or actions

SUMMARY FORMAT (JSON):
{
  "learningTopic": "brief description of what's being learned",
  "whatsBeenDelivered": ["concept 1", "concept 2", "concept 3"] (array of key concepts taught - update based on what was actually taught),
  "currentMilestone": {
    "index": ${currentMilestoneIndex},
    "topic": "${currentMilestone?.text || 'N/A'}",
    "status": "teaching" | "assessing" | "clarifying" | "completed",
    "activity": "what we're currently doing for this milestone"
  },
  "nextMilestone": {
    "index": ${nextMilestoneIndex < (activeModule?.milestones?.length || 0) ? nextMilestoneIndex : -1},
    "topic": "${nextMilestone?.text || 'None'}"
  },
  "assessmentCriteria": "how we determine if milestone is achieved",
  "studentUnderstanding": "current level of understanding (beginner/intermediate/advanced)",
  "outstandingItems": ["any pending questions or actions"],
  "keyInsights": ["important observations about student's learning"]
}

Return ONLY valid JSON. No markdown, no code fences, no explanations.`;
};

/**
 * Update context summary after each interaction
 */
const updateContextSummary = async (session, userMessage, assistantResponse, groqClient) => {
  try {
    // Get recent messages (last 5 for context)
    const recentMessages = session.messages.slice(-5);
    
    // Build summary prompt
    const summaryPrompt = buildContextSummaryPrompt(session, recentMessages);
    
    // Call LLM to generate/update summary
    const summaryResponse = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a learning context summarizer. Return ONLY valid JSON matching the schema. No markdown, no code fences, no explanations.'
        },
        {
          role: 'user',
          content: summaryPrompt
        }
      ],
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    const summaryContent = summaryResponse.choices[0].message.content.trim();
    let jsonText = summaryContent;
    
    // Extract JSON if wrapped in markdown
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      const braceMatch = jsonText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonText = braceMatch[0];
      }
    }
    
    const contextSummary = JSON.parse(jsonText);
    
    // Store in session.meta (as JSON string for efficient storage)
    if (!session.meta) {
      session.meta = {};
    }
    session.meta.contextSummary = JSON.stringify(contextSummary);
    session.meta.contextSummaryUpdated = new Date();
    
    console.log('Context summary updated', {
      sessionId: session._id,
      learningTopic: contextSummary.learningTopic,
      currentMilestone: contextSummary.currentMilestone?.topic,
      status: contextSummary.currentMilestone?.status
    });
    
    return contextSummary;
  } catch (error) {
    console.error('Failed to update context summary', { error: error.message });
    // Return existing summary or empty object on error
    if (session.meta?.contextSummary) {
      try {
        return JSON.parse(session.meta.contextSummary);
      } catch (e) {
        return {};
      }
    }
    return {};
  }
};

/**
 * Get formatted context summary for prompts
 */
const getContextSummaryText = (session) => {
  if (!session.meta?.contextSummary) {
    // Return minimal context if no summary exists yet
    const { topic, activeModuleId, plan, meta } = session;
    const activeModule = plan?.find(m => m.id === activeModuleId);
    const currentMilestoneIndex = meta?.currentMilestoneIndex ?? 0;
    const currentMilestone = activeModule?.milestones?.[currentMilestoneIndex];
    
    return `
LEARNING CONTEXT SUMMARY (minimal):
- Topic: ${topic || 'Not set'}
- Current Milestone: ${currentMilestone?.text || 'None'} (${currentMilestoneIndex + 1}/${activeModule?.milestones?.length || 0})
- Status: Initializing
`;
  }
  
  try {
    const summary = JSON.parse(session.meta.contextSummary);
    
    return `
LEARNING CONTEXT SUMMARY:
- Topic: ${summary.learningTopic || 'Not set'}
- What's Been Delivered: ${summary.whatsBeenDelivered?.join(', ') || 'Nothing yet'}
- Current Milestone: ${summary.currentMilestone?.topic || 'None'} (Status: ${summary.currentMilestone?.status || 'unknown'})
- Current Activity: ${summary.currentMilestone?.activity || 'Not specified'}
- Next Milestone: ${summary.nextMilestone?.topic || 'None'}
- Assessment Criteria: ${summary.assessmentCriteria || 'Based on student responses'}
- Student Understanding: ${summary.studentUnderstanding || 'Not assessed'}
- Outstanding Items: ${summary.outstandingItems?.join(', ') || 'None'}
- Key Insights: ${summary.keyInsights?.join('; ') || 'None'}
`;
  } catch (error) {
    console.error('Failed to parse context summary', { error: error.message });
    return 'Context summary unavailable.';
  }
};

module.exports = {
  buildContextSummaryPrompt,
  updateContextSummary,
  getContextSummaryText
};


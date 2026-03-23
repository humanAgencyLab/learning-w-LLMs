const { runAgent } = require('./framework/baseAgent');

const SYSTEM_PROMPT = `You are an educational analytics assistant. Given course analytics data (topic stats, quiz pass rates, session counts), produce a concise instructor-facing summary.

Your response must be valid JSON with this structure:
{
  "summary": "1-3 sentence overall summary of student performance",
  "insights": [
    {
      "type": "struggling" | "positive" | "suggestion",
      "topic": "topic name (if applicable)",
      "text": "1-2 sentence insight"
    }
  ]
}

Rules:
- Focus on actionable insights the instructor can act on
- If quiz pass rates are below 60%, flag as struggling
- If completion rates are very low compared to session starts, note potential engagement issues
- Suggest concrete next steps (e.g. "Consider adding more examples", "Review quiz difficulty")
- Maximum 5 insights
- Keep language professional but approachable
- If there is insufficient data, say so honestly`;

/**
 * Generate an AI-powered struggle/insight summary for an instructor.
 *
 * @param {object} analytics - output of getCourseAnalytics()
 * @returns {Promise<{summary: string, insights: Array}>}
 */
async function runStruggleSummary(analytics) {
  const topicLines = (analytics.topics || []).map((t) => {
    const passRate = t.quizAttempts > 0
      ? Math.round((t.quizPasses / t.quizAttempts) * 100)
      : 'N/A';
    return `- ${t.title} (${t.status}): ${t.startedSessions} started, ${t.completedSessions} completed, quiz pass rate: ${passRate}%`;
  }).join('\n');

  const userPrompt = `Course Analytics:
- Enrolled students: ${analytics.enrollmentCount}
- Total sessions: ${analytics.sessionCount}
- Completed sessions: ${analytics.completedSessionCount}
- Overall completion rate: ${analytics.completionRate}%

Topics:
${topicLines || 'No topic data available.'}

Generate insights for the instructor.`;

  return runAgent({
    taskName: 'struggle_summary',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 800,
    temperature: 0.4,
    jsonMode: true,
  });
}

module.exports = { runStruggleSummary };

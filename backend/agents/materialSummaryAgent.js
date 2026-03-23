const { runAgent } = require('./framework/baseAgent');

const SYSTEM = `You summarize educational source material for instructors.
Return ONLY valid JSON: { "summary": string (max 2000 chars), "keyThemes": string[] (max 10 items) }`;

/**
 * @param {string} excerpt - bounded excerpt of source text
 */
async function runMaterialSummaryAgent(excerpt) {
  const userPrompt = `Summarize the following material for course design:\n\n${excerpt.slice(0, 8000)}`;
  return runAgent({
    taskName: 'material_summary',
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens: 800,
    temperature: 0.2
  });
}

module.exports = { runMaterialSummaryAgent };

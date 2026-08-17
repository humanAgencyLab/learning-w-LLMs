const { compileStudyGraph } = require('./studyGraph');

/**
 * Run the study graph for a given session context.
 *
 * @param {{ session: object, userMessage: string, requestType: string, streamCallback?: function }} opts
 * @returns {Promise<{ success: boolean, state: object, error?: string, elapsedMs: number }>}
 */
async function runStudyGraph({ session, userMessage, requestType, streamCallback, globalInstructions, deferTeaching }) {
  const start = Date.now();
  try {
    const graph = compileStudyGraph();
    const finalState = await graph.invoke({
      session,
      userMessage,
      requestType: requestType || '',
      phase: session.phase || 'pre',
      streamCallback: streamCallback || null,
      globalInstructions: globalInstructions || '',
      deferTeaching: !!deferTeaching,
    });
    return {
      success: true,
      state: finalState,
      elapsedMs: Date.now() - start,
    };
  } catch (err) {
    console.error('[StudyGraph] Execution failed', { error: err.message, phase: session?.phase, requestType });
    return {
      success: false,
      state: null,
      error: err.message,
      elapsedMs: Date.now() - start,
    };
  }
}

module.exports = { runStudyGraph };

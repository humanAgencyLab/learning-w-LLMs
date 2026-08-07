function useMultiAgent() {
  return process.env.USE_MULTI_AGENT === 'true';
}

/**
 * Book-grounded courses (BOOK_GROUNDED_COURSES_PLAN.md). Default OFF: with the
 * flag off, buildCourseContext is byte-identical to the pre-feature behavior
 * (locked by tests/fixtures/buildCourseContext.baseline.json) and the
 * ingestion endpoints refuse to run. Rollback = unset the env var.
 */
function useBookSources() {
  return process.env.USE_BOOK_SOURCES === 'true';
}

function useStreaming() {
  return process.env.USE_STREAMING !== 'false';
}

module.exports = { useMultiAgent, useStreaming, useBookSources };

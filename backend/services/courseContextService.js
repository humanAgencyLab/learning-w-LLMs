const MAX_CONTEXT_CHARS = parseInt(process.env.COURSE_CONTEXT_MAX_CHARS || '12000', 10);

/**
 * Concatenate course sources + global instructions for LLM context with a rough char budget.
 *
 * @param {import('mongoose').Document} course - Course doc with sources[]
 * @param {object} [opts]
 * @param {string} [opts.extraInstructions]
 * @returns {{ contextText: string, truncated: boolean, sourceCount: number }}
 */
function buildCourseContext(course, opts = {}) {
  const extra = (opts.extraInstructions || '').trim();
  const globalInstr = (course.globalInstructions || '').trim();
  const parts = [];
  if (globalInstr) parts.push(`### Instructor global instructions\n${globalInstr}`);
  if (extra) parts.push(`### Additional instructions\n${extra}`);

  let used = parts.join('\n\n').length;
  let truncated = false;
  const sources = course.sources || [];

  for (const src of sources) {
    const block = `### Source: ${src.originalName || src.filename}\n${(src.extractedText || '').trim()}`;
    if (used + block.length > MAX_CONTEXT_CHARS) {
      const room = Math.max(0, MAX_CONTEXT_CHARS - used - 100);
      if (room > 200) {
        parts.push(block.slice(0, room) + '\n[...truncated...]');
        truncated = true;
      } else {
        truncated = true;
      }
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return {
    contextText: parts.join('\n\n'),
    truncated,
    sourceCount: sources.length
  };
}

module.exports = { buildCourseContext, MAX_CONTEXT_CHARS };

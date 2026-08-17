const { getGroqClient } = require('../lib/llmClient');
const { retryWithBackoff } = require('../utils/apiRetry');
const { validateScenarioA, validateScenarioC } = require('../utils/responseValidator');

// Helper to estimate token count (rough: 1 token ≈ 4 characters)
const estimateTokens = (text) => {
  return Math.ceil((text || '').length / 4);
};

// Helper to truncate messages if total exceeds token limit
const truncateMessages = (messages, maxTokens = 2000) => {
  let totalTokens = 0;
  const truncated = [];

  // Start from most recent and work backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content || '');
    if (totalTokens + msgTokens > maxTokens && truncated.length > 0) {
      break; // Stop if adding this would exceed limit
    }
    totalTokens += msgTokens;
    truncated.unshift(messages[i]); // Add to beginning
  }

  return truncated;
};

/**
 * Instructor guidelines as a SYSTEM message so they outrank the response
 * template in the user message. The prompt-level guidelines block alone kept
 * losing to the persona's mandatory structure (word caps, verbatim gamified
 * strings) — system-level priority is what "authoritative" has to mean. The
 * safety floor stays in the fixed persona message above it; the text-only
 * clause forbids faking capabilities to satisfy a guideline.
 */
const instructorSystemMessage = (globalInstructions) => {
  const text = String(globalInstructions || '').trim();
  if (!text) return null;
  return {
    role: 'system',
    content:
      'Instructor course guidelines (authoritative): the course instructor set the guidelines below. They take priority over every default persona, structure, length, and phrasing rule in this conversation, including the response template in the user message — only safety rules outrank them. TWO exceptions the guidelines never override: (1) keep the response\'s short templated opener exactly as the template specifies (e.g. "That\'s correct! You\'ve completed: …", "Not quite.", "No worries, let\'s explain this together.") — apply the guidelines to everything after that opener; (2) you are a text-only tutor: never fabricate URLs, citations, current news, images, or diagram stand-ins to satisfy a guideline; deliver its intent in plain text using real, named cases you know.\n\n' +
      text
  };
};

// Call Groq API for teacher response with retry and validation
const callTeacherAPI = async (prompt, maxTokens = 1500, session = null, validationContext = null, globalInstructions = '', opts = {}) => {
  const groqClient = getGroqClient();

  // Build messages array with conversation history (outside retry loop for efficiency)
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert tutor and learning facilitator. Follow the instructions in the user message carefully. Provide complete teaching responses with introduction, teaching content, and assessment question. Adapt your teaching style to the topic and student profile.'
    }
  ];
  const instrMsg = instructorSystemMessage(globalInstructions);
  if (instrMsg) messages.push(instrMsg);

  // Add conversation history: use contextSummary + recent messages when available (Cursor-style)
  if (session && session.messages && session.messages.length > 0) {
    const meta = session.meta || {};
    let recentMessages;
    if (meta.contextSummary && typeof meta.summarizedUpToIndex === 'number') {
      // Summarized context: summary as system context + messages after summarized index
      const summaryText = meta.contextSummary.text || '';
      if (summaryText) {
        messages.push({
          role: 'system',
          content: `Previous conversation summary (for context):\n${summaryText}`
        });
      }
      recentMessages = session.messages.slice(meta.summarizedUpToIndex).slice(-15);
    } else {
      recentMessages = session.messages.slice(-15);
    }
    const truncatedMessages = truncateMessages(recentMessages, 2000);
    const conversationHistory = truncatedMessages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push(...conversationHistory);

    const missingContent = conversationHistory.filter(
      (msg) => typeof msg.content !== 'string' || msg.content.length === 0
    );
    if (missingContent.length > 0) {
      console.warn('Conversation history contains messages without content', {
        count: missingContent.length,
        samples: missingContent.slice(0, 2)
      });
    }
  }

  if (prompt) {
    const lastMessage = messages[messages.length - 1];
    const alreadyHasPrompt = lastMessage && lastMessage.role === 'user' && lastMessage.content === prompt;
    if (!alreadyHasPrompt) {
      messages.push({
        role: 'user',
        content: prompt
      });
    }
  } else {
    // No prompt provided - fallback to minimal instruction to avoid malformed requests
    messages.push({
      role: 'user',
      content: 'Provide the next teaching response following the required structure.'
    });
  }

  // Ensure sufficient tokens for complete teaching response
  const effectiveMaxTokens = Math.max(maxTokens || 1500, 1500);

  // Wrap API call in retry logic
  const makeAPICall = async () => {
    try {
      console.log('Calling Teacher API', {
        messageCount: messages.length,
        maxTokens: effectiveMaxTokens,
        promptLength: prompt?.length || 0
      });
      if (
        messages.some((msg) => typeof msg.content !== 'string' || msg.content.length === 0)
      ) {
        console.warn(
          'Teacher API payload has missing content entries',
          messages.map((msg, index) => ({
            index,
            role: msg.role,
            hasContent: typeof msg.content === 'string',
            contentPreview:
              typeof msg.content === 'string' ? msg.content.substring(0, 60) : null
          }))
        );
      }

      const response = await groqClient.chat.completions.create({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages,
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: effectiveMaxTokens,
        // Structured composer turns: the API enforces valid JSON, so real
        // newlines inside string values can't break the parse downstream.
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });

      // Validate response structure more robustly
      if (
        !response ||
        !response.choices ||
        !Array.isArray(response.choices) ||
        response.choices.length === 0
      ) {
        console.error('Invalid API response structure', {
          hasResponse: !!response,
          hasChoices: !!response?.choices,
          choicesLength: response?.choices?.length || 0,
          responseKeys: response ? Object.keys(response) : []
        });
        throw new Error('Invalid response format from API: missing choices array');
      }

      const message = response.choices[0]?.message;
      if (!message) {
        console.error('Invalid API response: missing message', {
          choice: response.choices[0],
          choiceKeys: response.choices[0] ? Object.keys(response.choices[0]) : []
        });
        throw new Error('Invalid response format from API: missing message');
      }

      const content = message.content;

      // Handle empty content - could be API error or rate limiting
      if (typeof content !== 'string') {
        console.error('Invalid API response: content is not a string', {
          content,
          contentType: typeof content,
          messageKeys: Object.keys(message),
          responseKeys: Object.keys(response)
        });
        throw new Error(`Invalid response format from API: content is ${typeof content}, expected string`);
      }

      // Return content (empty or not - retry logic will handle it)
      return content || '';
    } catch (error) {
      // Re-throw to let retry logic handle it
      throw error;
    }
  };

  // Use retry logic with exponential backoff
  const content = await retryWithBackoff(makeAPICall, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    onRetry: (attempt, reason, delay) => {
      console.log(`API retry attempt ${attempt}: ${reason}, waiting ${delay}ms`);
    },
    shouldRetry: (error) => {
      // Retry on empty responses, rate limits, server errors, or network errors
      const isEmptyResponse = error.message === 'EMPTY_RESPONSE';
      const isRateLimit =
        error.status === 429 ||
        error.message?.includes('rate_limit') ||
        error.message?.includes('429');
      const isServerError = error.status >= 500 && error.status < 600;
      const isNetworkError =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout');
      return isEmptyResponse || isRateLimit || isServerError || isNetworkError;
    }
  });

  // Check for empty content after retries
  if (!content || content.trim().length === 0) {
    console.error('Empty response after all retries', {
      contentLength: content?.length || 0
    });
    return 'I apologize, but I encountered an issue generating a response. Please try again in a moment.';
  }

  // Clean up any step labels that might have been included despite instructions
  let cleanedContent = content;
  // Remove step labels (case-insensitive, with or without bold/formatting)
  cleanedContent = cleanedContent.replace(/\*\*?STEP\s*[123]:?\s*\*\*?/gi, '');
  cleanedContent = cleanedContent.replace(/\*\*?Step\s*[123]:?\s*\*\*?/gi, '');
  cleanedContent = cleanedContent.replace(/STEP\s*[123]:?\s*/gi, '');
  cleanedContent = cleanedContent.replace(/Step\s*[123]:?\s*/gi, '');
  // Remove section headers like "CONTEXT:", "TEACHING CONTENT:", "ASSESSMENT QUESTION:"
  cleanedContent = cleanedContent.replace(/\*\*?(?:STEP\s*[123]\s*[-–—]?\s*)?(?:Context|CONTEXT|Teaching\s+Content|TEACHING\s+CONTENT|Assessment\s+Question|ASSESSMENT\s+QUESTION):?\s*\*\*?/gi, '');
  // Clean up multiple blank lines
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  // Trim whitespace
  cleanedContent = cleanedContent.trim();

  // Validate response structure if validation context provided
  if (validationContext) {
    const { scenario, currentMilestone, nextMilestone } = validationContext;
    let validation;

    if (scenario === 'A') {
      validation = validateScenarioA(content, currentMilestone, nextMilestone);
    } else if (scenario === 'C') {
      validation = validateScenarioC(content, currentMilestone);
    }

    if (validation && !validation.isValid) {
      console.warn('Response structure validation failed', {
        scenario,
        missingParts: validation.missingParts,
        reason: validation.reason
      });
    }
  }

  return cleanedContent;
};

/**
 * Streaming variant: yields text chunks as they arrive. Does not use retry (streaming + retry is complex).
 * Returns full content when done. Use for SSE responses.
 *
 * @param {string} prompt
 * @param {number} maxTokens
 * @param {object} session
 * @param {{ onChunk: (chunk: string) => void }} opts
 * @returns {Promise<string>} full content when stream completes
 */
const callTeacherAPIStream = async (prompt, maxTokens = 1500, session = null, opts = {}) => {
  const groqClient = getGroqClient();
  const { onChunk } = opts;

  const messages = [
    {
      role: 'system',
      content:
        'You are an expert tutor and learning facilitator. Follow the instructions in the user message carefully. Provide complete teaching responses with introduction, teaching content, and assessment question. Adapt your teaching style to the topic and student profile.'
    }
  ];
  const instrMsgStream = instructorSystemMessage(opts.globalInstructions);
  if (instrMsgStream) messages.push(instrMsgStream);

  if (session && session.messages && session.messages.length > 0) {
    const meta = session.meta || {};
    let recentMessages;
    if (meta.contextSummary && typeof meta.summarizedUpToIndex === 'number') {
      const summaryText = meta.contextSummary?.text || '';
      if (summaryText) {
        messages.push({
          role: 'system',
          content: `Previous conversation summary (for context):\n${summaryText}`
        });
      }
      recentMessages = session.messages.slice(meta.summarizedUpToIndex).slice(-15);
    } else {
      recentMessages = session.messages.slice(-15);
    }
    const truncatedMessages = truncateMessages(recentMessages, 2000);
    truncatedMessages.forEach((msg) => {
      messages.push({ role: msg.role, content: msg.content });
    });
  }

  const userContent = prompt || 'Provide the next teaching response following the required structure.';
  messages.push({ role: 'user', content: userContent });

  const effectiveMaxTokens = Math.max(maxTokens || 1500, 1500);

  const stream = await groqClient.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages,
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: effectiveMaxTokens,
    stream: true
  });

  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      fullContent += delta;
      if (onChunk) onChunk(delta);
    }
  }

  let cleanedContent = fullContent;
  cleanedContent = cleanedContent.replace(/\*\*?STEP\s*[123]:?\s*\*\*?/gi, '');
  cleanedContent = cleanedContent.replace(/\*\*?Step\s*[123]:?\s*\*\*?/gi, '');
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  cleanedContent = cleanedContent.trim();

  return cleanedContent || 'I apologize, but I encountered an issue generating a response. Please try again in a moment.';
};

module.exports = {
  callTeacherAPI,
  callTeacherAPIStream,
  estimateTokens
};


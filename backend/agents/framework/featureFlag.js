function useMultiAgent() {
  return process.env.USE_MULTI_AGENT === 'true';
}

function useStreaming() {
  return process.env.USE_STREAMING !== 'false';
}

module.exports = { useMultiAgent, useStreaming };

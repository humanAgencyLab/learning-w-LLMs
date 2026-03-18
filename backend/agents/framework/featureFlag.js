function useMultiAgent() {
  return process.env.USE_MULTI_AGENT === 'true';
}

module.exports = { useMultiAgent };

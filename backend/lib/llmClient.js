let _client = null;

// Lazy import so jest.mock('groq-sdk') works.
function getGroqClient() {
  if (_client) return _client;
  const { Groq } = require('groq-sdk');
  _client = new Groq({ apiKey: process.env.GROQ_API_KEY || 'test-key' });
  return _client;
}

function setGroqClient(client) {
  _client = client;
}

function resetGroqClient() {
  _client = null;
}

module.exports = { getGroqClient, setGroqClient, resetGroqClient };


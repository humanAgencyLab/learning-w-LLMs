let _client = null;

// Lazy import so jest.mock('groq-sdk') works.
function getGroqClient() {
  if (_client) return _client;
  const { Groq } = require('groq-sdk');
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  _client = new Groq({ apiKey });
  return _client;
}

function setGroqClient(client) {
  _client = client;
}

function resetGroqClient() {
  _client = null;
}

module.exports = { getGroqClient, setGroqClient, resetGroqClient };


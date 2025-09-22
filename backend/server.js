require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Groq = require('groq-sdk');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');

const StudySession = require('./models/StudySession');
const ChatLog = require('./models/ChatLog');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app')
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Check for Groq API key
if (!process.env.GROQ_API_KEY) {
  console.error('❌ Groq API Key is missing. Check .env file.');
  process.exit(1);
}

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Stage-aware system prompt helper
function getSystemPrompt(stage = 1) {
  const stagePrompts = {
    1: `You are teaching someone in Stage 1: Unconscious Incompetence.
    - The user is new to the topic and unaware of the fundamental concepts.
    - Build intuition without overwhelming them with technical detail.
    - Use simple language and real-world examples.`,
    
    2: `You are teaching someone in Stage 2: Conscious Incompetence.
    - The user understands basics but struggles to apply them.
    - Focus on practical applications and common patterns.
    - Help them build confidence through guided practice.`,
    
    3: `You are teaching someone in Stage 3: Conscious Competence.
    - The user can apply knowledge with effort and growing independence.
    - Focus on advanced problem-solving and deeper understanding.
    - Encourage them to explain their reasoning.`,
    
    4: `You are teaching someone in Stage 4: Unconscious Competence.
    - The user has mastery and wants to practice and extend knowledge.
    - Focus on creative applications and synthesis of concepts.
    - Challenge them with complex, real-world scenarios.`
  };

  return `You are a patient, encouraging tutor. ${stagePrompts[stage] || stagePrompts[1]}

  Guidelines:
  - Be kind and supportive
  - Ask questions to check understanding
  - Use examples to illustrate concepts
  - Adapt explanations based on responses
  - Keep responses concise but helpful`;
}

// Routes
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/chat', async (req, res) => {
  try {
    const { message, stage = 1, sessionId } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create or load session
    let session;
    if (sessionId) {
      session = await StudySession.findById(sessionId);
    }
    
    if (!session) {
      session = new StudySession({});
      await session.save();
    }

    // Save user message
    const userLog = new ChatLog({
      sessionId: session._id,
      message: message.trim(),
      isUser: true,
      stage: stage,
      aiModel: 'llama-3.3-70b-versatile'
    });
    await userLog.save();

    // Load chat history
    const history = await ChatLog.find({ sessionId: session._id })
      .sort({ timestamp: 1 })
      .limit(20); // Limit to prevent token overflow

    // Build messages for OpenAI
    const messages = [
      { role: 'system', content: getSystemPrompt(stage) }
    ];

    // Add recent history
    history.forEach(entry => {
      messages.push({
        role: entry.isUser ? 'user' : 'assistant',
        content: entry.message
      });
    });

    // Call Groq
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = response.choices[0].message.content.trim();

    // Save assistant reply
    const assistantLog = new ChatLog({
      sessionId: session._id,
      message: reply,
      isUser: false,
      stage: stage,
      aiModel: 'llama-3.3-70b-versatile'
    });
    await assistantLog.save();

    res.json({
      sessionId: session._id.toString(),
      reply: reply
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Groq API request failed. Check logs for details.' 
    });
  }
});

// Load and mount Swagger UI
try {
  const openapiSpec = yaml.load(fs.readFileSync(__dirname + '/openapi.yaml', 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
} catch (error) {
  console.error('❌ Failed to load OpenAPI spec:', error);
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
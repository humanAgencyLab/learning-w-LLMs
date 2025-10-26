const app = require('./app');
const mongoose = require('mongoose');
const PORT = process.env.PORT || 5001;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Create indexes for performance
    try {
      const StudySession = require('./models/StudySession');
      const ChatLog = require('./models/ChatLog');
      await ChatLog.collection.createIndex({ sessionId: 1 });
      await StudySession.collection.createIndex({ updatedAt: -1 });
      console.log('✅ Database indexes created');
    } catch (indexError) {
      console.log('⚠️ Index creation warning:', indexError.message);
    }
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
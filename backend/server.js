const app = require('./app');
const mongoose = require('mongoose');
const PORT = process.env.PORT || 5001;

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately - log and let the process continue
  // In production, you might want to exit here, but for development, continue
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Create indexes for performance
    try {
      const User = require('./models/User');
      const StudySession = require('./models/StudySession');
      const ChatLog = require('./models/ChatLog');
      
      // Ensure unique email index exists (critical for preventing duplicate accounts)
      await User.collection.createIndex({ email: 1 }, { unique: true });
      await ChatLog.collection.createIndex({ sessionId: 1 });
      await StudySession.collection.createIndex({ updatedAt: -1 });
      console.log('✅ Database indexes created');
    } catch (indexError) {
      // If index already exists, that's fine - just log it
      if (indexError.code === 85 || indexError.message.includes('already exists')) {
        console.log('✅ Database indexes already exist');
      } else {
        console.log('⚠️ Index creation warning:', indexError.message);
      }
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
  // Log registered routes in production for debugging
  if (process.env.NODE_ENV === 'production') {
    const authRoutes = require('./routes/authRoutes');
    console.log(`📋 Auth routes registered: ${authRoutes.stack.filter(l => l.route).length}`);
    authRoutes.stack.forEach((layer) => {
      if (layer.route && layer.route.path === '/check-email') {
        console.log(`✅ check-email route found: ${Object.keys(layer.route.methods).join(', ').toUpperCase()} /v1/auth${layer.route.path}`);
      }
    });
  }
});
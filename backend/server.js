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
      
      // Drop legacy indexes that shouldn't exist
      try {
        const userIndexes = await User.collection.indexes();
        
        // Drop email index if it exists (legacy from when email field existed)
        const emailIndex = userIndexes.find(idx => idx.key && idx.key.email);
        if (emailIndex) {
          console.log('🗑️  Dropping legacy email index...');
          await User.collection.dropIndex(emailIndex.name);
          console.log('✅ Legacy email index removed');
        }
        
        // Drop certificates.certificateId unique index (uniqueness handled at application level)
        const certIndex = userIndexes.find(idx => 
          idx.key && idx.key['certificates.certificateId'] && idx.unique === true
        );
        if (certIndex) {
          console.log('🗑️  Dropping certificates.certificateId unique index...');
          await User.collection.dropIndex(certIndex.name);
          console.log('✅ Certificates index removed');
        }
      } catch (dropError) {
        // Index might not exist, which is fine
        if (dropError.code !== 27) { // 27 = IndexNotFound
          console.log('⚠️  Warning while checking indexes:', dropError.message);
        }
      }
      
      // Email field and index removed - no longer needed
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
    console.error('⚠️  Server will keep running but API requests requiring the database will fail. Start MongoDB (e.g. mongod) to fix.');
    // Do not exit: keep HTTP server up so proxy can reach it; health and API will reflect DB unreachable
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
  // Log registered routes for debugging (always run to verify route registration)
  try {
    const authRoutes = require('./routes/authRoutes');
    console.log(`📋 Auth routes registered: ${authRoutes.stack.filter(l => l.route).length}`);
    // Email check route removed - no longer needed
    console.log('Available auth routes:');
    authRoutes.stack.forEach((layer, idx) => {
      if (layer.route) {
        console.log(`  ${idx}: ${Object.keys(layer.route.methods).join(', ').toUpperCase()} ${layer.route.path}`);
      }
    });
  } catch (err) {
    console.error('Error checking routes:', err.message);
  }
});
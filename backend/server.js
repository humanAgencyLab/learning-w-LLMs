// Runtime shims first: Node 18 lacks globalThis.crypto, which LangGraph needs.
require('./lib/nodeCompat');
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
/**
 * Connection options and reconnection.
 *
 * The original code called mongoose.connect() once, logged on failure and
 * carried on. On 2026-08-13 a live instance lost its connection and never got
 * it back: every login returned 500 for ~15 minutes across all 14 participant
 * accounts, because nothing here retries and nothing tells the platform the
 * instance is dead.
 *
 * Two layers now:
 *  - the driver's own recovery. serverSelectionTimeoutMS bounds how long a
 *    request waits for a usable server, and bufferCommands keeps a query
 *    queued across a brief blip instead of throwing instantly — a transient
 *    election or network hiccup should not surface to a participant.
 *  - an explicit 'disconnected' handler, because driver-level recovery does
 *    not cover every case (an initial connect that never succeeded has no
 *    topology to recover). It retries with backoff, forever, since a study
 *    session may be in progress and a degraded instance is useless.
 *
 * /v1/health returns 503 while this is down, so Cloud Run replaces the
 * instance in parallel; whichever heals first, the participant sees a working
 * service.
 */
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app';
const MONGO_OPTS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  retryWrites: true,
  retryReads: true,
};
// Queue commands during a blip rather than failing them outright.
mongoose.set('bufferCommands', true);

let reconnectTimer = null;
let reconnectAttempt = 0;
const scheduleReconnect = (why) => {
  if (reconnectTimer) return;            // one in flight is enough
  if (mongoose.connection.readyState === 1) return;
  reconnectAttempt += 1;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempt, 5)); // 2s..30s
  console.error(`⚠️  MongoDB ${why} — reconnect attempt ${reconnectAttempt} in ${delay}ms`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await mongoose.connect(MONGO_URI, MONGO_OPTS);
    } catch (e) {
      console.error('❌ MongoDB reconnect failed:', e.message);
      scheduleReconnect('reconnect failed');
    }
  }, delay);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
};

mongoose.connection.on('disconnected', () => scheduleReconnect('disconnected'));
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error event:', err.message);
  scheduleReconnect('error event');
});
mongoose.connection.on('connected', () => {
  if (reconnectAttempt > 0) console.log(`✅ MongoDB reconnected after ${reconnectAttempt} attempt(s)`);
  reconnectAttempt = 0;
});

mongoose.connect(MONGO_URI, MONGO_OPTS)
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
    console.error('❌ MongoDB connection error:', error.message);
    console.error('⚠️  Server is up but the database is unreachable. /v1/health now returns 503 so the platform can replace this instance, and a reconnect is scheduled below.');
    // Do not exit: the HTTP server stays up so the platform can probe it, and
    // /v1/health reports 503 until the reconnect below succeeds.
    scheduleReconnect('initial connect failed');
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
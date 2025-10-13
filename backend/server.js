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
const QuizAttempt = require('./models/QuizAttempt');
const Quiz = require('./models/Quiz');
const { srlSystemPrompt } = require('./prompts/systemPrompt');
const { generateQuiz } = require('./prompts/quizGenerator');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));
app.use(express.json());

// Enhanced STATE JSON Parser with Robust Extraction
const stripAndParseState = (modelText) => {
  const re = /```state\s*([\s\S]*?)\s*```/g;
  let m, last;
  while ((m = re.exec(modelText)) !== null) last = m[1];
  const visible = last ? modelText.replace(/```state[\s\S]*?```/g,'').trim() : modelText.trim();
  const parsed = last ? parseState(last) : null;
  return { visible, parsed };
};

const parseState = (s) => {
  try { 
    return JSON.parse(s); 
  } catch { 
    return null; 
  }
};

// STATE JSON Parser Helper with Plan Validation (strict: prioritize ```state blocks)
const parseStateFromResponse = (response) => {
  try {
    // Use the enhanced extraction function
    const { parsed: state } = stripAndParseState(response);
    
    if (!state) {
      console.log('⚠️ No ```state block found (required format)');
      return null;
    }
    
    // Validate required fields
    if (!state.topic || !state.phase || !Array.isArray(state.plan) || !state.nextAction) {
      console.log('⚠️ State missing required fields:', { 
        hasTopic: !!state.topic, 
        hasPhase: !!state.phase, 
        hasPlan: Array.isArray(state.plan), 
        hasNextAction: !!state.nextAction 
      });
      return null;
    }
    
    // Check if plan is array of strings instead of objects (auto-fix)
    if (state.plan.length > 0 && typeof state.plan[0] === 'string') {
      console.log('⚠️ Plan is array of strings, converting to objects');
      state.plan = state.plan.map((title, index) => ({
        id: `m${index + 1}`,
        title: title,
        description: `Learn ${title.toLowerCase()}`,
        status: index === 0 ? 'in_progress' : 'locked',
        milestones: [`Understand ${title.toLowerCase()}`, `Practice ${title.toLowerCase()}`, `Apply ${title.toLowerCase()}`],
        completedMilestones: []
      }));
      state.currentModuleId = 'm1';
      if (state.phase === 'planning') {
        state.phase = 'learning';
      }
    }
    
    // Validate plan completeness
    if (state.plan.length > 0 && state.plan.length < 3) {
      console.log('⚠️ Plan has <3 modules, will need extension');
      return { ...state, needsPlanExtension: true };
    }
    
    // Check if all modules have milestones
    const incompleteModules = state.plan.filter(module => 
      !module.milestones || module.milestones.length < 3
    );
    
    if (incompleteModules.length > 0) {
      console.log('⚠️ Some modules missing milestones, will need extension');
      return { ...state, needsPlanExtension: true };
    }
    
    // Ensure completedMilestones array exists in all modules
    state.plan = state.plan.map(module => ({
      ...module,
      completedMilestones: module.completedMilestones || []
    }));
    
    return state;
  } catch (error) {
    console.log('⚠️ Failed to parse STATE JSON:', error.message);
    return null;
  }
};

// Strip state block from response text (remove both ```state and ```json blocks)
const stripStateFromResponse = (response) => {
  // Use the enhanced extraction function to get clean visible text
  const { visible } = stripAndParseState(response);
  return visible;
};

// SRL Helper Functions
const determinePhase = (session) => {
  if (!session.plan || session.plan.length === 0) {
    return 'assessment';
  }
  if (session.phase === 'planning') {
    return 'planning';
  }
  if (session.quiz && session.quiz.submitted) {
    return session.quiz.passed ? 'learning' : 'feedback';
  }
  if (session.quiz && !session.quiz.submitted) {
    return 'quiz';
  }
  return 'learning';
};

// Helper function to calculate progress based on completed milestones
const calculateProgress = (plan, currentModuleId) => {
  if (!plan || !currentModuleId) return { overallPct: 0, modulePct: 0 };
  
  const currentModule = plan.find(m => m.id === currentModuleId);
  if (!currentModule) return { overallPct: 0, modulePct: 0 };
  
  // Calculate module progress based on completed milestones
  const totalMilestones = currentModule.milestones?.length || 0;
  const completedMilestones = currentModule.completedMilestones?.length || 0;
  const modulePct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  
  // Calculate overall progress
  const completedModules = plan.filter(m => m.status === 'complete').length;
  const totalModules = plan.length;
  const overallPct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  
  return { overallPct, modulePct };
};

const updateSessionWithState = async (sessionId, state) => {
  try {
    const session = await StudySession.findById(sessionId);
    if (!session) return null;

    // Update session with state data
    const updates = {};
    
    if (state.topic) updates.topic = state.topic;
    if (state.phase) updates.phase = state.phase;
    if (state.plan) updates.plan = state.plan;
    if (state.currentModuleId) updates.currentModuleId = state.currentModuleId;
    
    // Calculate progress based on milestones
    const calculatedProgress = calculateProgress(state.plan, state.currentModuleId);
    updates.progress = {
      overallPct: state.progress?.overallPct || calculatedProgress.overallPct,
      modulePct: state.progress?.modulePct || calculatedProgress.modulePct
    };

    // Update module statuses and completedMilestones based on plan
    if (state.plan) {
      for (const module of state.plan) {
        const existingModule = session.plan.find(m => m.id === module.id);
        
        // Track status changes
        if (existingModule && existingModule.status !== module.status) {
          session.stageHistory.push({
            moduleId: module.id,
            fromStatus: existingModule.status,
            toStatus: module.status,
            at: new Date()
          });
        }
        
        // Ensure completedMilestones array exists
        if (!module.completedMilestones) {
          module.completedMilestones = [];
        }
      }
      
      // Auto-complete module when all milestones done
      const currentModule = state.plan.find(m => m.id === state.currentModuleId);
      if (currentModule && currentModule.status === 'in_progress') {
        const totalMilestones = currentModule.milestones?.length || 0;
        const completed = currentModule.completedMilestones?.length || 0;
        
        // If all milestones complete, mark module as ready for quiz
        if (totalMilestones > 0 && completed >= totalMilestones) {
          console.log(`✅ Module ${currentModule.id} milestones complete (${completed}/${totalMilestones})`);
          updates.progress.modulePct = 100;
        }
      }
    }

    // Update quiz state if provided
    if (state.quiz) {
      updates.quiz = state.quiz;
    }

    // Save updates
    Object.assign(session, updates);
    await session.save();
    
    return session;
  } catch (error) {
    console.error('Error updating session with state:', error);
    return null;
  }
};

// Token estimation helper (rough: 1 token ≈ 4 chars)
const estimateTokens = (text) => {
  return Math.ceil(text.length / 4);
};

// Generate conversation summary for token efficiency
const generateConversationSummary = async (groq, history, session) => {
  try {
    const conversationText = history.slice(-10).map(msg => 
      `${msg.isUser ? 'User' : 'Assistant'}: ${msg.message}`
    ).join('\n');
    
    const summaryPrompt = `Summarize this learning conversation in ≤100 words. Include: topic, user's goal, prior knowledge, learning style, progress (modules/milestones completed), and any quiz results.

${conversationText}

Summary (≤100 words):`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a concise conversation summarizer. Return only the summary, no preamble.' },
        { role: 'user', content: summaryPrompt }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const summary = response.choices[0].message.content.trim();
    console.log('✅ Generated conversation summary:', summary.substring(0, 80) + '...');
    
    // Update session with summary
    await StudySession.findByIdAndUpdate(session._id, {
      conversation_summary: summary,
      lastSummaryUpdate: new Date()
    });
    
    return summary;
  } catch (error) {
    console.error('❌ Summary generation failed:', error.message);
    return session.conversation_summary || '';
  }
};

// Adaptive max_tokens based on phase
const getMaxTokensForPhase = (phase) => {
  switch (phase) {
    case 'assessment':
      return 400; // Increased to allow plan generation with state block
    case 'planning':
      return 600; // Increased to ensure state block has space
    case 'learning':
      return 600; // Allow rich, structured teaching
    case 'quiz':
      return 180;
    case 'feedback':
      return 200;
    default:
      return 400;
  }
};

// Exponential backoff retry for rate limits
const retryWithBackoff = async (fn, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 250; // 250ms, 500ms, 1s
        console.log(`⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
};


// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_edu_app')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Create indexes for performance
    try {
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

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Stage-aware system prompt helper

// Routes
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/chat', async (req, res) => {
  console.log('💬 Chat request received:', { message: req.body.message?.substring(0, 50) + '...', stage: req.body.stage, sessionId: req.body.sessionId });
  
  // Set request timeout
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log('⏰ Chat request timeout after 60s');
      res.status(504).json({ 
        error: 'Request timeout. The AI is taking too long to respond. Please try again.' 
      });
    }
  }, 60000); // 60 second timeout

  try {
    const { message, stage, sessionId, forceAssess = false } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create or load session
    let session;
    if (sessionId) {
      try {
        session = await StudySession.findById(sessionId);
      } catch (dbError) {
        console.error('❌ Database error loading session:', dbError);
        clearTimeout(timeout);
        return res.status(500).json({ error: 'Database error. Please try again.' });
      }
    }
    
    if (!session) {
      session = new StudySession({ 
        topic: 'General Learning', 
        stage: stage || 1,
        phase: 'assessment',
        progress: { overallPct: 0, modulePct: 0 }
      });
      try {
        await session.save();
        console.log('✅ Created new session:', session._id);
      } catch (dbError) {
        console.error('❌ Database error creating session:', dbError);
        clearTimeout(timeout);
        return res.status(500).json({ error: 'Database error. Please try again.' });
      }
    }

    // Determine current phase
    const currentPhase = determinePhase(session);
    
    // Save user message
    const userLog = new ChatLog({
      sessionId: session._id,
      message: message.trim(),
      isUser: true,
      type: 'text',
      topic: session.topic,
      stage: session.stage || 1,
      phase: currentPhase,
      moduleId: session.currentModuleId,
      aiModel: 'llama-3.3-70b-versatile'
    });
    
    try {
      await userLog.save();
      console.log('✅ User message saved');
    } catch (dbError) {
      console.error('❌ Database error saving user message:', dbError);
      clearTimeout(timeout);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    // Load chat history with windowing
    let allHistory;
    try {
      allHistory = await ChatLog.find({ sessionId: session._id })
        .sort({ timestamp: 1 });
      console.log('✅ Loaded chat history:', allHistory.length, 'total messages');
    } catch (dbError) {
      console.error('❌ Database error loading history:', dbError);
      clearTimeout(timeout);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    // Conversation windowing: keep last 6-8 turns (12-16 messages)
    const WINDOW_SIZE = 8; // turns (user+assistant pairs)
    const recentHistory = allHistory.slice(-WINDOW_SIZE * 2);
    
    // Check if we need to generate/update summary
    const shouldGenerateSummary = allHistory.length > 8 && (
      !session.conversation_summary || 
      !session.lastSummaryUpdate ||
      (Date.now() - session.lastSummaryUpdate.getTime()) > 4 * 60 * 1000 // Update every 4 turns (~8 messages)
    );
    
    if (shouldGenerateSummary) {
      console.log('📝 Generating conversation summary for token efficiency...');
      try {
        const newSummary = await generateConversationSummary(groq, allHistory, session);
        session.conversation_summary = newSummary;
      } catch (summaryError) {
        console.error('⚠️ Summary generation failed, continuing without:', summaryError.message);
      }
    }

    // Build messages for Groq with SRL system (now includes conversation_summary)
    const systemPrompt = srlSystemPrompt(session, message);
    const messages = [{
      role: 'system',
      content: systemPrompt
    }];

    // Add ONLY recent history (windowed)
    recentHistory.forEach(entry => {
      messages.push({
        role: entry.isUser ? 'user' : 'assistant',
        content: entry.message
      });
    });

    // Estimate tokens for logging
    const estimatedPromptTokens = estimateTokens(JSON.stringify(messages));
    console.log(`📊 Token estimate: ~${estimatedPromptTokens} prompt tokens (phase: ${currentPhase})`);

    // Adaptive max_tokens based on phase
    const maxTokens = getMaxTokensForPhase(currentPhase);
    console.log(`🤖 Calling Groq API (max_tokens: ${maxTokens})...`);
    
    // Call Groq with timeout handling and retry logic
    let response;
    try {
      response = await retryWithBackoff(async () => {
        return await groq.chat.completions.create({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: messages,
          max_tokens: maxTokens,
          temperature: currentPhase === 'quiz' ? 0.5 : 0.7
        });
      });
      console.log('✅ Groq API response received');
    } catch (groqError) {
      console.error('❌ Groq API error:', groqError);
      clearTimeout(timeout);
      
      if (groqError.status === 429) {
        return res.status(503).json({ 
          error: 'AI service is temporarily unavailable due to high demand. Please try again in a few moments.' 
        });
      } else if (groqError.status === 400) {
        return res.status(400).json({ 
          error: 'Invalid request. Please check your message and try again.' 
        });
      } else {
        return res.status(502).json({ 
          error: 'AI service is temporarily unavailable. Please try again later.' 
        });
      }
    }

    let fullResponse = response.choices[0].message.content.trim();
    const responseTokens = estimateTokens(fullResponse);
    console.log(`✅ Generated reply (${responseTokens} tokens):`, fullResponse.substring(0, 100) + '...');

    // Check for any incomplete code blocks (state, json, etc.)
    const hasIncompleteCodeBlock = (fullResponse.includes('```state') || fullResponse.includes('```json')) && 
                                  !fullResponse.match(/```(?:state|json)\s*[\s\S]*?\s*```/);
    
    if (hasIncompleteCodeBlock) {
      console.log('⚠️ Code block incomplete, requesting completion...');
      // Ask model to complete just the state block
      try {
        const incompleteStart = Math.max(
          fullResponse.lastIndexOf('```state'),
          fullResponse.lastIndexOf('```json')
        );
        
        const completeStateResponse = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'Complete the following JSON state block. Return ONLY the complete ```state block with valid JSON. Do not use ```json, use ```state.' },
            { role: 'user', content: fullResponse.substring(incompleteStart) }
          ],
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          max_tokens: 400,
          temperature: 0.3
        });
        
        const completedState = completeStateResponse.choices[0].message.content.trim();
        // Replace incomplete block with completed one
        fullResponse = fullResponse.substring(0, incompleteStart) + completedState;
        console.log('✅ Code block completed');
      } catch (completeError) {
        console.error('❌ Failed to complete code block:', completeError.message);
      }
    }

    // Streaming cutoff guard: if response exceeds 1000 tokens, truncate and set teach_continued
    let wasTruncated = false;
    if (responseTokens > 1000) {
      console.log('⚠️ Response exceeds 1000 tokens, applying cutoff guard');
      // Find a good breaking point (end of sentence or paragraph)
      const words = fullResponse.split(' ');
      const targetWords = Math.floor(words.length * 0.7); // Keep 70%
      let truncated = words.slice(0, targetWords).join(' ');
      
      // Find last sentence end
      const lastPeriod = truncated.lastIndexOf('.');
      const lastQuestion = truncated.lastIndexOf('?');
      const lastExclaim = truncated.lastIndexOf('!');
      const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);
      
      if (lastSentence > truncated.length * 0.5) {
        truncated = truncated.substring(0, lastSentence + 1);
      }
      
      fullResponse = truncated + '\n\n_(More content available. Ask "continue" to see more.)_';
      wasTruncated = true;
    }

    // Parse and extract state from response
    let state = parseStateFromResponse(fullResponse);
    const cleanResponse = stripStateFromResponse(fullResponse);
    
    // SAFEGUARD: If no state block found, reconstruct from session
    if (!state) {
      console.log('⚠️ No state block - reconstructing from session');
      state = {
        topic: session.topic || 'General Learning',
        phase: session.phase || 'assessment',
        plan: session.plan || [],
        currentModuleId: session.currentModuleId || null,
        progress: session.progress || { overallPct: 0, modulePct: 0 },
        nextAction: 'ask'
      };
      
      // FORCE PLAN GENERATION: If we have topic but no plan, generate one
      if (state.topic && state.topic !== 'General Learning' && state.plan.length === 0 && state.phase === 'assessment') {
        console.log('🚀 Forcing plan generation for topic:', state.topic);
        
        // Generate a basic plan based on topic
        const topicPlans = {
          'JavaScript': [
            { id: 'm1', title: 'JavaScript Basics', description: 'Variables, data types, functions, and control structures', status: 'in_progress', milestones: ['Install Node.js', 'Write first program', 'Understand variables', 'Practice functions'] },
            { id: 'm2', title: 'Front-end Development', description: 'DOM manipulation, events, and front-end frameworks', status: 'locked', milestones: ['DOM basics', 'Event handling', 'Build simple app'] },
            { id: 'm3', title: 'Back-end Development', description: 'Node.js, Express, and server-side JavaScript', status: 'locked', milestones: ['Node.js basics', 'Express setup', 'Build API'] },
            { id: 'm4', title: 'Advanced Topics', description: 'Async programming, error handling, and security', status: 'locked', milestones: ['Promises/async', 'Error handling', 'Security basics'] }
          ],
          'Java': [
            { id: 'm1', title: 'Java Basics', description: 'Variables, data types, classes, and basic programming', status: 'in_progress', milestones: ['Install Java', 'Write Hello World', 'Understand classes', 'Practice OOP'] },
            { id: 'm2', title: 'Object-Oriented Programming', description: 'Inheritance, polymorphism, and design patterns', status: 'locked', milestones: ['Inheritance', 'Polymorphism', 'Design patterns'] },
            { id: 'm3', title: 'Web Development', description: 'Spring framework, REST APIs, and web applications', status: 'locked', milestones: ['Spring basics', 'REST APIs', 'Build web app'] }
          ],
          'Python': [
            { id: 'm1', title: 'Python Basics', description: 'Variables, data types, functions, and control structures', status: 'in_progress', milestones: ['Install Python', 'Write first program', 'Understand data types', 'Practice functions'] },
            { id: 'm2', title: 'Data Structures', description: 'Lists, dictionaries, sets, and algorithms', status: 'locked', milestones: ['Lists/dicts', 'Algorithms', 'Data analysis'] },
            { id: 'm3', title: 'Libraries & Frameworks', description: 'NumPy, Pandas, Flask/Django', status: 'locked', milestones: ['NumPy/Pandas', 'Web frameworks', 'Build project'] }
          ]
        };
        
        const plan = topicPlans[state.topic] || topicPlans['JavaScript'];
        state.plan = plan;
        state.phase = 'planning';
        state.nextAction = 'confirm_plan';
        state.currentModuleId = 'm1';
        
        console.log('✅ Generated plan for', state.topic, ':', plan.length, 'modules');
      } else {
        // Infer nextAction from context
        if (state.phase === 'assessment' && state.plan.length === 0) {
          state.nextAction = 'ask';
        } else if (state.phase === 'planning' || (state.plan.length > 0 && state.phase === 'assessment')) {
          state.nextAction = 'confirm_plan';
          state.phase = 'planning';
        } else if (state.phase === 'learning') {
          state.nextAction = 'teach';
        } else if (state.phase === 'quiz') {
          state.nextAction = 'submit_quiz';
        }
      }
      
      console.log('✅ Reconstructed state:', state);
    }
    
    // Confirmation detection: collapse double-confirm flows
    if (session.phase === 'plan_proposed' && message.match(/\b(start|ok|okay|sounds good|yes|go ahead|begin|move|proceed|confirm|sounds good)\b/i)) {
      console.log('🔄 Detected confirmation - forcing transition to learning');
      if (state && state.plan && state.plan.length > 0) {
        state.phase = 'learning';
        state.currentModuleId = 'm1';
        state.plan[0].status = 'in_progress';
        state.nextAction = 'teach';
        // Bump progress slightly
        if (state.progress) {
          state.progress.modulePct = Math.max(state.progress.modulePct || 0, 5);
        }
      }
    }
    
    // Milestone auto-tick heuristics
    if (state && state.phase === 'learning' && state.currentModuleId && state.plan) {
      const currentModule = state.plan.find(m => m.id === state.currentModuleId);
      if (currentModule && currentModule.milestones) {
        const completedMilestones = currentModule.completedMilestones || [];
        const nextMilestoneIdx = completedMilestones.length;
        const nextMilestone = currentModule.milestones[nextMilestoneIdx];
        
        if (nextMilestone && !completedMilestones.includes(nextMilestoneIdx)) {
          // Check for milestone completion patterns
          const userText = message.toLowerCase();
          const assistantText = cleanResponse.toLowerCase();
          
          // Generic completion patterns
          const completionPatterns = [
            /(done|completed|finished|accomplished)/i,
            /(installed|setup|configured)/i,
            /(running|executed|ran)/i,
            /(created|built|made)/i,
            /(understood|learned|got it)/i
          ];
          
          // Specific milestone patterns
          if (nextMilestone.toLowerCase().includes('install') && 
              (userText.match(/(installed|brew install|setup|pip|python --version|npm install|yarn install)/i))) {
            completedMilestones.push(nextMilestoneIdx);
            console.log('✅ Auto-ticked milestone:', nextMilestone);
          } else if (nextMilestone.toLowerCase().includes('program') && 
                     userText.match(/(print|console|output|result)/i)) {
            completedMilestones.push(nextMilestoneIdx);
            console.log('✅ Auto-ticked milestone:', nextMilestone);
          } else if (completionPatterns.some(pattern => userText.match(pattern))) {
            completedMilestones.push(nextMilestoneIdx);
            console.log('✅ Auto-ticked milestone:', nextMilestone);
          }
          
          // Update progress
          const modulePct = Math.round((completedMilestones.length / currentModule.milestones.length) * 100);
          state.progress = state.progress || {};
          state.progress.modulePct = modulePct;
          
          // Check if module is complete
          if (completedMilestones.length === currentModule.milestones.length) {
            currentModule.status = 'complete';
            state.nextAction = 'start_quiz';
            console.log('✅ Module complete, ready for quiz');
          }
        }
      }
    }
    
    // If truncated, update nextAction to teach_continued
    if (wasTruncated && state) {
      state.nextAction = 'teach_continued';
      console.log('✅ Set nextAction to teach_continued due to truncation');
    }

    // Update session with state if valid
    if (state) {
      console.log('✅ Parsed state:', state);
      
      // Check if plan is being locked (transitioning from planning to learning)
      if (state.phase === 'learning' && session.phase === 'planning') {
        console.log('🔒 Locking plan - transitioning to learning phase');
        state.planLocked = true;
      }
      
      // Prevent plan changes during learning if plan is locked
      if (session.planLocked && state.phase === 'learning') {
        console.log('🔒 Plan is locked - preserving original plan structure');
        // Keep original plan structure but allow progress updates
        const originalPlan = session.plan;
        state.plan = originalPlan.map(origModule => {
          const updatedModule = state.plan.find(m => m.id === origModule.id);
          if (updatedModule) {
            // Allow progress updates (completedMilestones, status) but not structure changes
            return {
              ...origModule, // Keep original structure
              status: updatedModule.status,
              completedMilestones: updatedModule.completedMilestones || origModule.completedMilestones
            };
          }
          return origModule;
        });
      }
      
      // Check if plan needs extension
      if (state.needsPlanExtension) {
        console.log('🔄 Plan needs extension, requesting model to extend');
        
        // Create a follow-up request to extend the plan
        const extendMessage = `Please create a complete learning plan with 3-6 modules, each having 3-6 concrete milestones. Topic: ${state.topic}. Make sure to include specific, actionable milestones for each module.`;
        
        try {
          // Get system prompt for plan extension
          const systemMessage = srlSystemPrompt(session, extendMessage);
          
          // Call Groq API to extend the plan
          const extendResponse = await groq.chat.completions.create({
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: extendMessage }
            ],
            model: "llama-3.1-70b-versatile",
            max_tokens: 256,
            temperature: 0.3
          });
          
          const extendedReply = extendResponse.choices[0].message.content;
          console.log('✅ Extended plan response received');
          
          // Parse the extended state
          const extendedState = parseStateFromResponse(extendedReply);
          if (extendedState && !extendedState.needsPlanExtension) {
            console.log('✅ Plan successfully extended:', extendedState.plan.length, 'modules');
            state = extendedState; // Use the extended state
          } else {
            console.log('⚠️ Plan extension failed, using original state');
          }
        } catch (extendError) {
          console.error('❌ Plan extension failed:', extendError.message);
          // Continue with original state
        }
      }
      
      // Server safeguard: Detect stuck planning and force teaching transition
      const userJustConfirmed = /\b(ok(ay)?|sounds good|go ahead|start|yes|ready)\b/i.test(message);
      
      // If the model finished a plan but didn't start teaching:
      const planningStuck = 
        state && (state.phase === 'planning' || state.phase === 'assessment') &&
        state.plan?.length >= 3 && userJustConfirmed;
      
      // If the model *claims* it's learning but gave no actionable micro-exercise:
      const learningButNoAction = 
        state && state.phase === 'learning' && (state.nextAction === 'ask' || !state.nextAction);
      
      // If either, do a cheap follow-up call to force teaching
      if (planningStuck || learningButNoAction) {
        console.log('🔄 Detected stuck planning/learning, forcing teaching transition');
        
        const startPrompt = `You already created a complete plan. The user confirmed to begin.
Now produce the FIRST TEACHING TURN for the current module (<=6 lines),
end with ONE micro-exercise line, and append a valid \`\`\`state block.

Rules:
- phase must be "learning"
- plan[0].status must be "in_progress"
- set currentModuleId to the first module id (e.g., "m1") if null
- set nextAction to "mini_exercise"
Return both the short teaching text and the state block.`;

        try {
          const systemMessage = srlSystemPrompt(session, startPrompt);
          const startResponse = await groq.chat.completions.create({
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: startPrompt }
            ],
            model: "llama-3.1-70b-versatile",
            max_tokens: 220,
            temperature: 0.4
          });
          
          const startReply = startResponse.choices[0].message.content;
          console.log('✅ Forced teaching response received');
          
          // Parse the teaching state
          const teachState = parseStateFromResponse(startReply);
          const teachText = stripStateFromResponse(startReply);
          
          if (teachState) {
            console.log('✅ Teaching transition successful:', teachState.phase);
            // Replace the previous "we will start..." assistant message with the actual lesson
            cleanResponse = teachText;
            state = teachState;
          }
        } catch (teachError) {
          console.error('❌ Forced teaching failed:', teachError.message);
          // Continue with original state
        }
      }
      
      await updateSessionWithState(session._id, state);
    } else {
      console.log('⚠️ No valid state found in response - keeping prior state');
      // Don't surface error to user, just log it
    }

    // Save assistant message (clean version without state)
    const assistantLog = new ChatLog({
      sessionId: session._id,
      message: cleanResponse,
      isUser: false,
      type: 'text',
      topic: session.topic,
      stage: session.stage || 1,
      phase: currentPhase,
      moduleId: session.currentModuleId,
      stateDelta: state,
      aiModel: 'llama-3.3-70b-versatile'
    });
    
    try {
      await assistantLog.save();
      console.log('✅ Assistant message saved');
    } catch (dbError) {
      console.error('❌ Database error saving assistant message:', dbError);
      // Don't fail the request if we can't save the log
    }

    clearTimeout(timeout);
    res.json({ 
      sessionId: session._id, 
      reply: cleanResponse
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    clearTimeout(timeout);
    res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.',
      sessionId: sessionId || null
    });
  }
});

// SRL Endpoints

// GET /session/state - Get canonical state for UI
app.get('/session/state', async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const state = {
      topic: session.topic || 'General Learning',
      phase: session.phase || 'assessment',
      plan: session.plan || [],
      currentModuleId: session.currentModuleId || null,
      progress: session.progress || { overallPct: 0, modulePct: 0 },
      nextAction: 'ask', // Default action
      planLocked: session.planLocked || false
    };

    res.json(state);
  } catch (error) {
    console.error('❌ Session state error:', error);
    res.status(500).json({ error: 'Failed to get session state' });
  }
});

// POST /quiz/submit - Submit quiz answers and grade
app.post('/quiz/submit', async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    
    if (!sessionId || !answers) {
      return res.status(400).json({ error: 'sessionId and answers are required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.quiz || !session.quiz.items || session.quiz.submitted) {
      return res.status(400).json({ error: 'No active quiz found' });
    }

    // Grade the quiz
    let score = 0;
    let totalQuestions = session.quiz.items.length;
    let correctAnswers = 0;

    for (const answer of answers) {
      const question = session.quiz.items.find(q => q.id === answer.itemId);
      if (question) {
        if (question.type === 'mcq') {
          if (answer.value === question.answerKey) {
            correctAnswers++;
          }
        } else if (question.type === 'short') {
          // For short answers, use AI to grade
          try {
            const gradingResponse = await groq.chat.completions.create({
              model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
              messages: [
                {
                  role: 'system',
                  content: `You are grading a short answer question. Compare the student's answer with the correct answer and determine if they are equivalent. Be generous with partial credit. Return only "correct" or "incorrect".`
                },
                {
                  role: 'user',
                  content: `Question: ${question.stem}\nCorrect Answer: ${question.answerKey}\nStudent Answer: ${answer.value}\n\nIs the student's answer correct?`
                }
              ],
              max_tokens: 10,
              temperature: 0.1
            });

            const gradingResult = gradingResponse.choices[0].message.content.trim().toLowerCase();
            if (gradingResult.includes('correct')) {
              correctAnswers++;
            }
          } catch (gradingError) {
            console.error('Grading error:', gradingError);
            // Default to incorrect if grading fails
          }
        }
      }
    }

    score = Math.round((correctAnswers / totalQuestions) * 100);
    const passed = score >= 70;

    // Update quiz state
    session.quiz.submitted = true;
    session.quiz.score = score;
    session.quiz.passed = passed;

    if (passed) {
      // Mark current module as complete
      const currentModule = session.plan.find(m => m.id === session.currentModuleId);
      if (currentModule) {
        currentModule.status = 'complete';
        currentModule.completedAt = new Date();
      }

      // Unlock next module
      const nextModule = session.plan.find(m => m.status === 'locked');
      if (nextModule) {
        nextModule.status = 'in_progress';
        session.currentModuleId = nextModule.id;
        session.progress.modulePct = 0;
        session.phase = 'learning'; // Return to learning phase
      } else {
        // All modules complete
        session.phase = 'complete';
        session.progress.overallPct = 100;
      }

      // Update overall progress
      const completedModules = session.plan.filter(m => m.status === 'complete').length;
      session.progress.overallPct = Math.round((completedModules / session.plan.length) * 100);
    } else {
      // Quiz failed - go to feedback phase
      session.phase = 'feedback';
    }

    await session.save();

    res.json({
      passed,
      score,
      nextModuleId: session.currentModuleId,
      overallProgress: session.progress.overallPct
    });

  } catch (error) {
    console.error('❌ Quiz submit error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// Session Summary Route
app.post('/session/summary', async (req, res) => {
  try {
    const { sessionId } = req.body;

    // Validate sessionId
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Load StudySession
    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Load ChatLogs for the session
    const chatLogs = await ChatLog.find({ sessionId: session._id })
      .sort({ timestamp: 1 });

    if (chatLogs.length === 0) {
      return res.status(400).json({ error: 'No messages found for session' });
    }

    // Build transcript
    const transcript = chatLogs.map(log => {
      const speaker = log.isUser ? 'User' : 'Assistant';
      return `${speaker}: ${log.message}`;
    }).join('\n');

    // Call Groq for summary
    const summaryResponse = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a study summarizer. Produce ≤10 concise bullet points of key ideas, then a "Next steps" section with 2–3 targeted actions. Keep ≤300 words.'
        },
        {
          role: 'user',
          content: `Please summarize this study session:\n\n${transcript}`
        }
      ],
      max_tokens: 400,
      temperature: 0.3
    });

    const summary = summaryResponse.choices[0].message.content.trim();

    // Save summary to session
    session.sessionSummary = summary;
    await session.save();

    res.json({
      sessionId: session._id.toString(),
      summary: summary
    });

  } catch (error) {
    console.error('Session summary error:', error);
    res.status(500).json({ 
      error: 'Failed to generate session summary. Check logs for details.' 
    });
  }
});

// Get recent sessions
app.get('/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const sessions = await StudySession.find({})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('_id createdAt updatedAt topic stage')
      .lean();

    // Get last message for each session
    const sessionsWithLastMessage = await Promise.all(
      sessions.map(async (session) => {
        const lastMessage = await ChatLog.findOne({ sessionId: session._id })
          .sort({ timestamp: -1 })
          .select('message isUser timestamp')
          .lean();
        
        return {
          id: session._id.toString(),
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          topic: session.topic || 'General Learning',
          stage: session.stage || 1,
          lastMessage: lastMessage ? {
            text: lastMessage.message.substring(0, 100) + (lastMessage.message.length > 100 ? '...' : ''),
            isUser: lastMessage.isUser,
            timestamp: lastMessage.timestamp
          } : null
        };
      })
    );

    res.json({ sessions: sessionsWithLastMessage });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// Update session stage
app.patch('/session/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    if (!stage || stage < 1 || stage > 4) {
      return res.status(400).json({ error: 'Stage must be between 1 and 4' });
    }

    const session = await StudySession.findByIdAndUpdate(
      id,
      { stage: parseInt(stage), updatedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ 
      id: session._id.toString(),
      stage: session.stage,
      updatedAt: session.updatedAt
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Update session notes
app.patch('/session/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'Notes must be a string' });
    }

    const session = await StudySession.findByIdAndUpdate(
      id,
      { notes: notes.trim(), updatedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ 
      id: session._id.toString(),
      notes: session.notes,
      updatedAt: session.updatedAt
    });
  } catch (error) {
    console.error('Update notes error:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// Get session details
app.get('/session/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await StudySession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Return milestones as object
    const milestonesObj = session.milestones || {};

    res.json({
      id: session._id.toString(),
      topic: session.topic,
      stage: session.stage,
      stageConfidence: session.stageConfidence,
      stageHistory: session.stageHistory,
      milestones: milestonesObj,
      notes: session.notes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// Assessment endpoint
app.post('/assess', async (req, res) => {
  try {
    const { message, topic = 'General Learning', historySessionId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Load conversation history if sessionId provided
    let history = [];
    if (historySessionId) {
      try {
        history = await ChatLog.find({ sessionId: historySessionId })
          .sort({ timestamp: 1 })
          .limit(10)
          .lean();
      } catch (dbError) {
        console.error('Error loading history for assessment:', dbError);
        // Continue without history
      }
    }

    // Create assessment prompt
    const assessmentPrompt = `Analyze this learner's message and conversation history to determine their learning stage (1-4).

Message: "${message}"
Topic: "${topic}"
${history.length > 0 ? `\nConversation History:\n${history.map(h => `${h.isUser ? 'User' : 'Assistant'}: ${h.message}`).join('\n')}` : ''}

Based on the assessment rubric, determine:
1. Stage (1-4): Unconscious Incompetence, Conscious Incompetence, Conscious Competence, or Unconscious Competence
2. Confidence (0-1): How confident you are in this assessment
3. Rationale: Brief explanation of your assessment

Return as JSON:
{
  "stage": 1-4,
  "confidence": 0.0-1.0,
  "rationale": "Explanation of assessment"
}`;

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert learning assessment AI. Analyze learner messages and conversation history to determine their current learning stage based on established rubrics. Always return valid JSON.'
        },
        {
          role: 'user',
          content: assessmentPrompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const content = response.choices[0].message.content.trim();
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in assessment response');
    }

    const assessment = JSON.parse(jsonMatch[0]);
    
    // Validate assessment
    if (!assessment.stage || assessment.stage < 1 || assessment.stage > 4) {
      assessment.stage = 1;
    }
    if (!assessment.confidence || assessment.confidence < 0 || assessment.confidence > 1) {
      assessment.confidence = 0.5;
    }
    if (!assessment.rationale) {
      assessment.rationale = 'Assessment completed based on message analysis';
    }

    res.json(assessment);

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ 
      error: 'Assessment failed. Check logs for details.',
      stage: 1,
      confidence: 0.5,
      rationale: 'Default assessment due to error'
    });
  }
});


// Streaming Chat Route
app.post('/chat/stream', async (req, res) => {
  console.log('🚀 Starting streaming chat request');
  
  // Set SSE headers and flush immediately
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  
  // Flush headers immediately
  res.flushHeaders();
  
  // Send ready signal immediately
  res.write('data: {"ready":true}\n\n');

  let isStreaming = true;
  let assistantMessage = '';
  let tokenTimeout = null;
  let firstTokenReceived = false;

  // Handle client disconnect
  req.on('close', () => {
    console.log('❌ Client disconnected from stream');
    isStreaming = false;
    if (tokenTimeout) clearTimeout(tokenTimeout);
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    if (isStreaming) {
      res.write('data: {"ping":true}\n\n');
    }
  }, 15000);

  // Set timeout for no tokens
  const setTokenTimeout = () => {
    if (tokenTimeout) clearTimeout(tokenTimeout);
    tokenTimeout = setTimeout(() => {
      if (isStreaming && !firstTokenReceived) {
        console.log('⏰ Stream timeout - no tokens received');
        res.write('data: {"error":"stream-timeout"}\n\n');
        res.end();
        isStreaming = false;
      }
    }, 30000); // 30 second timeout
  };

  try {
    const { message, stage = 1, sessionId: clientSessionId } = req.body;

    // Validate message
    if (!message || message.trim() === '') {
      res.write('data: {"error":"Message is required"}\n\n');
      res.end();
      return;
    }

    // Find or create StudySession
    let session;
    if (clientSessionId) {
      session = await StudySession.findById(clientSessionId);
    }
    if (!session) {
      session = new StudySession({ topic: 'General Learning', stage: stage });
      await session.save();
    }

    // Save user message
    const userLog = new ChatLog({
      sessionId: session._id,
      message: message.trim(),
      isUser: true,
      type: 'text',
      topic: session.topic,
      stage: stage,
      aiModel: 'llama-3.3-70b-versatile',
    });
    await userLog.save();

    // Load previous chat history (limit to last 20 messages to control tokens)
    const history = await ChatLog.find({ sessionId: session._id })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 });

    // Format messages for Groq API
    const systemPrompt = getSystemPrompt("Generate a summary of this study session", stage);
    const messages = [systemPrompt];
    history.forEach(entry => {
      messages.push({
        role: entry.isUser ? 'user' : 'assistant',
        content: entry.message
      });
    });

    console.log('📡 Calling Groq with streaming...');
    console.log('📝 Messages being sent to Groq:', JSON.stringify(messages, null, 2));
    
    // Set token timeout
    setTokenTimeout();

    try {
      console.log('📡 Calling Groq with streaming...');

      // Call Groq with streaming
      const stream = await groq.chat.completions.create({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
        stream: true
      });

      console.log('✅ Groq stream created successfully');

      // Stream tokens to client
      console.log('🔄 Starting to iterate over Groq stream...');
      
      // Use a different approach to handle the stream
      const processStream = async () => {
        try {
          for await (const chunk of stream) {
            console.log('📦 Received chunk:', JSON.stringify(chunk, null, 2));
            
            if (!isStreaming) {
              console.log('🛑 Stream cancelled by client disconnect');
              break; // Client disconnected
            }

            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              if (!firstTokenReceived) {
                console.log('✅ First token received:', content);
                firstTokenReceived = true;
                if (tokenTimeout) clearTimeout(tokenTimeout);
              }
              
              assistantMessage += content;
              console.log('📤 Sending token to client:', content);
              res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
            } else {
              console.log('⚠️ No content in chunk');
            }
          }
        } catch (streamError) {
          console.error('❌ Stream processing error:', streamError);
          throw streamError;
        }
      };
      
      await processStream();
      console.log('✅ Groq stream completed');
      
    } catch (groqError) {
      console.error('❌ Groq streaming error:', groqError);
      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ error: "Groq streaming failed: " + groqError.message })}\n\n`);
      }
      return;
    }

    // Save complete assistant message
    if (isStreaming && assistantMessage.trim()) {
      console.log('💾 Saving assistant message to database');
      const assistantLog = new ChatLog({
        sessionId: session._id,
        message: assistantMessage.trim(),
        isUser: false,
        type: 'text',
        topic: session.topic,
        stage: stage,
        aiModel: 'llama-3.3-70b-versatile',
      });
      await assistantLog.save();

      // Send final frame
      res.write(`data: ${JSON.stringify({ done: true, sessionId: session._id, final: assistantMessage.trim() })}\n\n`);
      console.log('✅ Stream completed successfully');
    }
    
    // End the response
    if (isStreaming) {
      res.end();
    }

  } catch (error) {
    console.error('❌ Streaming chat error:', error);
    if (isStreaming) {
      res.write(`data: ${JSON.stringify({ error: "Streaming failed. Check logs for details." })}\n\n`);
    }
  } finally {
    clearInterval(heartbeatInterval);
    if (tokenTimeout) clearTimeout(tokenTimeout);
    if (isStreaming) {
      res.end();
    }
  }
});

// New Assessment and Quiz Endpoints

// POST /assessment - Initial assessment for first message
app.post('/assessment', async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body;

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return res.status(400).json({ error: 'User message is required' });
    }

    // Load session if provided
    let session = null;
    let chatHistory = [];
    
    if (sessionId) {
      session = await StudySession.findById(sessionId);
      if (session) {
        chatHistory = await ChatLog.find({ sessionId })
          .sort({ timestamp: 1 })
          .limit(10)
          .lean();
      }
    }

    // Use assessment prompt from systemPrompt.js
    const { assessmentPrompt } = getSystemPrompt;
    const assessmentMessages = [
      assessmentPrompt(userMessage, chatHistory.map(h => ({
        role: h.isUser ? 'user' : 'assistant',
        content: h.message
      })))
    ];

    // Call Groq for assessment
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });

    const assessment = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: assessmentMessages,
      max_tokens: 500,
      temperature: 0.3
    });

    const content = assessment.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from assessment');
    }

    const assessmentResult = JSON.parse(jsonMatch[0]);
    
    // Create or update session
    if (!session) {
      session = new StudySession({
        topic: 'General Learning',
        currentStage: assessmentResult.stage,
        stageConfidence: assessmentResult.confidence,
        lastAssessmentAt: new Date(),
        milestonesStatus: assessmentResult.recommendedMilestones.reduce((acc, milestone, index) => {
          acc[`M${index + 1}`] = 'todo';
          return acc;
        }, {})
      });
      await session.save();
    } else {
      session.currentStage = assessmentResult.stage;
      session.stageConfidence = assessmentResult.confidence;
      session.lastAssessmentAt = new Date();
      session.milestonesStatus = assessmentResult.recommendedMilestones.reduce((acc, milestone, index) => {
        acc[`M${index + 1}`] = 'todo';
        return acc;
      }, {});
      await session.save();
    }

    res.json({
      sessionId: session._id.toString(),
      stage: assessmentResult.stage,
      confidence: assessmentResult.confidence,
      rationale: assessmentResult.rationale,
      milestones: assessmentResult.recommendedMilestones
    });

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ error: 'Assessment failed' });
  }
});

// POST /assessment/recheck - Re-assessment based on recent conversation
app.post('/assessment/recheck', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get recent chat history
    const chatHistory = await ChatLog.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    if (chatHistory.length === 0) {
      return res.status(400).json({ error: 'No conversation history found' });
    }

    // Use recent messages for re-assessment
    const recentMessages = chatHistory.slice(0, 5).reverse();
    const contextMessage = recentMessages.map(msg => 
      `${msg.isUser ? 'User' : 'Assistant'}: ${msg.message}`
    ).join('\n');

    const { assessmentPrompt } = getSystemPrompt;
    const assessmentMessages = [
      assessmentPrompt(contextMessage, recentMessages.map(h => ({
        role: h.isUser ? 'user' : 'assistant',
        content: h.message
      })))
    ];

    // Call Groq for re-assessment
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });

    const assessment = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: assessmentMessages,
      max_tokens: 500,
      temperature: 0.3
    });

    const content = assessment.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from re-assessment');
    }

    const assessmentResult = JSON.parse(jsonMatch[0]);
    
    // Update session
    session.currentStage = assessmentResult.stage;
    session.stageConfidence = assessmentResult.confidence;
    session.lastAssessmentAt = new Date();
    session.eligibleForQuiz = assessmentResult.stage > session.currentStage;
    await session.save();

    res.json({
      sessionId: session._id.toString(),
      stage: assessmentResult.stage,
      confidence: assessmentResult.confidence,
      rationale: assessmentResult.rationale,
      eligibleForQuiz: session.eligibleForQuiz
    });

  } catch (error) {
    console.error('Re-assessment error:', error);
    res.status(500).json({ error: 'Re-assessment failed' });
  }
});


// POST /quiz/submit - Submit quiz answers

// POST /stage/promote - Promote to next stage after passing quiz
app.post('/stage/promote', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if there's a passed quiz
    const passedQuiz = await Quiz.findOne({
      sessionId: session._id,
      passed: true,
      completedAt: { $exists: true }
    }).sort({ completedAt: -1 });

    if (!passedQuiz) {
      return res.status(400).json({ error: 'No passed quiz found for promotion' });
    }

    // Promote to next stage
    const oldStage = session.currentStage;
    const newStage = Math.min(oldStage + 1, 4);

    session.currentStage = newStage;
    session.stageHistory.push({
      from: oldStage,
      to: newStage,
      at: new Date(),
      reason: `Promoted after passing quiz (${passedQuiz.score}%)`
    });

    // Reset milestones for new stage
    session.milestonesStatus = {};
    session.eligibleForQuiz = false;

    await session.save();

    res.json({
      sessionId: session._id.toString(),
      oldStage,
      newStage,
      stageHistory: session.stageHistory
    });

  } catch (error) {
    console.error('Stage promotion error:', error);
    res.status(500).json({ error: 'Failed to promote stage' });
  }
});

// Debug SSE endpoint for testing
app.get('/debug/sse', (req, res) => {
  console.log('🔧 Debug SSE endpoint called');
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  
  res.flushHeaders();
  
  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    res.write(`data: ${JSON.stringify({ counter, timestamp: new Date().toISOString() })}\n\n`);
    
    if (counter >= 10) {
      clearInterval(interval);
      res.write(`data: ${JSON.stringify({ done: true, message: "Debug stream completed" })}\n\n`);
      res.end();
    }
  }, 300);
  
  req.on('close', () => {
    console.log('🔧 Debug SSE client disconnected');
    clearInterval(interval);
  });
});

// New structured learning routes

// POST /detect-learning-intent - Detect if user wants to learn something
app.post('/detect-learning-intent', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Use AI to detect learning intent
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an expert at detecting learning intent in user messages. Analyze if the user wants to learn something new and extract the topic they want to learn about.

**Instructions:**
- Determine if the user wants to learn something (not just asking questions)
- Extract the specific topic/subject they want to learn about
- Consider various ways people express learning intent: "I want to learn X", "Teach me about Y", "I need to understand Z", "How does X work?", "What is Y?", "Explain Z to me", "I'm curious about...", "I don't understand...", "Can you help me with...", etc.
- Be generous in detecting learning intent - this is a learning-focused chat system
- Even simple questions like "What is X?" often indicate learning intent
- Focus on the underlying desire to gain knowledge or understanding

**Return JSON only:**
{
  "wantsToLearn": true/false,
  "topic": "extracted topic or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

**User Message:** "${message}"`
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    const content = response.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      res.json(result);
    } else {
      // Fallback to simple detection
      const learningKeywords = ['learn', 'teach', 'study', 'understand', 'know about', 'explain', 'help me with', 'how does', 'what is', 'can you show me'];
      const wantsToLearn = learningKeywords.some(keyword => 
        message.toLowerCase().includes(keyword)
      );
      
      res.json({
        wantsToLearn,
        topic: wantsToLearn ? 'General Learning' : null,
        confidence: wantsToLearn ? 0.7 : 0.3,
        reasoning: 'Fallback keyword detection'
      });
    }

  } catch (error) {
    console.error('Learning intent detection error:', error);
    
    // Fallback to simple keyword detection
    const learningKeywords = ['learn', 'teach', 'study', 'understand', 'know about', 'explain', 'help me with', 'how does', 'what is', 'can you show me'];
    const wantsToLearn = learningKeywords.some(keyword => 
      req.body.message.toLowerCase().includes(keyword)
    );
    
    res.json({
      wantsToLearn,
      topic: wantsToLearn ? 'General Learning' : null,
      confidence: wantsToLearn ? 0.7 : 0.3,
      reasoning: 'Error fallback detection'
    });
  }
});

// POST /preassessment - Run pre-assessment for new learning sessions
app.post('/preassessment', async (req, res) => {
  try {
    const { topic, message, sessionId } = req.body;

    if (!topic || !message) {
      return res.status(400).json({ error: 'Topic and message are required' });
    }

    // Get or create session
    let session;
    if (sessionId) {
      session = await StudySession.findById(sessionId);
    }
    
    if (!session) {
      session = new StudySession({ 
        topic: topic,
        preAssessmentComplete: false,
        learningPlan: []
      });
      await session.save();
    }

    // Use pre-assessment prompt
    const systemPrompt = getSystemPrompt.preAssessmentPrompt(topic, message);
    
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [systemPrompt],
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = response.choices[0].message.content.trim();

    // Save the conversation
    const userLog = new ChatLog({
      sessionId: session._id,
      message: message.trim(),
      isUser: true,
      type: 'text',
      topic: session.topic
    });
    await userLog.save();

    const assistantLog = new ChatLog({
      sessionId: session._id,
      message: reply,
      isUser: false,
      type: 'text',
      topic: session.topic
    });
    await assistantLog.save();

    res.json({
      sessionId: session._id.toString(),
      reply: reply,
      topic: session.topic
    });

  } catch (error) {
    console.error('Pre-assessment error:', error);
    res.status(500).json({ error: 'Failed to run pre-assessment' });
  }
});

// POST /learning-plan - Generate learning plan after pre-assessment
app.post('/learning-plan', async (req, res) => {
  try {
    const { sessionId, learningGoal, priorKnowledge, learningStyle } = req.body;

    if (!sessionId || !learningGoal || !priorKnowledge || !learningStyle) {
      return res.status(400).json({ error: 'All pre-assessment fields are required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Use learning plan prompt
    const systemPrompt = getSystemPrompt.learningPlanPrompt(
      session.topic, 
      learningGoal, 
      priorKnowledge, 
      learningStyle
    );

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [systemPrompt],
      max_tokens: 1000,
      temperature: 0.5
    });

    const content = response.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to generate valid learning plan' });
    }

    const learningPlanData = JSON.parse(jsonMatch[0]);
    
    // Update session with learning plan and pre-assessment data
    session.learningGoal = learningGoal;
    session.priorKnowledge = priorKnowledge;
    session.learningStyle = learningStyle;
    session.preAssessmentComplete = true;
    session.learningPlan = learningPlanData.learningPlan;
    
    // Set first module as in_progress
    if (session.learningPlan.length > 0) {
      session.learningPlan[0].status = 'in_progress';
      session.currentModule = session.learningPlan[0].moduleId;
      session.moduleProgress = 0;
    }

    await session.save();

    res.json({
      sessionId: session._id.toString(),
      learningPlan: session.learningPlan,
      currentModule: session.currentModule,
      moduleProgress: session.moduleProgress
    });

  } catch (error) {
    console.error('Learning plan generation error:', error);
    res.status(500).json({ error: 'Failed to generate learning plan' });
  }
});

// GET /plan/:sessionId - Get learning plan for a session
app.get('/plan/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session._id.toString(),
      topic: session.topic,
      learningGoal: session.learningGoal,
      priorKnowledge: session.priorKnowledge,
      learningStyle: session.learningStyle,
      preAssessmentComplete: session.preAssessmentComplete,
      learningPlan: session.learningPlan,
      currentModule: session.currentModule,
      moduleProgress: session.moduleProgress,
      moduleHistory: session.moduleHistory
    });

  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({ error: 'Failed to get learning plan' });
  }
});

// PATCH /session/:id/module - Update module status
app.patch('/session/:id/module', async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleId, status, progress, quizScore } = req.body;

    if (!moduleId || !status) {
      return res.status(400).json({ error: 'Module ID and status are required' });
    }

    const session = await StudySession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update module status
    const moduleIndex = session.learningPlan.findIndex(m => m.moduleId === moduleId);
    if (moduleIndex === -1) {
      return res.status(404).json({ error: 'Module not found' });
    }

    session.learningPlan[moduleIndex].status = status;
    
    if (status === 'complete') {
      session.learningPlan[moduleIndex].completedAt = new Date();
      
      // Update module history
      const existingHistory = session.moduleHistory.find(h => h.moduleId === moduleId);
      if (existingHistory) {
        existingHistory.completedAt = new Date();
        existingHistory.quizScore = quizScore || existingHistory.quizScore;
      } else {
        session.moduleHistory.push({
          moduleId: moduleId,
          completedAt: new Date(),
          quizScore: quizScore
        });
      }

      // Unlock next module
      if (moduleIndex + 1 < session.learningPlan.length) {
        session.learningPlan[moduleIndex + 1].status = 'in_progress';
        session.currentModule = session.learningPlan[moduleIndex + 1].moduleId;
        session.moduleProgress = 0;
      } else {
        // All modules completed
        session.isComplete = true;
        session.currentModule = null;
      }
    } else if (status === 'in_progress') {
      session.currentModule = moduleId;
      session.moduleProgress = progress || 0;
    }

    await session.save();

    res.json({
      sessionId: session._id.toString(),
      learningPlan: session.learningPlan,
      currentModule: session.currentModule,
      moduleProgress: session.moduleProgress,
      isComplete: session.isComplete
    });

  } catch (error) {
    console.error('Module update error:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// POST /quiz/start - Start quiz for current module
app.post('/quiz/start', async (req, res) => {
  try {
    const { sessionId, moduleId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await StudySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const targetModuleId = moduleId || session.currentModule;
    if (!targetModuleId) {
      return res.status(400).json({ error: 'No current module or module ID provided' });
    }

    const module = session.learningPlan.find(m => m.moduleId === targetModuleId);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Generate quiz for the module
    const quiz = await generateQuiz(session.topic, module.title, module.objectives);

    // Save quiz to database
    const quizDoc = new Quiz({
      sessionId: session._id,
      moduleId: targetModuleId,
      questions: quiz.questions,
      topic: session.topic,
      moduleTitle: module.title
    });

    await quizDoc.save();

    // Update session
    session.pendingQuizId = quizDoc._id;
    session.eligibleForQuiz = true;
    await session.save();

    res.json({
      quizId: quizDoc._id.toString(),
      sessionId: session._id.toString(),
      moduleId: targetModuleId,
      moduleTitle: module.title,
      questions: quiz.questions,
      totalQuestions: quiz.questions.length
    });

  } catch (error) {
    console.error('Quiz start error:', error);
    res.status(500).json({ error: 'Failed to start quiz' });
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
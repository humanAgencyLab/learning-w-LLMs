import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Confetti from 'react-confetti';
import QuizOverlay from '../components/quiz/QuizOverlay';
import useSessionStore from '../state/sessionStore';
import * as sessionApi from '../lib/sessionApi';
import Loader from '../components/Loader';
import MessageContent from '../components/chat/MessageContent';

function ChatInterface() {
  // Session store
  const {
    sessionId,
    mode: learningStyle,
    model,
    topic,
    chatTitle,
    phase,
    plan,
    activeModuleId,
    quizDraft,
    isViewOnly,
    points,
    gems,
    progressPct,
    meta,
    setLearningStyle,
    setModel,
    sendChatMessage,
    startAssessment,
    approvePlan,
    modifyPlan,
    messages: sessionMessagesRaw,
    totalMessageCount,
    hasMoreMessages,
    loading,
    error,
    createSession,
    resumeSessionFromServer,
    clearError,
    appendMessage,
    removeLastAssistantMessage,
    startRevisionQuiz,
    startQuizFromChat,
    courseId
  } = useSessionStore();
  const isCourseSession = !!courseId;
  const sessionMessages = Array.isArray(sessionMessagesRaw) ? sessionMessagesRaw : [];
  const mightHaveMoreMessages = hasMoreMessages || (sessionMessages.length === 20 && totalMessageCount == null);
  const [inputValue, setInputValue] = useState('');
  const [modificationRequest, setModificationRequest] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [expandedModules, setExpandedModules] = useState(new Set([0])); // Expand first module by default
  const [composerHeight, setComposerHeight] = useState(56); // Track composer height for spacing
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const textareaRef = useRef(null);
  const preSurfaceTextareaRef = useRef(null);
  const messageListRef = useRef(null);
  const LOAD_OLDER_THROTTLE_MS = 600;
  const scrollRestoreBeforePrepend = useRef(null);
  const skipNextScrollToBottom = useRef(false);
  const loadOlderThrottleAt = useRef(0);
  const topSentinelRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const prevLoadingRef = useRef(loading);
  const didAutoStartRef = useRef({ sessionId: null, did: false });
  
  // Detect predefined messages in last assistant response and generate chips
  const getActionChips = useCallback(() => {
    const chips = [];
    
    // Check if all milestones in current module are completed - show "Start Quiz" chip
    // Only show for STUDY mode, not revision mode
    if (learningStyle === 'studying' && activeModuleId && plan && plan.length > 0) {
      const activeModule = plan.find(m => m.id === activeModuleId);
      if (activeModule && activeModule.milestones && activeModule.milestones.length > 0) {
        const allMilestonesCompleted = activeModule.milestones.every(m => m.completed === true);
        if (allMilestonesCompleted && phase === 'learning') {
          chips.push({
            label: 'Start Quiz',
            action: async () => {
              try {
                console.log('Start Quiz button clicked', { activeModuleId, phase });
                // This is a STUDY quiz - use startQuizFromChat
                const result = await startQuizFromChat(activeModuleId);
                console.log('Start Quiz result', { hasQuestions: !!result?.questions, questionCount: result?.questions?.length });
                if (!result?.questions || result.questions.length === 0) {
                  setToast({ type: 'error', message: 'Quiz was not generated. Please try again.' });
                }
              } catch (err) {
                console.error('Start Quiz error', err);
                setToast({ type: 'error', message: err.message || 'Failed to start quiz' });
              }
            }
          });
        }
      }
    }
    
    if (sessionMessages.length === 0) return chips;
    
    const lastMessage = sessionMessages[sessionMessages.length - 1];
    if (lastMessage.role !== 'assistant') return chips;

    // Pilot B3: content can be undefined on a malformed/in-flight message —
    // never let the chips memo crash the whole chat render.
    const content = String(lastMessage.content || '').toLowerCase();
    
    // Check for "start quiz" or similar phrases in message content (fallback)
    // Only show for STUDY mode, not revision mode
    if ((content.includes('start quiz') || content.includes('begin quiz') || content.includes('take quiz') || content.includes('ready for quiz')) && learningStyle === 'studying') {
      // Only add if not already present from milestone completion check
      if (!chips.find(c => c.label === 'Start Quiz')) {
        chips.push({
          label: 'Start Quiz',
          action: async () => {
            try {
              console.log('Start Quiz button clicked (fallback)', { activeModuleId, phase });
              if (activeModuleId) {
                // This is a STUDY quiz - use startQuizFromChat
                const result = await startQuizFromChat(activeModuleId);
                console.log('Start Quiz result (fallback)', { hasQuestions: !!result?.questions, questionCount: result?.questions?.length });
                if (!result?.questions || result.questions.length === 0) {
                  setToast({ type: 'error', message: 'Quiz was not generated. Please try again.' });
                }
              } else {
                await sendChatMessage('start quiz');
              }
            } catch (err) {
              console.error('Start Quiz error (fallback)', err);
              setToast({ type: 'error', message: err.message || 'Failed to start quiz' });
            }
          }
        });
      }
    }
    
    // Check for "restart revision" or similar phrases
    if (content.includes('restart revision') || content.includes('revise again') || content.includes('redo revision')) {
      chips.push({
        label: 'Restart Revision',
        action: async () => {
          try {
            if (topic) {
              await startRevisionQuiz(topic);
            } else {
              await sendChatMessage('restart revision');
            }
          } catch (err) {
            setToast({ type: 'error', message: err.message || 'Failed to restart revision' });
          }
        }
      });
    }
    
    // Check for "continue" or "next module" phrases
    if (content.includes('continue') && (content.includes('next module') || content.includes('next lesson'))) {
      chips.push({
        label: 'Continue to Next Module',
        action: async () => {
          try {
            await sendChatMessage('continue');
          } catch (err) {
            setToast({ type: 'error', message: err.message || 'Failed to continue' });
          }
        }
      });
    }
    
    // Check for "retry" or "try again" phrases
    if (content.includes('retry') || content.includes('try again') || content.includes('redo')) {
      chips.push({
        label: 'Try Again',
        action: async () => {
          try {
            await sendChatMessage('try again');
          } catch (err) {
            setToast({ type: 'error', message: err.message || 'Failed to retry' });
          }
        }
      });
    }
    
    // Check for "ready" phrase - user should say 'ready' to continue
    if (content.includes('say \'ready\'') || content.includes("say 'ready'") || content.includes('say "ready"') || 
        (content.includes('ready') && content.includes('when you are ready'))) {
      chips.push({
        label: 'Ready',
        action: async () => {
          try {
            await sendChatMessage('ready');
          } catch (err) {
            setToast({ type: 'error', message: err.message || 'Failed to continue' });
          }
        }
      });
    }
    
    return chips;
  }, [sessionMessages, activeModuleId, topic, learningStyle, phase, plan, startQuizFromChat, startRevisionQuiz, sendChatMessage]);
  
  const actionChips = getActionChips();
  
  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current || preSurfaceTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // ~8-9 lines
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      // Only update composerHeight for main chat composer (not pre-surface)
      // Account for: textarea height + padding (16px top + 8px bottom) + control section (~48px) + container padding (32px)
      if (textareaRef.current) {
        setComposerHeight(newHeight + 16 + 8 + 48 + 32);
      }
    }
  }, []);
  
  // Auto-scroll to bottom (only if user is near bottom)
  const scrollToBottom = useCallback((smooth = true) => {
    if (messageListRef.current && !isUserScrolledUp) {
      messageListRef.current.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, [isUserScrolledUp]);

  // Restore scroll position after prepending older messages so the list doesn't jump (WhatsApp/ChatGPT-style)
  useLayoutEffect(() => {
    const el = messageListRef.current;
    const saved = scrollRestoreBeforePrepend.current;
    if (!el || !saved) return;
    const newHeight = el.scrollHeight;
    const heightDelta = newHeight - saved.scrollHeight;
    if (heightDelta > 0) {
      el.scrollTop = saved.scrollTop + heightDelta;
      skipNextScrollToBottom.current = true;
    }
    scrollRestoreBeforePrepend.current = null;
  }, [sessionMessages.length]);

  // Scroll listener: track isUserScrolledUp for scroll-to-bottom behavior (throttled for performance)
  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;
    let rafId = null;
    let lastRun = 0;
    const THROTTLE_MS = 80;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const now = Date.now();
        if (now - lastRun < THROTTLE_MS) return;
        lastRun = now;
        const { scrollTop, scrollHeight, clientHeight } = messageList;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        setIsUserScrolledUp(!isNearBottom);
      });
    };
    messageList.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      messageList.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [sessionId, sessionMessages.length]);

  // Load older messages when user scrolls near top: Intersection Observer (reliable with fast scroll, works after session switch)
  useEffect(() => {
    const listEl = messageListRef.current;
    const sentinelEl = topSentinelRef.current;
    if (!listEl || !sentinelEl) return;
    const state = useSessionStore.getState();
    if (state.sessionId !== sessionId) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        const s = useSessionStore.getState();
        const mightHaveMore = s.hasMoreMessages || (s.messages?.length === 20 && s.totalMessageCount == null);
        if (!mightHaveMore || s.loading || s.sessionId !== sessionId) return;
        if (Date.now() - loadOlderThrottleAt.current < LOAD_OLDER_THROTTLE_MS) return;
        loadOlderThrottleAt.current = Date.now();
        scrollRestoreBeforePrepend.current = { scrollHeight: listEl.scrollHeight, scrollTop: listEl.scrollTop };
        s.loadOlderMessages(s.sessionId).catch(() => { scrollRestoreBeforePrepend.current = null; });
      },
      { root: listEl, rootMargin: '200px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sessionId, sessionMessages.length]);
  
  // Auto-scroll to bottom when new messages arrive (skip after we restored scroll from loading older)
  useEffect(() => {
    if (sessionMessages.length === 0) return;
    if (skipNextScrollToBottom.current) {
      skipNextScrollToBottom.current = false;
      return;
    }
    setTimeout(() => scrollToBottom(true), 100);
  }, [sessionMessages.length, scrollToBottom]);
  
  // Auto-resize textarea on input change
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Clear modificationRequest when phase changes from planning to learning
  // This prevents stale modificationRequest from interfering with chat input
  useEffect(() => {
    if (phase !== 'planning' && modificationRequest) {
      setModificationRequest('');
    }
  }, [phase, modificationRequest]);

  // Initialize session if none exists
  useEffect(() => {
    let isMounted = true;
    
    const initializeSession = async () => {
      // Only create session if we don't have one and component is still mounted
      if (!sessionId && isMounted) {
        try {
          console.log('Creating new session...');
          await createSession();
        } catch (error) {
          console.error('Failed to create session:', error);
          // Don't retry immediately to avoid rate limits
        }
      } else if (sessionId) {
        console.log('Session already exists:', sessionId);
        // Resume session from server to sync state
        try {
          console.log('Resuming session from server to sync state...');
          const resumedSession = await resumeSessionFromServer(sessionId);
          // Show confetti if session is completed
          if (resumedSession?.phase === 'completed') {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
          }
        } catch (error) {
          console.error('Failed to resume session:', error);
          // If resume fails, clear the session and create a new one
          if (isMounted) {
            console.log('Clearing failed session and creating new one...');
            // Clear the sessionId from store to trigger new session creation
            useSessionStore.setState({ sessionId: null });
            try {
              await createSession();
            } catch (createError) {
              console.error('Failed to create new session after resume failure:', createError);
            }
          }
        }
      }
    };
    
    initializeSession();
    
    return () => {
      isMounted = false;
    };
  }, [sessionId, learningStyle]); // Re-run when sessionId or learningStyle changes
  
  // Also check for completed state when sessionId or phase changes (for when resuming from ChatHistory)
  useEffect(() => {
    if (sessionId && phase === 'completed' && plan && plan.length > 0 && plan.every(m => m.status === 'passed')) {
      // Small delay to ensure state is fully synced
      const timer = setTimeout(() => {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [sessionId, phase, plan]);
  
  // Determine UI state based on phase (declare before use in composerVisible)
  const isPreSurface = phase === 'pre' && sessionMessages.length === 0;
  const isAssessing = phase === 'assessing';
  const isPlanning = phase === 'planning';
  const isActiveLearning = ['assessing', 'planning', 'learning', 'quizzing', 'feedback', 'completed'].includes(phase) || (phase === 'pre' && sessionMessages.length > 0);
  const hasMessages = sessionMessages.length > 0;
  const isCompleted = phase === 'completed' && plan && plan.length > 0 && plan.every(m => m.status === 'passed');

  // Auto-focus chat input when composer is visible so user can type immediately
  const composerVisible = isPreSurface || (!isPlanning && !isViewOnly && !isPreSurface);
  useEffect(() => {
    if (!composerVisible) return;
    const timer = setTimeout(() => {
      const target = isPreSurface ? preSurfaceTextareaRef.current : textareaRef.current;
      target?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [composerVisible, isPreSurface]);

  // Refocus input after assistant finishes responding so user can type next message without clicking
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (wasLoading && !loading && hasMessages && !isPlanning && !isViewOnly) {
      const timer = setTimeout(() => {
        if (skipNextScrollToBottom.current) return;
        const input = textareaRef.current || preSurfaceTextareaRef.current;
        input?.focus({ preventScroll: true });
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [loading, hasMessages, isPlanning, isViewOnly]);
  
  // Determine placeholder text based on mode and phase
  // Show appropriate placeholder for initial state or learning phase
  const isInitialState = phase === 'pre' && sessionMessages.length === 0;
  const isLearningPhase = ['learning', 'quizzing', 'feedback', 'completed'].includes(phase);
  
  let chatPlaceholder = '';
  if (isInitialState) {
    chatPlaceholder = learningStyle === 'revision' 
      ? 'What you want to revise...' 
      : 'What you want to learn/study...';
  } else if (isLearningPhase) {
    chatPlaceholder = 'Reply...';
  }

  // Course sessions are seeded directly into learning phase, but may have 0 messages.
  // Auto-trigger the first teaching message once per session so the student sees content immediately.
  useEffect(() => {
    if (!isCourseSession) return;
    if (!sessionId) return;
    if (loading) return;
    if (phase !== 'learning') return;
    if (sessionMessages.length > 0) return;

    const marker = didAutoStartRef.current;
    if (marker.sessionId === sessionId && marker.did) return;

    didAutoStartRef.current = { sessionId, did: true };
    // "start" is a safe seed message that should kick off first milestone teaching.
    sendChatMessage('start').catch((err) => {
      console.error('Auto-start course session failed:', err);
      // Allow a retry if it failed
      didAutoStartRef.current = { sessionId, did: false };
    });
  }, [isCourseSession, sessionId, phase, loading, sessionMessages.length, sendChatMessage]);
  
  // Handle Revision button click
  const handleRevision = async () => {
    if (!sessionId || !topic) {
      setToast({ type: 'error', message: 'Session or topic not available' });
      return;
    }
    
    try {
      // Start revision quiz WITHOUT changing the learning style/mode
      // This is just a feature of a completed study topic, not a mode change
      await startRevisionQuiz(topic);
      setToast({ type: 'success', message: 'Starting revision quiz...' });
    } catch (error) {
      console.error('Failed to start revision:', error);
      setToast({ type: 'error', message: error.message || 'Failed to start revision' });
    }
  };
  
  // Handle Summarize button click
  const handleSummarize = async () => {
    if (!sessionId) {
      setToast({ type: 'error', message: 'Session not available' });
      return;
    }
    
    try {
      setIsSummarizing(true);
      const response = await sessionApi.summarizeSession(sessionId);
      console.log('Summarize response:', response);
      
      // Handle different response structures
      const summaryText = response?.data?.summary || response?.summary || response?.data?.data?.summary || 'Summary generated successfully';
      
      if (!summaryText || summaryText === 'Summary generated successfully.') {
        throw new Error('No summary content received from server');
      }
      
      setSummary(summaryText);
      setToast({ type: 'success', message: 'Session summarized successfully' });
      appendMessage({
        role: 'assistant',
        content: summaryText,
        ts: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to summarize session:', error);
      const errorMessage = error.message || 'Failed to generate summary';
      setToast({ type: 'error', message: errorMessage });
    } finally {
      setIsSummarizing(false);
    }
  };
  
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Surface store error as toast and clear so it doesn't persist
  useEffect(() => {
    if (error) {
      setToast({ type: 'error', message: error });
      clearError();
    }
  }, [error, clearError]);


  // Helper function to intelligently determine intent based on conversation context
  const hasLearningIntent = (message) => {
    const lowerMsg = message.toLowerCase().trim();
    const words = message.trim().split(/\s+/).length;
    
    // If already in conversation with messages, be smarter about intent
    const hasPreviousMessages = sessionMessages.length > 0;
    
    // General greetings/keywords
    const generalKeywords = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 
      'good evening', 'how are you', 'whats up', "what's up", 'thanks', 'thank you', 'sorry', 'okay', 'ok'];
    
    // Learning keywords
    const learningKeywords = ['learn', 'teach', 'study', 'want to', 'need to', 'show me', 
      'explain', 'help me understand', 'i want to', 'i need', 'tutorial', 'guide', 'course', 
      'training', 'master', 'practice', 'concept', 'how to', 'play guitar', 'play piano'];
    
    // If message is just one word
    if (words === 1) {
      // Single words that are greetings
      if (generalKeywords.includes(lowerMsg)) {
        return false;
      }
      // If in middle of conversation, single words are likely follow-ups (topics/subjects)
      if (hasPreviousMessages) {
        return true;
      }
      // At start, be cautious - only return true for known learning words
      return false;
    }
    
    // Check for learning keywords
    if (learningKeywords.some(keyword => lowerMsg.includes(keyword))) {
      return true;
    }
    
    // If already in conversation with messages, more likely to be learning
    if (hasPreviousMessages && words >= 3) {
      return true;
    }
    
    // Check for general keywords
    if (generalKeywords.some(keyword => lowerMsg.includes(keyword))) {
      return false;
    }
    
    // Default: be conservative, don't trigger assessment for ambiguous messages
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading || isSubmittingRef.current) return;

    const message = inputValue.trim();
    setInputValue('');
    adjustTextareaHeight();
    isSubmittingRef.current = true;

    try {
      // Ensure we have a valid session before sending
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          await createSession();
          currentSessionId = useSessionStore.getState().sessionId;
          if (!currentSessionId) {
            throw new Error('Failed to create session. Please refresh the page and try again.');
          }
        } catch (createError) {
          console.error('Error creating session:', createError);
          throw new Error(createError.message || 'Failed to create session. Please try again.');
        }
      }
      
      // Validate sessionId format (should be a valid MongoDB ObjectId)
      if (!currentSessionId || currentSessionId.length < 10) {
        throw new Error('Invalid session ID. Please refresh the page.');
      }
      
      // Always use sendChatMessage - it handles shouldTriggerAssessment automatically
      // The session store will detect learning intent and trigger assessment if needed
      await sendChatMessage(message);
      setIsUserScrolledUp(false);
      // Scroll to bottom and refocus textarea so user can type next message without clicking
      setTimeout(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTo({
            top: messageListRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
        const input = textareaRef.current || preSurfaceTextareaRef.current;
        input?.focus({ preventScroll: true });
      }, 150);
    } catch (err) {
      console.error('Error sending message:', err);
      useSessionStore.setState({ error: err.message || 'Failed to send message' });
      setToast({ type: 'error', message: err.message || 'Failed to send message. Please try again.' });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ message: 'Message copied!', type: 'success' });
  };


  const handleRetryLastMessage = async () => {
    if (loading) return;

    const lastUserMsg = sessionMessages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMsg) return;

    try {
      removeLastAssistantMessage();
      await sendChatMessage(lastUserMsg.content, { skipUserAppend: true });
    } catch (err) {
      console.error('Error retrying message:', err);
      setToast({ type: 'error', message: err.message || 'Failed to retry.' });
    }
  };

  // Show confetti when phase becomes completed
  useEffect(() => {
    if (phase === 'completed' && plan && plan.length > 0 && plan.every(m => m.status === 'passed')) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [phase, plan]);

  return (
    <>
      {/* Confetti for completed sessions - Above everything */}
      {showConfetti && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1300, pointerEvents: 'none' }}>
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={300}
            gravity={0.2}
            colors={['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444']}
          />
        </div>
      )}
      <QuizOverlay />
      {loading && phase === 'quizzing' && !quizDraft && (
        <Loader overlay message="Preparing quiz..." />
      )}

      {/* CONTENT COLUMN */}
      <div className="flex h-full min-h-0 flex-col">
        {/* Pre Surface State - Centered */}
        {isPreSurface && (
          <div className="flex-1 flex items-center justify-center bg-[#f7f8f8]">
            <div className="flex flex-col gap-8 items-center w-[700px] max-w-full px-4">
              {/* Title */}
              <p className="font-bold text-[21px] leading-7 text-[#030712] tracking-[-0.6px] text-center cursor-default">
                Ready when you are.
              </p>

              {/* Composer Card */}
              <div 
                className={`bg-white border flex flex-col gap-2 items-start px-4 py-3 rounded-[24px] w-full relative transition-all duration-200 ${
                  inputValue.trim() ? 'border-[#4e81ee]' : 'border-[#e6e7e8]'
                }`}
              >
                {/* Textarea area - clickable to focus */}
                <div 
                  className="w-full cursor-text"
                  onClick={() => preSurfaceTextareaRef.current?.focus()}
                >
                  <textarea
                    ref={preSurfaceTextareaRef}
                    placeholder={chatPlaceholder}
                    className="w-full resize-none border-none outline-none bg-transparent text-base leading-[24px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.25px] overflow-y-auto cursor-text"
                    style={{ 
                      minHeight: "48px",
                      maxHeight: "200px",
                      lineHeight: "24px"
                    }}
                    value={inputValue}
                    maxLength={2000}
                    onChange={(e) => {
                      if (e.target.value.length <= 2000) {
                        setInputValue(e.target.value);
                        adjustTextareaHeight();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                    }}
                    rows={2}
                  />
                </div>
                
                {/* Controls at bottom */}
                <div className="flex gap-2 items-center justify-end w-full">
                  {/* Model selector dropdown */}
                  <div className="flex items-center gap-1 cursor-pointer">
                    <select 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="font-normal text-base leading-[21px] text-[#424855] tracking-[-0.25px] bg-transparent border-none outline-none cursor-pointer appearance-none"
                    >
                      <option value="llama">Llama</option>
                    </select>
                    <svg className="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Send button (circular) */}
                  <button
                    disabled={!inputValue.trim()}
                    onClick={handleSubmit}
                    className={`flex items-center justify-center p-3 rounded-[50px] transition-all duration-200 ${
                      inputValue.trim() 
                        ? 'bg-[#4e81ee] hover:bg-blue-600' 
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <img 
                      src="/icons/send-arrow.svg" 
                      alt="arrow up" 
                      className={`w-6 h-6 transition-all duration-200 ${
                        inputValue.trim() ? 'filter-none' : 'filter grayscale opacity-50'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Studying / Revision toggle — hidden for instructor-seeded course sessions */}
              {!isCourseSession && <div className="flex gap-4 items-center justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    // Clear current session when switching to studying mode from revision
                    // A new session will be created when the user sends their first message
                    // This ensures study sessions are separate from revision sessions
                    const { sessionId: currentSessionId } = useSessionStore.getState();
                    if (currentSessionId && learningStyle === 'revision') {
                      // Clear current session - new one will be created on first message
                      useSessionStore.setState({ sessionId: null, phase: 'pre', topic: '', chatTitle: '', plan: [], messages: [] });
                    }
                    // Set mode after clearing session
                    setLearningStyle("studying");
                  }}
                  className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white transition-all duration-200 ${
                    learningStyle === "studying" 
                      ? "border-[#4e81ee] text-[#4e81ee]" 
                      : "border-[#e6e7e8] text-[#686d77]"
                  }`}
                >
                  <img 
                    src="/icons/studying.svg" 
                    alt="graduation cap" 
                    className="w-6 h-6" 
                    style={{ 
                      filter: learningStyle === "studying" ? "none" : "brightness(0) saturate(100%) invert(42%) sepia(7%) saturate(1459%) hue-rotate(184deg) brightness(92%) contrast(89%)"
                    }}
                  />
                  <p className={`font-bold text-lg leading-7 tracking-[-0.4px] ${
                    learningStyle === "studying" ? "text-[#4e81ee]" : "text-[#686d77]"
                  }`}>
                    Studying
                  </p>
                </button>
                
                <button
                  type="button"
                  onClick={async () => {
                    // Set mode first
                    setLearningStyle("revision");
                    // Clear current session when switching to revision mode
                    // A new session will be created when the user sends their first message
                    // This ensures revision sessions are separate from study sessions
                    const { sessionId: currentSessionId } = useSessionStore.getState();
                    if (currentSessionId) {
                      // Clear current session - new one will be created on first message
                      useSessionStore.setState({ sessionId: null, phase: 'pre', topic: '', chatTitle: '', plan: [], messages: [] });
                    }
                  }}
                  className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white transition-all duration-200 ${
                    learningStyle === "revision" 
                      ? "border-[#4e81ee] text-[#4e81ee]" 
                      : "border-[#e6e7e8] text-[#686d77]"
                  }`}
                >
                  <img 
                    src="/icons/revision.svg" 
                    alt="revision" 
                    className="w-6 h-6" 
                    style={{ 
                      filter: learningStyle === "revision" ? "brightness(0) saturate(100%) invert(36%) sepia(85%) saturate(1369%) hue-rotate(210deg) brightness(98%) contrast(96%)" : "none"
                    }}
                  />
                  <p className={`font-bold text-lg leading-7 tracking-[-0.4px] ${
                    learningStyle === "revision" ? "text-[#4e81ee]" : "text-[#686d77]"
                  }`}>
                    Revision
                  </p>
                </button>
              </div>}
            </div>
          </div>
        )}

        {/* Active Learning State */}
        {isActiveLearning ? (
          <>
            {/* Plan Approval UI - Show when in planning phase, takes full height */}
            {isPlanning && plan && plan.length > 0 ? (
              <div className="flex flex-col flex-1 min-h-0 bg-[#f7f8f8]">
                {/* Scrollable Plan Review Section - More space for modules */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-2 custom-scrollbar">
                  <div className="max-w-4xl mx-auto">
                    {/* Plan Header - More compact */}
                    <div className="bg-white rounded-xl p-3 sm:p-4 border border-[#e6e7e8] shadow-sm mb-2">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h2 className="text-xl sm:text-2xl font-bold text-[#030712] mb-1">
                            Learning Plan {chatTitle ? `(${chatTitle})` : topic ? `(${topic})` : ''}
                          </h2>
                          <p className="text-sm text-[#686d77] mb-2">
                            {plan.length} {plan.length === 1 ? 'Module' : 'Modules'} • Estimated total points: {plan.reduce((sum, m) => sum + (m.points || 0), 0)}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                              Status: Pending approval
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-[#686d77] mt-2 pt-2 border-t border-[#e6e7e8]">
                        A plan is a sequence of modules. You'll do them one-by-one.
                      </p>
                    </div>

                    {/* Plan Container with Modules List - More prominent */}
                    <div className="bg-white rounded-xl border border-[#e6e7e8] shadow-sm overflow-hidden">
                      <div className="p-2.5 sm:p-3 border-b border-[#e6e7e8] bg-[#f7f8f8]">
                        <h3 className="text-base sm:text-lg font-semibold text-[#030712]">Modules</h3>
                      </div>
                      
                      {/* Modules List/Stepper */}
                      <div className="divide-y divide-[#e6e7e8]">
                        {plan.map((module, index) => {
                          const isExpanded = expandedModules.has(index);
                          const milestoneCount = module.milestones?.length || 0;
                          
                          return (
                            <div key={module.id} className="bg-white hover:bg-[#fafbfc] transition-colors">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedModules);
                                  if (isExpanded) {
                                    newExpanded.delete(index);
                                  } else {
                                    newExpanded.add(index);
                                  }
                                  setExpandedModules(newExpanded);
                                }}
                                className="w-full flex items-center justify-between p-3 sm:p-4 text-left"
                              >
                                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                  {/* Module Number Badge */}
                                  <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#4e81ee] text-white font-bold text-sm sm:text-base flex items-center justify-center">
                                    {index + 1}
                                  </div>
                                  
                                  {/* Module Title and Info */}
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-base sm:text-lg text-[#030712] mb-1">
                                      {module.title}
                                    </h4>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#686d77]">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-[#4e81ee] font-medium border border-blue-100">
                                        {module.points} points
                                      </span>
                                      <span>{milestoneCount} {milestoneCount === 1 ? 'milestone' : 'milestones'}</span>
                                      {module.difficulty && (
                                        <span className="capitalize">• {module.difficulty}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Expand/Collapse Chevron */}
                                <svg
                                  className={`w-5 h-5 text-[#686d77] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              
                              {/* Expanded Milestones */}
                              {isExpanded && module.milestones && module.milestones.length > 0 && (
                                <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 bg-[#fafbfc]">
                                  <div className="pl-12 sm:pl-14">
                                    <p className="text-xs font-medium text-[#686d77] mb-2 uppercase tracking-wide">Learning Objectives</p>
                                    <ul className="space-y-1.5 sm:space-y-2">
                                      {module.milestones.map((milestone, mIndex) => (
                                        <li key={mIndex} className="flex items-start gap-2 text-sm sm:text-base text-[#424855]">
                                          <span className="text-[#4e81ee] mt-1.5 flex-shrink-0">•</span>
                                          <span className="flex-1">{typeof milestone === 'string' ? milestone : milestone.text}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Compact Sticky Footer - Approval and Modification */}
                <div className="flex-shrink-0 bg-white border-t border-[#e6e7e8] shadow-lg">
                  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
                    {/* Approve Plan Section - Compact */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-[#e6e7e8]">
                      <p className="text-sm text-[#424855]">
                        Plan ready. <span className="font-medium text-[#030712]">Approve to start Module 1.</span>
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            await approvePlan();
                            setToast({ message: 'Plan approved! Let\'s start learning.', type: 'success' });
                          } catch (err) {
                            setToast({ message: err.message || 'Failed to approve plan', type: 'error' });
                          }
                        }}
                        disabled={loading}
                        className="w-full sm:w-auto px-6 sm:px-8 py-2.5 bg-[#4e81ee] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm sm:text-base rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve this Learning Plan
                      </button>
                    </div>
                    
                    {/* Modification Request Section - Compact */}
                    <div id="modification-panel" className="bg-[#f7f8f8] rounded-lg p-3 sm:p-4 border border-[#e6e7e8]">
                      <h4 className="font-semibold text-sm mb-2 text-[#030712]">Request Modifications</h4>
                      
                      {/* Quick Chips */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {[
                          "Make it more beginner-friendly",
                          "Reduce milestones",
                          "Add more milestones"
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (modificationRequest.trim()) {
                                setModificationRequest(prev => prev + ' ' + chip);
                              } else {
                                setModificationRequest(chip);
                              }
                            }}
                            className="px-3 py-1 text-xs font-medium text-[#4e81ee] bg-white border border-blue-200 rounded-full hover:bg-blue-50 transition-colors"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                      
                      <div className="flex gap-2">
                        <textarea
                          placeholder="Ask to adjust modules, difficulty, pacing, or add/remove topics. This updates this plan."
                          className="flex-1 resize-none rounded-lg border border-[#e6e7e8] bg-white p-2.5 text-sm leading-[21px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.25px] focus:border-[#4e81ee] focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                          style={{ minHeight: "60px", maxHeight: "80px" }}
                          value={modificationRequest}
                          maxLength={500}
                          onChange={(e) => {
                            if (e.target.value.length <= 500) {
                              setModificationRequest(e.target.value);
                            }
                          }}
                          disabled={loading}
                        />
                        <button
                          onClick={async () => {
                            if (!modificationRequest.trim()) {
                              setToast({ message: 'Please enter a modification request', type: 'error' });
                              return;
                            }
                            try {
                              await modifyPlan(modificationRequest);
                              setModificationRequest('');
                              setToast({ message: 'Plan modification requested', type: 'success' });
                            } catch (err) {
                              setToast({ message: err.message || 'Failed to modify plan', type: 'error' });
                            }
                          }}
                          disabled={loading || !modificationRequest.trim()}
                          className="flex-shrink-0 bg-[#ff9500] hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm"
                        >
                          Request Modification
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Thread (scrolls) - Show even if empty so composer is visible */}
                <div 
                  ref={messageListRef}
                  id="message-list" 
                  className="min-h-0 flex-1 overflow-auto custom-scrollbar bg-[#f7f8f8]"
                  style={{ paddingBottom: '30px', overscrollBehaviorY: 'contain' }}
                >
                  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex-shrink-0">
                    <div className="flex flex-col gap-6" style={{ minHeight: 'min-content' }}>
                      {/* Sentinel for load-older: when this enters viewport we fetch more (smooth, works with fast scroll) */}
                      {mightHaveMoreMessages && (
                        <div ref={topSentinelRef} className="w-full flex-shrink-0" style={{ height: 1 }} aria-hidden="true" />
                      )}
                      {!hasMessages && (
                        <div className="text-center py-10 text-sm text-[#686d77]">
                          {isCourseSession
                            ? 'Starting your lesson…'
                            : 'Send a message to begin.'}
                        </div>
                      )}
                      {sessionMessages.map((message, index) => (
                        <div
                          key={message.id ?? `msg-${index}-${message.ts ?? index}`}
                          className={`flex flex-col gap-2 ${
                            message.role === 'user' ? 'items-end' : 'items-start'
                          }`}
                        >
                          {/* Message Bubble */}
                          <div
                            className={`max-w-[85%] ${
                              message.role === 'user'
                                ? 'bg-white text-[#030712] p-4 rounded-2xl border border-[#e6e7e8]'
                                : 'bg-transparent text-[#030712]'
                            } ${message.isError ? 'border-red-200 bg-red-50 text-red-700 p-4 rounded-2xl' : ''}`}
                          >
                          <div className={`leading-relaxed whitespace-pre-wrap ${
message.role === 'user' ? 'text-sm' : 'text-base'
                          }`}>
                            {message.role === 'assistant' ? (
                              <MessageContent
                                content={message.content}
                                parts={message.metadata?.parts || message.parts}
                                isLastMessage={index === sessionMessages.length - 1}
                                points={points}
                                gems={gems}
                                progressPct={progressPct}
                                milestoneInfo={activeModuleId && meta?.currentMilestoneIndex !== undefined ? {
                                  current: (meta.currentMilestoneIndex || 0) + 1,
                                  total: plan.find(m => m.id === activeModuleId)?.milestones?.length || 0,
                                  moduleNum: plan.findIndex(m => m.id === activeModuleId) + 1
                                } : null}
                                onAnswer={index === sessionMessages.length - 1 && !isViewOnly && !loading ? async (answer) => {
                                  try {
                                    await sendChatMessage(answer);
                                    setIsUserScrolledUp(false);
                                  } catch (err) {
                                    console.error('Error sending answer:', err);
                                  }
                                } : undefined}
                              />
                            ) : (
                              message.content
                            )}
                          </div>
                        </div>
                        
                        {/* Message Actions */}
                        {message.role === 'assistant' && (
                          <div className="flex gap-3 mt-2">
                            <button
                              className="flex items-center justify-center w-8 h-8 text-[#5b6470] hover:text-[#030712] hover:bg-gray-100 rounded-full transition-colors"
                              onClick={() => handleCopyMessage(message.content)}
                              title="Copy message"
                            >
                              <img src="/icons/copy.svg" alt="copy" className="w-4 h-4" />
                            </button>
                            <button
                              className="flex items-center justify-center w-8 h-8 text-[#5b6470] hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                              title="Like message"
                            >
                              <img src="/icons/like.svg" alt="like" className="w-4 h-4" />
                            </button>
                            <button
                              className="flex items-center justify-center w-8 h-8 text-[#5b6470] hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Dislike message"
                            >
                              <img src="/icons/dislike.svg" alt="dislike" className="w-4 h-4" />
                            </button>
                            {index === sessionMessages.length - 1 && (
                              <button
                                className="flex items-center justify-center w-8 h-8 text-[#5b6470] hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                onClick={handleRetryLastMessage}
                                title="Regenerate response"
                              >
                                <img src="/icons/regenerate.svg" alt="regenerate" className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        </div>
                      ))}
                      
                      {/* Typing Indicator */}
                      {loading && (
                        <div className="flex items-start">
                          <div className="flex gap-1.5 px-4 py-3 bg-[#f7f8f8] rounded-2xl">
                            <div className="w-2 h-2 bg-[#686d77] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></div>
                            <div className="w-2 h-2 bg-[#686d77] rounded-full animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '1.4s' }}></div>
                            <div className="w-2 h-2 bg-[#686d77] rounded-full animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '1.4s' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Completed Topic Actions - Show Revision and Summarize buttons when topic is completed */}
                {phase === 'completed' && (
                  <div className="flex-shrink-0 bg-[#f7f8f8] px-4 sm:px-6 py-4">
                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleRevision}
                        disabled={loading}
                        className="w-full sm:w-auto px-6 py-2.5 bg-[#4e81ee] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm sm:text-base rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Start Revision Quiz
                      </button>
                      <button
                        onClick={handleSummarize}
                        disabled={loading || isSummarizing}
                        className="w-full sm:w-auto px-6 py-2.5 bg-[#ff9500] hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm sm:text-base rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSummarizing ? 'Summarizing...' : 'Summarize Topic'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Input Area */}
                <div className="flex-shrink-0 bg-[#f7f8f8] px-4 sm:px-6 py-4">
                  <div className="max-w-4xl mx-auto">
                    {/* Action Chips */}
                    {actionChips.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {actionChips.map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={chip.action}
                            className="px-3 py-1.5 text-sm font-medium text-[#4e81ee] bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 hover:border-blue-300 transition-colors"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {phase === 'planning' ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-[#686d77]">Please approve or request modifications to the learning plan above.</p>
                      </div>
                    ) : isViewOnly ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-[#686d77]">This is a view-only session. You cannot send messages.</p>
                      </div>
                    ) : (
                      <div 
                        className="bg-white border flex flex-col gap-2 items-start px-4 py-3 rounded-[24px] w-full relative transition-all duration-200 border-[#4e81ee]"
                      >
                        {/* Textarea area - clickable to focus */}
                        <div 
                          className="w-full cursor-text"
                          onClick={() => textareaRef.current?.focus()}
                        >
                          <textarea
                            ref={textareaRef}
                            placeholder={chatPlaceholder}
                            className="w-full resize-none border-none outline-none bg-transparent text-base leading-[24px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.25px] overflow-y-auto cursor-text"
                            style={{ 
                              minHeight: "48px",
                              maxHeight: "200px",
                              lineHeight: "24px"
                            }}
                            value={inputValue}
                            maxLength={2000}
                            onChange={(e) => {
                              if (e.target.value.length <= 2000) {
                                setInputValue(e.target.value);
                                adjustTextareaHeight();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                              }
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                            }}
                            rows={2}
                          />
                        </div>
                        
                        {/* Controls at bottom */}
                        <div className="flex gap-2 items-center justify-end w-full">
                          {/* Model selector dropdown */}
                          <div className="flex items-center gap-1 cursor-pointer">
                            <select 
                              value={model}
                              onChange={(e) => setModel(e.target.value)}
                              className="font-normal text-base leading-[21px] text-[#424855] tracking-[-0.25px] bg-transparent border-none outline-none cursor-pointer appearance-none"
                            >
                              <option value="llama">Llama</option>
                            </select>
                            <svg className="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          
                          {/* Send button */}
                          <button
                            type="submit"
                            onClick={handleSubmit}
                            disabled={loading || !inputValue.trim()}
                            className="flex items-center justify-center w-8 h-8 bg-[#4e81ee] hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-all duration-200"
                            title="Send message (Enter)"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
        </div>
      </>
    );
  }
  
  export default ChatInterface;
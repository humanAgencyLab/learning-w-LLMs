import React, { useState, useEffect } from 'react';
import Confetti from 'react-confetti';
import QuizOverlay from '../components/quiz/QuizOverlay';
import useSessionStore from '../state/sessionStore';

function ChatInterface() {
  // Session store
  const {
    sessionId,
    mode: learningStyle,
    model,
    topic,
    phase,
    plan,
    isViewOnly,
    setLearningStyle,
    setModel,
    sendChatMessage,
    startAssessment,
    approvePlan,
    modifyPlan,
    messages: sessionMessages,
    loading,
    error,
    createSession,
    resumeSessionFromServer,
    clearError,
    appendMessage
  } = useSessionStore();
  const [inputValue, setInputValue] = useState('');
  const [modificationRequest, setModificationRequest] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

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
  }, []); // Only run once on mount
  
  // Determine UI state based on phase
  const isPreSurface = phase === 'pre' && sessionMessages.length === 0; // Only show pre-surface when there are no messages
  const isAssessing = phase === 'assessing';
  const isPlanning = phase === 'planning';
  const isActiveLearning = ['assessing', 'planning', 'learning', 'quizzing', 'feedback', 'completed'].includes(phase) || (phase === 'pre' && sessionMessages.length > 0);
  const hasMessages = sessionMessages.length > 0;
  
  // Determine placeholder text based on mode
  const chatPlaceholder = learningStyle === 'revision' 
    ? 'What you want to revise...' 
    : 'What you want to learn/study...';
  
  // Debug logging
  console.log('ChatInterface render - sessionMessages:', sessionMessages);
  console.log('ChatInterface render - hasMessages:', hasMessages);
  console.log('ChatInterface render - loading:', loading);
  console.log('ChatInterface render - error:', error);
  console.log('ChatInterface render - phase:', phase);
  console.log('ChatInterface render - isActiveLearning:', isActiveLearning);
  console.log('ChatInterface render - isPreSurface:', isPreSurface);

  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Scroll to bottom of messages
    const messageList = document.getElementById('message-list');
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [sessionMessages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);


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
    if (!inputValue.trim() || loading) return;

    const message = inputValue.trim();
    setInputValue('');

    try {
      // Ensure we have a valid session before sending
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        console.log('No session found, creating one...');
        try {
          await createSession();
          // Wait a bit for the store to update with the new sessionId
          await new Promise(resolve => setTimeout(resolve, 300));
          currentSessionId = useSessionStore.getState().sessionId;
          
          if (!currentSessionId) {
            // Try one more time after a longer wait
            await new Promise(resolve => setTimeout(resolve, 500));
            currentSessionId = useSessionStore.getState().sessionId;
          }
          
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
    } catch (err) {
      console.error('Error sending message:', err);
      // Set error in the store
      useSessionStore.setState({ error: err.message || 'Failed to send message' });
      // Also show error to user
      alert(err.message || 'Failed to send message. Please try again.');
    }
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ message: 'Message copied!', type: 'success' });
  };


  const handleRetryLastMessage = async () => {
    if (loading) return;

    // Get the last user message from session store
    const lastUserMsg = sessionMessages
      .filter(msg => msg.role === 'user')
      .pop();
    
    if (!lastUserMsg) return;

    try {
      // Use sendChatMessage which handles shouldTriggerAssessment automatically
      await sendChatMessage(lastUserMsg.content);
    } catch (err) {
      console.error('Error retrying message:', err);
    }
  };

  // Show confetti when phase becomes completed
  useEffect(() => {
    if (phase === 'completed' && plan && plan.length > 0 && plan.every(m => m.status === 'passed')) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
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

      {/* CONTENT COLUMN */}
      <div className="flex h-full min-h-0 flex-col">
        {/* Pre Surface State - Centered */}
        {isPreSurface && (
          <div className="flex-1 flex items-center justify-center bg-[#f7f8f8]">
            <div className="flex flex-col gap-8 items-center w-[700px] max-w-full px-4">
              {/* Title */}
              <p className="font-bold text-[21px] leading-7 text-[#030712] tracking-[-0.6px] text-center">
                Ready when you are.
              </p>

              {/* Composer Card */}
              <div className={`bg-white border flex flex-col gap-4 items-start px-4 py-3 rounded-[24px] w-full relative transition-all duration-200 ${
                inputValue.trim() ? 'border-[#4e81ee]' : 'border-[#e6e7e8]'
              }`}>
                <textarea
                  placeholder={chatPlaceholder}
                  className="w-full resize-none border-none outline-none bg-transparent text-lg leading-[28px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.4px]"
                  style={{ minHeight: "28px" }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(e)}
                />
                
                {/* Controls at bottom */}
                <div className="flex gap-2 items-center justify-end w-full">
                  {/* Model selector dropdown */}
                  <div className="flex items-center gap-1">
                    <select 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="font-normal text-base leading-[21px] text-[#424855] tracking-[-0.25px] bg-transparent border-none outline-none cursor-pointer appearance-none"
                    >
                      <option value="llama">Llama</option>
                      <option value="gpt">ChatGPT</option>
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

              {/* Studying / Revision toggle below card */}
              <div className="flex gap-4 items-center justify-center">
                <button
                  type="button"
                  onClick={() => setLearningStyle("studying")}
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
                  onClick={() => setLearningStyle("revision")}
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
              </div>
            </div>
          </div>
        )}

        {/* Active Learning State */}
        {isActiveLearning ? (
          <>
            {/* Plan Approval UI - Show when in planning phase, takes full height */}
            {isPlanning && plan && plan.length > 0 ? (
              <div className="flex flex-col flex-1 min-h-0 bg-[#f7f8f8]">
                {/* Scrollable Plan Review Section */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-4 custom-scrollbar">
                  <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-6 border border-[#e6e7e8] shadow-sm">
                      <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-[#030712]">Review Your Learning Plan</h3>
                      {/* Scrollable plan container */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                        {plan.map((module, index) => (
                          <div key={module.id} className="bg-gradient-to-br from-[#f7f8f8] to-white rounded-lg p-4 sm:p-5 border border-[#e6e7e8] hover:border-[#4e81ee] hover:shadow-md transition-all duration-200">
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                              <span className="font-semibold text-base sm:text-lg text-[#030712]">
                                {index + 1}. {module.title}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold text-[#4e81ee] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">{module.points} pts</span>
                            </div>
                            {module.milestones && module.milestones.length > 0 && (
                              <ul className="text-sm sm:text-base text-[#424855] space-y-2 sm:space-y-2.5">
                                {module.milestones.map((milestone, mIndex) => (
                                  <li key={mIndex} className="leading-relaxed flex items-start gap-2">
                                    <span className="text-[#4e81ee] mt-1.5 flex-shrink-0">•</span>
                                    <span className="flex-1">{typeof milestone === 'string' ? milestone : milestone.text}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Fixed Bottom Section - Approval and Modification */}
                <div className="flex-shrink-0 bg-white border-t border-[#e6e7e8] shadow-lg px-4 sm:px-6 pt-4 pb-4 sm:pb-6">
                  <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
                    {/* Approve Plan Button */}
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
                      className="w-full bg-[#4e81ee] hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-base sm:text-lg px-6 py-3.5 sm:py-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
                    >
                      Approve Plan
                    </button>
                    
                    {/* Modification Request Card - Fixed at bottom */}
                    <div className="bg-[#f7f8f8] rounded-xl p-4 sm:p-5 border border-[#e6e7e8]">
                      <h4 className="font-semibold text-sm sm:text-base mb-3 text-[#030712]">Request Modifications</h4>
                      <div className="flex flex-col gap-3">
                        <textarea
                          placeholder="Tell me what you'd like to change..."
                          className="w-full resize-none rounded-lg border border-[#e6e7e8] bg-white p-3 text-sm sm:text-base leading-[21px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.25px] focus:border-[#4e81ee] focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                          style={{ minHeight: "70px", maxHeight: "120px" }}
                          value={modificationRequest}
                          onChange={(e) => setModificationRequest(e.target.value)}
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
                          className="w-full sm:w-auto sm:self-start bg-[#ff9500] hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm sm:text-base px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm"
                        >
                          Request Modification
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : hasMessages ? (
              <>
                {/* Thread (scrolls) - Only show when there are messages and not in planning phase */}
                <div id="message-list" className="min-h-0 flex-1 overflow-auto px-6 py-4">
                  <div className="flex flex-col gap-6">
                    {sessionMessages.map((message, index) => (
                      <div
                        key={index}
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
                              <div className="prose prose-sm max-w-none">
                                {message.content.split('\n').map((line, lineIndex) => {
                                  // Handle bold text formatting (entire line)
                                  if (line.trim().startsWith('**') && line.trim().endsWith('**') && line.trim().split('**').length === 3) {
                                    return (
                                      <div key={lineIndex} className="font-bold text-[#030712] mb-2">
                                        {line.trim().slice(2, -2)}
                                      </div>
                                    );
                                  }
                                  // Handle inline bold formatting within text
                                  const renderWithBold = (text) => {
                                    const parts = [];
                                    const regex = /\*\*([^*]+)\*\*/g;
                                    let lastIndex = 0;
                                    let match;
                                    
                                    while ((match = regex.exec(text)) !== null) {
                                      // Add text before the bold
                                      if (match.index > lastIndex) {
                                        parts.push(text.substring(lastIndex, match.index));
                                      }
                                      // Add bold text
                                      parts.push(
                                        <strong key={match.index} className="font-semibold">
                                          {match[1]}
                                        </strong>
                                      );
                                      lastIndex = regex.lastIndex;
                                    }
                                    // Add remaining text
                                    if (lastIndex < text.length) {
                                      parts.push(text.substring(lastIndex));
                                    }
                                    
                                    return parts.length > 0 ? parts : text;
                                  };
                                  
                                  // Handle bullet points
                                  if (line.startsWith('- ')) {
                                    return (
                                      <div key={lineIndex} className="ml-4 mb-1">
                                        • {renderWithBold(line.slice(2))}
                                      </div>
                                    );
                                  }
                                  // Regular text with inline bold support
                                  return (
                                    <div key={lineIndex} className={lineIndex === 0 ? 'mb-2' : 'mb-1'}>
                                      {renderWithBold(line)}
                                    </div>
                                  );
                                })}
                              </div>
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
                  </div>
                </div>

                {/* Composer - Fixed at bottom when there are messages (hide in planning phase) */}
                {!isViewOnly && !isPlanning && (
                  <div className="flex-shrink-0 bg-[#f7f8f8] p-6">
                    <div className="flex items-center gap-3 max-w-4xl mx-auto">
                      <div className="flex-1 relative">
                        <textarea
                          placeholder={chatPlaceholder}
                          className="w-full resize-none rounded-[24px] border border-[#e6e7e8] bg-white p-4 pr-24 text-lg leading-[28px] text-[#030712] placeholder:text-[#aeb1b6] tracking-[-0.4px] focus:border-[#4e81ee] focus:outline-none"
                          style={{ minHeight: "56px", maxHeight: "120px" }}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(e)}
                          disabled={loading}
                        />
                        
                        {/* Model Selector Dropdown - Inside textarea */}
                        <div className="absolute bottom-[18px] right-[72px] flex items-center gap-1">
                          <select 
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="bg-transparent border-none outline-none text-base leading-[21px] text-[#424855] tracking-[-0.25px] cursor-pointer appearance-none font-normal"
                          >
                            <option value="llama">Llama</option>
                            <option value="gpt">ChatGPT</option>
                          </select>
                          <svg className="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        
                        {/* Send Button - Inside textarea */}
                        <button 
                          className={`absolute bottom-[8px] right-[8px] flex h-12 w-12 items-center justify-center rounded-[50px] transition-all duration-200 ${
                            inputValue.trim() && !loading
                              ? 'bg-[#4e81ee] hover:bg-blue-600' 
                              : 'bg-gray-300 cursor-not-allowed'
                          }`}
                          onClick={handleSubmit} 
                          disabled={loading || !inputValue.trim()}
                        >
                          <img 
                            src="/icons/send-arrow.svg" 
                            alt="send" 
                            className={`w-6 h-6 ${
                              inputValue.trim() ? 'filter-none' : 'filter grayscale opacity-50'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Error toast notification */}
      {error && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg shadow-soft">
          <span>{error}</span>
          <button onClick={clearError} className="ml-2 text-red-500">×</button>
        </div>
      )}

      {/* Toast Notifications */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-soft ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {toast.message}
        </div>
      )}
    </>
  );
}

export default ChatInterface;
import React, { useState, useEffect } from 'react';
import QuizModal from '../components/QuizModal';
import QuizPanel from '../components/QuizPanel';
import {
  submitQuiz as newSubmitQuiz,
} from '../lib/stageApi';
import useSessionStore from '../state/sessionStore';

function ChatInterface() {
  // Session store
  const {
    sessionId,
    mode: learningStyle,
    model,
    topic,
    phase,
    isViewOnly,
    setLearningStyle,
    setModel,
    sendChatMessage,
    startAssessment,
    messages: sessionMessages,
    loading,
    error,
    createSession,
    clearSession,
    clearError
  } = useSessionStore();
  const [inputValue, setInputValue] = useState('');

  // Initialize session if none exists
  useEffect(() => {
    if (!sessionId) {
      createSession();
    }
  }, [sessionId, createSession]);
  
  // Determine UI state based on phase
  const isPreSurface = phase === 'pre';
  const isAssessing = phase === 'assessing';
  const isActiveLearning = ['assessing', 'learning', 'quizzing', 'feedback', 'completed'].includes(phase);
  const hasMessages = sessionMessages.length > 0;
  
  // Debug logging
  console.log('ChatInterface render - sessionMessages:', sessionMessages);
  console.log('ChatInterface render - hasMessages:', hasMessages);
  console.log('ChatInterface render - loading:', loading);
  console.log('ChatInterface render - error:', error);
  console.log('ChatInterface render - phase:', phase);
  console.log('ChatInterface render - isActiveLearning:', isActiveLearning);
  console.log('ChatInterface render - isPreSurface:', isPreSurface);

  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [currentQuizData] = useState(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const message = inputValue;
    setInputValue('');

    try {
      // If phase is 'pre', this is an assessment request
      if (phase === 'pre') {
        await startAssessment(message, learningStyle);
      } else {
        // Otherwise, it's a normal chat message
        await sendChatMessage(message);
      }
    } catch (err) {
      console.error('Error sending message:', err);
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
      await sendChatMessage(lastUserMsg.content);
    } catch (err) {
      console.error('Error retrying message:', err);
    }
  };

  const handleQuizSubmit = async (quizId, answers) => {
    try {
      await newSubmitQuiz(sessionId, quizId, answers);
      setToast({ message: 'Quiz submitted successfully!', type: 'success' });
      setQuizPanelOpen(false);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      setToast({ message: 'Failed to submit quiz.', type: 'error' });
    }
  };

  return (
    <>
      {/* Quiz Modal */}
      <QuizModal
        isOpen={quizModalOpen}
        onClose={() => setQuizModalOpen(false)}
        quizData={currentQuizData}
        onSubmit={handleQuizSubmit}
      />

      {/* Quiz Panel */}
      <QuizPanel
        isOpen={quizPanelOpen}
        onClose={() => setQuizPanelOpen(false)}
        quizData={currentQuizData}
        onSubmit={handleQuizSubmit}
      />

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
                  placeholder="Ask anything..."
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
        {isActiveLearning && (
          <>
            {hasMessages ? (
              <>
                {/* Thread (scrolls) - Only show when there are messages */}
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
                                  // Handle bold text formatting
                                  if (line.startsWith('**') && line.endsWith('**')) {
                                    return (
                                      <div key={lineIndex} className="font-bold text-[#030712] mb-2">
                                        {line.slice(2, -2)}
                                      </div>
                                    );
                                  }
                                  // Handle bullet points
                                  if (line.startsWith('- ')) {
                                    return (
                                      <div key={lineIndex} className="ml-4 mb-1">
                                        • {line.slice(2)}
                                      </div>
                                    );
                                  }
                                  // Regular text
                                  return (
                                    <div key={lineIndex} className={lineIndex === 0 ? 'mb-2' : 'mb-1'}>
                                      {line}
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

                {/* Composer - Fixed at bottom when there are messages */}
                {!isViewOnly && (
                  <div className="flex-shrink-0 bg-[#f7f8f8] p-6">
                    <div className="flex items-center gap-3 max-w-4xl mx-auto">
                      <div className="flex-1 relative">
                        <textarea
                          placeholder="Ask anything..."
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
            ) : (
              /* No messages - Show centered composer */
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-[#030712] mb-2">Ready when you are.</h2>
                  <p className="text-lg text-[#5b6470]">Start by asking me anything!</p>
                </div>
                
                {/* Centered Composer */}
                {!isViewOnly && (
                  <div className="w-full max-w-2xl">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <textarea
                          placeholder="Ask anything..."
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
                    
                    {/* Learning Style Buttons - Below composer when no messages */}
                    <div className="flex gap-3 mt-6 justify-center">
                      <button
                        onClick={() => setLearningStyle('studying')}
                        className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white transition-all duration-200 ${
                          learningStyle === 'studying' 
                            ? 'border-[#4e81ee] text-[#4e81ee]' 
                            : 'border-[#e6e7e8] text-[#686d77]'
                        }`}
                      >
                        <img 
                          src="/icons/studying.svg" 
                          alt="graduation cap" 
                          className="w-6 h-6" 
                          style={{ 
                            filter: learningStyle === 'studying' ? 'none' : 'brightness(0) saturate(100%) invert(42%) sepia(7%) saturate(1459%) hue-rotate(184deg) brightness(92%) contrast(89%)'
                          }}
                        />
                        <p className={`font-bold text-lg leading-7 tracking-[-0.4px] ${
                          learningStyle === 'studying' ? 'text-[#4e81ee]' : 'text-[#686d77]'
                        }`}>
                          Studying
                        </p>
                      </button>
                      
                      <button
                        onClick={() => setLearningStyle('revision')}
                        className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white transition-all duration-200 ${
                          learningStyle === 'revision' 
                            ? 'border-[#4e81ee] text-[#4e81ee]' 
                            : 'border-[#e6e7e8] text-[#686d77]'
                        }`}
                      >
                        <img 
                          src="/icons/revision.svg" 
                          alt="revision" 
                          className="w-6 h-6" 
                          style={{ 
                            filter: learningStyle === 'revision' ? 'brightness(0) saturate(100%) invert(36%) sepia(85%) saturate(1369%) hue-rotate(210deg) brightness(98%) contrast(96%)' : 'none'
                          }}
                        />
                        <p className={`font-bold text-lg leading-7 tracking-[-0.4px] ${
                          learningStyle === 'revision' ? 'text-[#4e81ee]' : 'text-[#686d77]'
                        }`}>
                          Revision
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Error toast notification */}
      {error && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg shadow-soft">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-500">×</button>
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
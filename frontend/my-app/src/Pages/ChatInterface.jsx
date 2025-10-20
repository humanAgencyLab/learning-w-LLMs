import React, { useState, useEffect } from 'react';
import { sendMessage } from '../lib/api';
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
    learningStyle,
    model,
    topic,
    phase,
    isViewOnly,
    setLearningStyle,
    setModel,
  } = useSessionStore();

  // Initialize with dummy messages for testing chat state
  const [messages, setMessages] = useState([
    {
      sender: 'user',
      text: 'I want to learn Python programming. Can you help me get started?',
      isError: false,
      timestamp: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
    },
    {
      sender: 'ai',
      text: 'Absolutely! I\'d be happy to help you learn Python. Python is a great choice for beginners because of its simple and readable syntax.\n\nLet me start by asking you a few questions to understand your current level and what you\'d like to focus on:\n\n1. Have you programmed in any other languages before?\n2. What\'s your main goal with Python (web development, data analysis, automation, etc.)?\n3. How much time can you dedicate to learning each week?\n\nBased on your answers, I can create a personalized learning plan for you!',
      isError: false,
      timestamp: new Date(Date.now() - 280000).toISOString() // 4.5 minutes ago
    },
    {
      sender: 'user', 
      text: 'I\'m completely new to programming, and I\'m interested in data analysis. I can probably study for about 5-6 hours per week.',
      isError: false,
      timestamp: new Date(Date.now() - 200000).toISOString() // 3.5 minutes ago
    },
    {
      sender: 'ai',
      text: 'Perfect! That\'s a great foundation to work with. Since you\'re new to programming and interested in data analysis, I\'ll create a learning path that combines Python fundamentals with data analysis concepts.\n\nHere\'s what I recommend for your first few weeks:\n\n**Week 1-2: Python Basics**\n- Variables and data types\n- Basic operations and functions\n- Simple programs\n\n**Week 3-4: Data Structures**\n- Lists, tuples, and dictionaries\n- Working with data\n- Basic file operations\n\nWould you like me to start with the first lesson on variables and data types?',
      isError: false,
      timestamp: new Date(Date.now() - 150000).toISOString() // 2.5 minutes ago
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Determine UI state based on phase
  const isPreSurface = phase === 'pre';
  const isActiveLearning = ['learning', 'quizzing', 'feedback', 'completed'].includes(phase);
  const hasMessages = messages.length > 0;

  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [currentQuizData] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastUserMessage, setLastUserMessage] = useState('');

  useEffect(() => {
    // Scroll to bottom of messages
    const messageList = document.getElementById('message-list');
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const newUserMessage = { sender: 'user', text: inputValue, isError: false, timestamp: new Date().toISOString() };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setLastUserMessage(inputValue);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage({
        message: inputValue,
        sessionId,
        learningStyle,
        model,
        topic,
      });

      if (response.success) {
        setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: response.response, isError: false, timestamp: new Date().toISOString() }]);
      } else {
        setError(response.error || 'Failed to send message');
        setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: 'Error: Could not get a response.', isError: true, timestamp: new Date().toISOString() }]);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
      setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: 'Error: Could not get a response.', isError: true, timestamp: new Date().toISOString() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ message: 'Message copied!', type: 'success' });
  };


  const handleRetryLastMessage = async () => {
    if (!lastUserMessage || isLoading) return;

    setIsLoading(true);
    setError(null);
    // Remove the last AI message if it was an error or the one we're retrying
    setMessages((prevMessages) => prevMessages.filter(
      (msg, index, arr) => !(msg.sender === 'ai' && index === arr.length - 1)
    ));

    try {
      const response = await sendMessage({
        message: lastUserMessage,
        sessionId,
        learningStyle,
        model,
        topic,
      });
      if (response.success) {
        setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: response.response, isError: false, timestamp: new Date().toISOString() }]);
      } else {
        setError(response.error || 'Failed to retry message');
        setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: 'Error: Could not get a response.', isError: true, timestamp: new Date().toISOString() }]);
      }
    } catch (err) {
      console.error('Error retrying message:', err);
      setError('Failed to retry message. Please try again.');
      setMessages((prevMessages) => [...prevMessages, { sender: 'ai', text: 'Error: Could not get a response.', isError: true, timestamp: new Date().toISOString() }]);
    } finally {
      setIsLoading(false);
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
            {/* Thread (scrolls) */}
            <div id="message-list" className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {hasMessages ? (
                <div className="flex flex-col gap-6">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex flex-col gap-2 ${
                        message.sender === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Message Bubble */}
                      <div
                        className={`max-w-[85%] ${
                          message.sender === 'user'
                            ? 'bg-white text-[#030712] p-4 rounded-2xl border border-[#e6e7e8]'
                            : 'bg-transparent text-[#030712]'
                        } ${message.isError ? 'border-red-200 bg-red-50 text-red-700 p-4 rounded-2xl' : ''}`}
                      >
                        <div className={`leading-relaxed whitespace-pre-wrap ${
                          message.sender === 'user' ? 'text-sm' : 'text-base'
                        }`}>
                          {message.sender === 'ai' ? (
                            <div className="prose prose-sm max-w-none">
                              {message.text.split('\n').map((line, lineIndex) => {
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
                            message.text
                          )}
                        </div>
                      </div>
                      
                      {/* Message Actions */}
                      {message.sender === 'ai' && (
                        <div className="flex gap-3 mt-2">
                          <button
                            className="flex items-center justify-center w-8 h-8 text-[#5b6470] hover:text-[#030712] hover:bg-gray-100 rounded-full transition-colors"
                            onClick={() => handleCopyMessage(message.text)}
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
                          {index === messages.length - 1 && (
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
              ) : (
                <div className="flex items-center justify-center h-full text-[#5b6470] text-base">
                  Start a conversation by typing a message below
                </div>
              )}
            </div>

            {/* Composer - Fixed at bottom */}
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
                      disabled={isLoading}
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
                        inputValue.trim() && !isLoading
                          ? 'bg-[#4e81ee] hover:bg-blue-600' 
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                      onClick={handleSubmit} 
                      disabled={isLoading || !inputValue.trim()}
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
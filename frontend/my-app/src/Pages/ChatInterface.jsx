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

  const [messages, setMessages] = useState([]);
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

  const handleDeleteMessage = (indexToDelete) => {
    setMessages((prevMessages) => prevMessages.filter((_, index) => index !== indexToDelete));
    setToast({ message: 'Message deleted!', type: 'info' });
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
              <div className="bg-white border border-[#4e81ee] flex gap-2 h-40 items-start px-4 py-3 rounded-3xl w-full relative">
                <textarea
                  placeholder="Ask anything..."
                  className="w-full h-full resize-none border-none outline-none bg-transparent text-lg text-[#030712] placeholder:text-[#aeb1b6]"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(e)}
                />
                
                {/* Model selector dropdown */}
                <div className="absolute bottom-[18px] right-[72px] flex items-center">
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="font-normal text-base leading-[21px] text-[#424855] tracking-[-0.25px] bg-transparent border-none outline-none cursor-pointer appearance-none pr-1"
                  >
                    <option value="llama">Llama</option>
                    <option value="gpt">ChatGPT</option>
                  </select>
                  <svg className="w-3 h-3 ml-0.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Send button (circular) */}
                <button
                  disabled={!inputValue.trim()}
                  onClick={handleSubmit}
                  className={`absolute bg-[#4e81ee] bottom-2 flex gap-3 items-center justify-center p-3 right-2 rounded-[50px] ${
                    !inputValue.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                        <div className="w-6 h-6">
                          <img src="/icons/send-arrow.svg" alt="arrow up" className="w-6 h-6" />
                        </div>
                </button>
              </div>

              {/* Studying / Revision toggle below card */}
              <div className="flex gap-4 items-center justify-center">
                <button
                  type="button"
                  onClick={() => setLearningStyle("studying")}
                  className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white ${
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
                  className={`flex gap-3 items-center justify-center px-5 py-2.5 rounded-lg border bg-white ${
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
            {/* Header (topic chip) */}
            {topic && (
              <div className="mb-4 flex items-center gap-3 flex-shrink-0 px-4 pt-4">
                <div className="rounded-full bg-brand-ghost px-3 py-1 text-xs font-medium text-text">
                  {topic}
                </div>
              </div>
            )}

            {/* Thread (scrolls) */}
            <div id="message-list" className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {hasMessages ? (
                <div className="flex flex-col gap-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex flex-col gap-3 ${
                        message.sender === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Message Bubble */}
                      <div
                        className={`max-w-[80%] p-4 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-[#4e81ee] text-white'
                            : 'bg-white border border-[#e6e7e8] text-[#030712]'
                        } ${message.isError ? 'border-red-200 bg-red-50 text-red-700' : ''}`}
                      >
                        <div className="text-base leading-relaxed">{message.text}</div>
                      </div>
                      
                      {/* Message Actions */}
                      <div className={`flex gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {message.sender === 'ai' ? (
                          <>
                            <button
                              className="text-gray-500 hover:text-gray-700 text-sm"
                              onClick={() => handleCopyMessage(message.text)}
                              title="Copy message"
                            >
                              📋 Copy
                            </button>
                            <button
                              className="text-gray-500 hover:text-green-600 text-sm"
                              title="Like message"
                            >
                              👍 Like
                            </button>
                            <button
                              className="text-gray-500 hover:text-red-600 text-sm"
                              title="Dislike message"
                            >
                              👎 Dislike
                            </button>
                            {index === messages.length - 1 && (
                              <button
                                className="text-gray-500 hover:text-blue-600 text-sm"
                                onClick={handleRetryLastMessage}
                                title="Regenerate response"
                              >
                                🔄 Regenerate
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            className="text-gray-500 hover:text-red-600 text-sm"
                            onClick={() => handleDeleteMessage(index)}
                            title="Delete message"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
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
              <div className="flex-shrink-0 p-4 border-t border-[#e6e7e8] bg-white">
                <div className="flex items-center gap-3 max-w-4xl mx-auto">
                  <textarea
                    placeholder="Ask anything..."
                    className="flex-1 resize-none rounded-2xl border border-[#e6e7e8] bg-white p-4 text-base text-[#030712] placeholder:text-[#aeb1b6] focus:border-[#4e81ee] focus:outline-none"
                    style={{ minHeight: "60px" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(e)}
                    disabled={isLoading}
                  />
                  <div className="flex items-center gap-3">
                    {/* Model Selector Dropdown */}
                    <select 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="rounded-lg border border-[#e6e7e8] bg-white px-3 py-2 text-sm text-[#424855] focus:border-[#4e81ee] focus:outline-none"
                    >
                      <option value="llama">Llama</option>
                      <option value="gpt">ChatGPT</option>
                    </select>
                    
                    {/* Send Button */}
                    <button 
                      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                        inputValue.trim() && !isLoading
                          ? 'bg-[#4e81ee] hover:bg-blue-600' 
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                      onClick={handleSubmit} 
                      disabled={isLoading || !inputValue.trim()}
                    >
                      <img src="/icons/send-arrow.svg" alt="send" className="w-6 h-6" />
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
import React, { useState, useEffect } from 'react';
import '../styles/ChatInterface.css';
import { sendMessage } from '../lib/api';
import { summarizeSession } from '../lib/summaryApi';
import QuizModal from '../components/QuizModal';
import QuizPanel from '../components/QuizPanel';
import {
  submitQuiz as newSubmitQuiz,
} from '../lib/stageApi';
import useSessionStore from '../state/sessionStore';
// import { Select } from '../components/ui'; // Not used in new structure
import StateDisplay from '../components/StateDisplay';
import NextActionBar from '../components/NextActionBar';

function ChatInterface() {
  // Session store
  const {
    sessionId,
    learningStyle,
    model,
    setLearningStyle,
    setModel,
  } = useSessionStore();

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Check if we have messages to determine UI state
  const hasMessages = messages.length > 0;
  

  // Model dropdown functionality
  const handleModelChange = (newModel) => {
    setModel(newModel);
    setShowModelDropdown(false);
  };

  const models = [
    { value: 'llama', label: 'Llama' },
    { value: 'gpt', label: 'GPT' },
    { value: 'claude', label: 'Claude' }
  ];
  // Streaming features (for future use)
  // const [isStreaming, setIsStreaming] = useState(false);
  // const [streamingEnabled, setStreamingEnabled] = useState(false);
  // const [abortController, setAbortController] = useState(null);

  // Core features
  const [lastUserMessage, setLastUserMessage] = useState(null);
  const [toast, setToast] = useState(null);

  // Quiz features
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [currentQuizData, setCurrentQuizData] = useState(null);

  // SRL state fetching will be implemented in future phases

  // Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      text: inputValue,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
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
        phase,
        topic,
        plan,
      });

      if (response.success) {
        const aiMessage = {
          text: response.message,
          sender: 'ai',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMessage]);
        setMessageCount(prev => prev + 1);

        // Update session state if provided
        if (response.sessionState) {
          setTopic(response.sessionState.topic || topic);
          setPhase(response.sessionState.phase || phase);
          setPlan(response.sessionState.plan || plan);
          setProgress(response.sessionState.progressPercent || progressPercent);
          setPoints(response.sessionState.points || points);
          setGems(Math.floor((response.sessionState.points || points) / 20));
        }
      } else {
        setError(response.error || 'Failed to send message');
      }
    } catch (error) {
      setError('Failed to send message');
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle quiz submission
  const handleQuizSubmit = async (answers) => {
    try {
      const response = await newSubmitQuiz({
        sessionId,
        answers,
      });

      if (response.success) {
        setQuizModalOpen(false);
        setQuizPanelOpen(false);
        setCurrentQuizData(null);
        
        // Update session state
        setPhase(response.sessionState?.phase || phase);
        setProgress(response.sessionState?.progressPercent || progressPercent);
        setPoints(response.sessionState?.points || points);
        setGems(Math.floor((response.sessionState?.points || points) / 20));
      }
    } catch (error) {
      setError('Failed to submit quiz');
      console.error('Error submitting quiz:', error);
    }
  };

  // Handle session summarization
  const onSummarize = async () => {
    if (!sessionId) return;

    setSummarizing(true);
    try {
      const response = await summarizeSession(sessionId);
      if (response.success) {
        setSummary(response.summary);
      } else {
        setError(response.error || 'Failed to summarize session');
      }
    } catch (error) {
      setError('Failed to summarize session');
      console.error('Error summarizing session:', error);
    } finally {
      setSummarizing(false);
    }
  };

  // Handle message actions
  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    setToast({ type: 'success', message: 'Message copied to clipboard' });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteMessage = (index) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRetryLastMessage = () => {
    if (lastUserMessage) {
      setInputValue(lastUserMessage);
    }
  };

  // SRL state fetching will be implemented in future phases

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModelDropdown && !event.target.closest('.model-selector-inline')) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  return (
    <>
      {/* State Debug Panel - Hidden for design review */}
      {/* <StateDisplay /> */}

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

        <div className="chat-interface">
            <div id="chat-content" className={hasMessages ? 'has-messages' : ''}>
              {/* Ready title - only shown when no messages */}
              {!hasMessages && <h2 className="ready-title">Ready when you are.</h2>}

              {/* Message list */}
              {hasMessages && (
                <div id="message-list">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`msg ${message.sender} ${message.isError ? 'error' : ''}`}
                    >
                      <div className="message-content">{message.text}</div>
                      <div className="message-actions">
                        <button
                          className="action-btn copy-btn"
                          onClick={() => handleCopyMessage(message.text)}
                          title="Copy message"
                        >
                          📋
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => handleDeleteMessage(index)}
                          title="Delete message"
                        >
                          🗑️
                        </button>
                        {message.sender === 'ai' &&
                          index === messages.length - 1 &&
                          lastUserMessage && (
                            <button
                              className="action-btn retry-btn"
                              onClick={handleRetryLastMessage}
                              title="Retry last message"
                            >
                              🔄
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

          {/* Composer - centered when no messages, sticky when has messages */}
          <div className={`composer ${hasMessages ? 'composer--sticky' : 'composer--centered'}`}>
            <div className="message-input-wrapper">
              <textarea
                placeholder="Ask anything..."
                className="message-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(e)}
                disabled={isLoading}
                rows={3}
              />
                  <div className="input-footer">
                    <div className="model-selector-inline" onClick={() => setShowModelDropdown(!showModelDropdown)}>
                      <span className="model-label">{model === 'llama' ? 'Llama' : model === 'gpt' ? 'GPT' : 'Claude'}</span>
                      <img src="http://localhost:3845/assets/767772adfffd13ba9ae8ffbf04e9e553137b127f.svg" alt="chevron down" className="chevron-icon" />
                      
                      {showModelDropdown && (
                        <div className="model-dropdown">
                          {models.map((modelOption) => (
                            <div
                              key={modelOption.value}
                              className={`model-option ${model === modelOption.value ? 'selected' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleModelChange(modelOption.value);
                              }}
                            >
                              {modelOption.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className={`send-button ${inputValue.trim() ? 'active' : ''}`}
                      type="submit"
                      onClick={handleSubmit}
                      disabled={isLoading || inputValue.trim() === ''}
                    >
                      <img src="http://localhost:3845/assets/098c23e71fb36edbb514140ebf775994687e90e2.svg" alt="arrow up" className="send-icon" />
                    </button>
              </div>
            </div>
          </div>

          {/* Learning Style Picker - only shown when no messages */}
          {!hasMessages && (
            <div className="learning-style-picker">
              <div className="style-chips">
                <button
                  className={`style-chip ${learningStyle === 'studying' ? 'active' : ''}`}
                  onClick={() => setLearningStyle('studying')}
                >
                  <img src="http://localhost:3845/assets/4cc94fa96d909a20207214a51b7031bcc94c73cd.svg" alt="graduation cap" className="chip-icon" />
                  Studying
                </button>
                <button
                  className={`style-chip ${learningStyle === 'revision' ? 'active' : ''}`}
                  onClick={() => setLearningStyle('revision')}
                >
                  <img src="http://localhost:3845/assets/d1f21b07d6b52b5ab7dd42e8756831bc2e77e4a9.svg" alt="revision" className="chip-icon" />
                  Revision
                </button>
              </div>
            </div>
          )}
        </div>

            {/* Error toast notification */}
            {error && (
              <div className="error-toast">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="error-close">×</button>
              </div>
            )}

        {sessionId && (
          <div className="summary-section">
            <button
              onClick={onSummarize}
              disabled={!sessionId || summarizing}
              className="summary-button"
            >
              {summarizing ? 'Summarizing…' : 'Summarize Session'}
            </button>
          </div>
        )}

        {summary && (
          <div className="summary-panel">
            <h3>Session Summary</h3>
            <div className="summary-content">
              {summary.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Toast Notifications */}
        {toast && (
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        )}
      </div>

      {/* Next Action Bar */}
      <NextActionBar />
    </>
  );
}

export default ChatInterface;
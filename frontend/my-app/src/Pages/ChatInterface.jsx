import React, {useState} from 'react';
import '../styles/ChatInterface.css';
import Navigation from "../components/Navigation/Navigation";//New component
import MainLayout from '../layouts/MainLayout';
import { sendMessage } from '../lib/api';

function ChatInterface() {
  const [messages, setMessages]= useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inputValue.trim() === "" || isLoading) return;
    
    const userMessage = inputValue.trim();
    setInputValue("");
    setError(null);
    
    // Add user message to chat
    setMessages(prevMessages => [...prevMessages, { text: userMessage, sender: 'user' }]);
    setIsLoading(true);

    try {
      // Call the API
      const response = await sendMessage({ 
        message: userMessage, 
        stage: 1, 
        sessionId: sessionId 
      });
      
      // Update session ID if we got a new one
      if (response.sessionId) {
        setSessionId(response.sessionId);
      }
      
      // Add AI response to chat
      setMessages(prevMessages => [...prevMessages, { 
        text: response.reply, 
        sender: 'ai' 
      }]);
      
    } catch (error) {
      console.error('Chat error:', error);
      setError(error.message || 'Failed to get response from AI');
      
      // Add error message to chat
      setMessages(prevMessages => [...prevMessages, { 
        text: `Error: ${error.message || 'Failed to get response from AI'}`, 
        sender: 'ai',
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <MainLayout>
      <div className="chat-container">
        <h1 className="chat-header">AI Study Assistant</h1>

        <div className="chat-box">
          <div className="message user-message">
            Hey, can you help me with logic problems?
          </div>

          <div className="message ai-message">
            Sure! I’d be happy to help you with logic problems.
          </div>

          {messages.map((message, index) => (
          <div 
            key={index} 
            className={`message ${message.sender}-message ${message.isError ? 'error-message' : ''}`}
          >
            {message.text}
          </div>
        ))}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="message-input-wrapper">
          <input 
            type="text" 
            placeholder={isLoading ? "AI is thinking..." : "Type your message..."} 
            className="message-input"
            value = {inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
          />
          <button 
            className="send-button" 
            type="submit" 
            onClick={handleSubmit}
            disabled={isLoading || inputValue.trim() === ""}
          >
            {isLoading ? "..." : "→"}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}

export default ChatInterface;

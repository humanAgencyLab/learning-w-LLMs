import React, { useState } from 'react';
import './ModernChatMessage.css';

const ModernChatMessage = ({ message, isUser }) => {
  const [copied, setCopied] = useState(false);
  
  // Extract text from message object
  const messageText = message.text || message.message || '';
  
  // Strip state blocks from AI messages (they should never be visible)
  const cleanText = isUser 
    ? messageText 
    : messageText.replace(/```state\s*[\s\S]*?\s*```/g, '').trim();
  
  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Handle feedback (placeholder - implement backend integration later)
  const handleFeedback = (type) => {
    console.log(`Feedback: ${type}`);
    // TODO: Send feedback to backend
  };
  
  // Handle regenerate (placeholder)
  const handleRegenerate = () => {
    console.log('Regenerate message');
    // TODO: Implement regeneration logic
  };
  
  return (
    <div className={`modern-chat-message ${isUser ? 'user-message' : 'ai-message'}`}>
      <div className="message-bubble">
        <div className="message-text">
          {cleanText}
        </div>

        {/* Action buttons - only for AI messages */}
        {!isUser && (
          <div className="message-actions">
            <button
              className="action-btn"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>

            <button
              className="action-btn"
              onClick={() => handleFeedback('thumbs-up')}
              title="Helpful"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            </button>

            <button
              className="action-btn"
              onClick={() => handleFeedback('thumbs-down')}
              title="Not helpful"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
              </svg>
            </button>

            <button
              className="action-btn"
              onClick={handleRegenerate}
              title="Regenerate"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="1 4 1 10 7 10"/>
                <polyline points="23 20 23 14 17 14"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* AI disclaimer (only show once per conversation) */}
      {!isUser && message.showDisclaimer && (
        <div className="ai-disclaimer">
          AI can make mistakes. Please double-check responses.
        </div>
      )}
    </div>
  );
};

export default ModernChatMessage;
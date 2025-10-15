import React from 'react';
import './ModernChatMessage.css';

const ModernChatMessage = ({ message, isUser }) => {
  const messageText = message.text || message.message || '';
  
  // Strip state blocks from AI messages (they shouldn't be shown to users)
  const cleanedText = isUser ? messageText : messageText.replace(/```state\s*[\s\S]*?\s*```/g, '').trim();
  
  return (
    <div className={`modern-message ${isUser ? 'user-message' : 'ai-message'}`}>
      <div className="message-content">
        {cleanedText}
      </div>
      
      {!isUser && (
        <div className="message-actions">
          <button 
            className="action-btn" 
            title="Copy"
            onClick={() => navigator.clipboard.writeText(cleanedText)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button className="action-btn" title="Helpful">👍</button>
          <button className="action-btn" title="Not helpful">👎</button>
          <button className="action-btn" title="Regenerate">🔄</button>
        </div>
      )}
    </div>
  );
};

export default ModernChatMessage;

import React from 'react';
import './EmptyState.css';

const EmptyState = ({ onStart }) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      
      <h2>Welcome to your AI Study Assistant!</h2>
      
      <p>Start a conversation by typing a message below. I'll help you learn at your own pace.</p>
      
      <div className="example-prompts">
        <p className="example-label">Try asking:</p>
        <button className="example-btn" onClick={() => onStart({ target: { value: "I want to learn Python programming" } })}>
          "I want to learn Python programming"
        </button>
        <button className="example-btn" onClick={() => onStart({ target: { value: "Explain database normalization" } })}>
          "Explain database normalization"
        </button>
        <button className="example-btn" onClick={() => onStart({ target: { value: "Help me prepare for calculus exam" } })}>
          "Help me prepare for calculus exam"
        </button>
      </div>
    </div>
  );
};

export default EmptyState;

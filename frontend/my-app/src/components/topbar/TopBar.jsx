import React, { useState } from 'react';
import './TopBar.css';
import useSessionStore from '../../state/sessionStore';

function TopBar({ onStartNewChat }) {
  const { phase, topic, sessionId } = useSessionStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  

  const handleStartChat = () => {
    // Check if there's an active session
    if (sessionId && phase && !['pre', 'assessing'].includes(phase)) {
      setShowConfirmDialog(true);
    } else {
      // No active session or in pre/assessing phase, start immediately
      onStartNewChat();
    }
  };

  const handleConfirmNewChat = () => {
    setShowConfirmDialog(false);
    onStartNewChat();
  };

  const handleCancelNewChat = () => {
    setShowConfirmDialog(false);
  };

  const shouldShowTitle = phase && !['pre', 'assessing'].includes(phase) && topic;

  return (
    <>
      <div className="topbar">
        <div className="topbar-content">
          <div className="topbar-left">
            {shouldShowTitle ? (
              <div className="learning-status">
                <div className="status-icon">
                  <img src="http://localhost:3845/assets/4cc94fa96d909a20207214a51b7031bcc94c73cd.svg" alt="graduation cap" className="icon-img" />
                </div>
                <span className="status-text" title={`You are Studying ${topic} 💪`}>
                  You are <strong>Studying</strong> {topic} 💪
                </span>
              </div>
            ) : (
              <div className="topbar-spacer"></div>
            )}
          </div>
          <div className="topbar-right">
            <button className="start-chat-btn" onClick={handleStartChat}>
              <span className="btn-text">Start Chat</span>
              <div className="btn-icon">
                <img src="http://localhost:3845/assets/7dbff9a252cceceed8d733e8ad91d1a4e9e6fdde.svg" alt="refresh" className="icon-img" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <h3 className="dialog-title">Start new chat?</h3>
            <p className="dialog-message">Current session will be saved.</p>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-cancel" onClick={handleCancelNewChat}>
                Cancel
              </button>
              <button className="dialog-btn dialog-btn-confirm" onClick={handleConfirmNewChat}>
                Start New Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TopBar;
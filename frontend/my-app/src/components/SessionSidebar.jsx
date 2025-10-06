import React, { useState, useEffect } from 'react';
import { getSessions } from '../lib/sessionApi';
import './SessionSidebar.css';

function SessionSidebar({ currentSessionId, onSessionSelect, isOpen, onToggle }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSessions(20);
      setSessions(data.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStageLabel = (stage) => {
    const stages = {
      1: 'Beginner',
      2: 'Learning',
      3: 'Practicing',
      4: 'Advanced'
    };
    return stages[stage] || 'Unknown';
  };

  return (
    <div className={`session-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h3>Recent Sessions</h3>
        <button 
          className="close-btn"
          onClick={onToggle}
          aria-label="Close sidebar"
        >
          ×
        </button>
      </div>
      
      <div className="sidebar-content">
        {loading && <div className="loading">Loading sessions...</div>}
        {error && (
          <div className="error">
            {error}
            <button onClick={loadSessions} className="retry-btn">
              Retry
            </button>
          </div>
        )}
        
        {!loading && !error && sessions.length === 0 && (
          <div className="empty">No sessions yet</div>
        )}
        
        {!loading && !error && sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}
            onClick={() => onSessionSelect(session.id)}
          >
            <div className="session-header">
              <span className="session-topic">{session.topic}</span>
              <span className="session-stage">Stage {session.stage}</span>
            </div>
            
            {session.lastMessage && (
              <div className="session-preview">
                <span className={`message-type ${session.lastMessage.isUser ? 'user' : 'ai'}`}>
                  {session.lastMessage.isUser ? 'You' : 'AI'}:
                </span>
                <span className="message-text">{session.lastMessage.text}</span>
              </div>
            )}
            
            <div className="session-meta">
              <span className="session-time">{formatDate(session.updatedAt)}</span>
              <span className="session-stage-label">{getStageLabel(session.stage)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SessionSidebar;



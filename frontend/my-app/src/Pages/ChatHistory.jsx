import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionApi from '../lib/sessionApi';
import useSessionStore from '../state/sessionStore';
import '../styles/ChatHistory.css';

function ChatHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState({ study: [], revision: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [modeFilter, setModeFilter] = useState('all'); // 'all', 'study', 'revision'
  const navigate = useNavigate();
  const { resumeSessionFromServer } = useSessionStore();

  // Fetch sessions from API
  const loadSessions = useCallback(async (searchTerm = '') => {
    try {
      setLoading(true);
      setError(null);
      
      let response;
      if (searchTerm.trim()) {
        // Use getSessions with search parameter to search by chatTitle
        response = await sessionApi.getSessions(50, { search: searchTerm.trim() });
        setIsSearching(true);
      } else {
        // Regular fetch
        response = await sessionApi.getSessions(50);
        setIsSearching(false);
      }
      
      if (response.success && response.data.sessions) {
        // Separate by mode, then group by date
        const { study, revision } = separateSessionsByMode(response.data.sessions);
        const studyGrouped = groupSessionsByDate(study);
        const revisionGrouped = groupSessionsByDate(revision);
        setSessions({ study: studyGrouped, revision: revisionGrouped });
      } else {
        setSessions({ study: [], revision: [] });
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(err.message || 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        loadSessions(searchQuery.trim());
      } else {
        loadSessions();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, loadSessions]);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showSearchModal) {
        setShowSearchModal(false);
        setSearchQuery('');
        // Reload all sessions when closing modal
        loadSessions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchModal, loadSessions]);

  // Separate sessions into Study and Revision
  const separateSessionsByMode = (sessions) => {
    const study = [];
    const revision = [];
    
    sessions.forEach(session => {
      // Check mode - 'studying' or 'reviewing' from backend, 'revision' in frontend
      const mode = session.mode || 'studying';
      if (mode === 'studying' || mode === 'Studying') {
        study.push(session);
      } else {
        revision.push(session);
      }
    });
    
    return { study, revision };
  };

  // Group sessions by date
  const groupSessionsByDate = (sessions) => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    sessions.forEach(session => {
      const sessionDate = new Date(session.createdAt);
      sessionDate.setHours(0, 0, 0, 0);
      const diffTime = today - sessionDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let dateLabel;
      if (diffDays === 0) {
        dateLabel = 'Today';
      } else if (diffDays === 1) {
        dateLabel = 'Yesterday';
      } else if (diffDays < 7) {
        dateLabel = `${diffDays} days ago`;
      } else {
        dateLabel = sessionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
      
      if (!groups[dateLabel]) {
        groups[dateLabel] = [];
      }
      groups[dateLabel].push(session);
    });
    
    return Object.entries(groups).map(([date, sessions]) => ({
      date,
      sessions
    }));
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this chat?')) {
      try {
        await sessionApi.deleteSession(sessionId);
        await loadSessions(searchQuery);
      } catch (err) {
        console.error('Failed to delete session:', err);
        setError(err.message || 'Failed to delete session');
      }
    }
  };

  const handleRenameSession = async (e, sessionId, newTitle) => {
    e.stopPropagation();
    try {
      await sessionApi.updateSessionTitle(sessionId, newTitle);
      setEditingSessionId(null);
      setEditTitle('');
      await loadSessions(searchQuery);
    } catch (err) {
      console.error('Failed to rename session:', err);
      setError(err.message || 'Failed to rename session');
    }
  };

  const startEditing = (e, sessionId, currentTitle) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditTitle(currentTitle);
  };

  const handleToggleFavorite = async (e, sessionId, currentIsFavorite) => {
    e.stopPropagation();
    try {
      const response = await sessionApi.toggleFavorite(sessionId, !currentIsFavorite);
      if (response.success) {
        // Update local state
        setSessions(prevSessions => ({
          study: prevSessions.study.map(group => ({
            ...group,
            sessions: group.sessions.map(s => 
              (s.id === sessionId || s._id === sessionId)
                ? { ...s, isFavorite: response.data.isFavorite }
                : s
            )
          })),
          revision: prevSessions.revision.map(group => ({
            ...group,
            sessions: group.sessions.map(s => 
              (s.id === sessionId || s._id === sessionId)
                ? { ...s, isFavorite: response.data.isFavorite }
                : s
            )
          }))
        }));
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      setError(err.message || 'Failed to update favorite');
    }
  };

  const handleSessionClick = async (sessionId) => {
    try {
      // Resume the session
      await resumeSessionFromServer(sessionId);
      // Navigate to chat interface
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Failed to resume session:', err);
      setError(err.message || 'Failed to resume session');
    }
  };

  if (loading && sessions.study.length === 0 && sessions.revision.length === 0) {
    return (
      <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <div className="chat-history-loading">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && sessions.study.length === 0 && sessions.revision.length === 0) {
    return (
      <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <p className="chat-history-error">Error: {error}</p>
      </div>
    );
  }

  // Get filtered sessions based on mode filter
  const getFilteredSessions = () => {
    if (modeFilter === 'study') {
      return sessions.study || [];
    } else if (modeFilter === 'revision') {
      return sessions.revision || [];
    } else {
      // Combine both, maintaining date grouping
      const combined = {};
      [...(sessions.study || []), ...(sessions.revision || [])].forEach(group => {
        if (!combined[group.date]) {
          combined[group.date] = { date: group.date, sessions: [] };
        }
        combined[group.date].sessions.push(...group.sessions);
      });
      return Object.values(combined);
    }
  };

  const filteredSessions = getFilteredSessions();
  
  // For search modal, show all sessions (already filtered by backend search)
  const searchResults = (() => {
    const combined = {};
    [...(sessions.study || []), ...(sessions.revision || [])].forEach(group => {
      if (!combined[group.date]) {
        combined[group.date] = { date: group.date, sessions: [] };
      }
      combined[group.date].sessions.push(...group.sessions);
    });
    return Object.values(combined);
  })();

  return (
    <div className="chat-history-container">
      <div className="chat-history-content">
        {/* Mode Filter Toggle */}
        <div className="chat-history-mode-filters">
          <button
            className={`chat-history-mode-filter ${modeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setModeFilter('all')}
          >
            All
          </button>
          <button
            className={`chat-history-mode-filter ${modeFilter === 'study' ? 'active' : ''}`}
            onClick={() => setModeFilter('study')}
          >
            Study
          </button>
          <button
            className={`chat-history-mode-filter ${modeFilter === 'revision' ? 'active' : ''}`}
            onClick={() => setModeFilter('revision')}
          >
            Revision
          </button>
        </div>

        {/* Search Bar */}
        <div className="chat-history-search-wrapper">
          <div 
            className="chat-history-search-container"
            onClick={() => setShowSearchModal(true)}
          >
            <svg className="chat-history-search-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search"
              className="chat-history-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearchModal(true)}
            />
          </div>
        </div>

        {/* Spotlight Search Modal */}
        {showSearchModal && (
          <div 
            className="chat-history-search-modal-overlay" 
            onClick={() => {
              setShowSearchModal(false);
              setSearchQuery('');
              // Reload all sessions when closing modal
              loadSessions();
            }}
          >
            <div className="chat-history-search-modal" onClick={(e) => e.stopPropagation()}>
              <div className="chat-history-search-modal-input-container">
                <svg className="chat-history-search-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  className="chat-history-search-modal-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }
                  }}
                  autoFocus
                />
              </div>
              {/* Search Results */}
              {searchResults.length > 0 ? (
                <div className="chat-history-search-results">
                  {searchResults.map((group, index) => (
                    <div key={index} className="chat-history-search-result-group">
                      {group.sessions.map((session) => {
                        const sessionId = session.id || session._id;
                        const displayTitle = session.chatTitle || session.topic || 'Untitled Chat';
                        return (
                          <div
                            key={sessionId}
                            className="chat-history-search-result-item"
                            onClick={() => {
                              handleSessionClick(sessionId);
                              setShowSearchModal(false);
                              setSearchQuery('');
                              // Reload all sessions when selecting a result
                              loadSessions();
                            }}
                          >
                            <svg className="chat-history-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span className="chat-history-item-title">{displayTitle}</span>
                            {session.isFavorite && (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbf24' }}>
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chat-history-search-results">
                  <div className="chat-history-empty">
                    <p>{searchQuery.trim() ? 'No results found.' : 'Start typing to search...'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat History List */}
        <div className="chat-history-list">
          {filteredSessions.length === 0 ? (
            <div className="chat-history-empty">
              <p>No chat history found.</p>
              {isSearching ? (
                <p className="chat-history-empty-hint">Try a different search term.</p>
              ) : (
                <p className="chat-history-empty-hint">Chats will appear here after you complete assessment and a learning plan is generated.</p>
              )}
            </div>
          ) : (
            filteredSessions.map((group, index) => (
              <div key={index} className="chat-history-group">
                <div className="chat-history-date-header">
                  <span className="chat-history-date-text">{group.date}</span>
                  <div className="chat-history-date-divider"></div>
                </div>
                {group.sessions.map((session) => {
                  const sessionId = session.id || session._id;
                  const isFavorite = session.isFavorite || false;
                  const displayTitle = session.chatTitle || session.topic || 'Untitled Chat';
                  const isHovered = hoveredSessionId === sessionId;
                  const isEditing = editingSessionId === sessionId;
                  return (
                    <div
                      key={sessionId}
                      className="chat-history-item"
                      onMouseEnter={() => setHoveredSessionId(sessionId)}
                      onMouseLeave={() => setHoveredSessionId(null)}
                      onClick={() => !isEditing && handleSessionClick(sessionId)}
                    >
                      <svg className="chat-history-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      {isEditing ? (
                        <input
                          type="text"
                          className="chat-history-edit-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => {
                            if (editTitle.trim()) {
                              handleRenameSession(null, sessionId, editTitle.trim());
                            } else {
                              setEditingSessionId(null);
                              setEditTitle('');
                            }
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && editTitle.trim()) {
                              handleRenameSession(e, sessionId, editTitle.trim());
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                              setEditTitle('');
                            }
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="chat-history-item-title">{displayTitle}</span>
                      )}
                      {isHovered && !isEditing && (
                        <div className="chat-history-item-actions">
                          <button
                            className="chat-history-action-button"
                            onClick={(e) => handleToggleFavorite(e, sessionId, isFavorite)}
                            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                          </button>
                          <button
                            className="chat-history-action-button"
                            onClick={(e) => startEditing(e, sessionId, displayTitle)}
                            title="Rename chat"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            className="chat-history-action-button chat-history-delete-button"
                            onClick={(e) => handleDeleteSession(e, sessionId)}
                            title="Delete chat"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      )}
                      {isFavorite && !isHovered && (
                        <div className="chat-history-item-actions">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbf24' }}>
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatHistory;

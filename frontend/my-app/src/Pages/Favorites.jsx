import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionApi from '../lib/sessionApi';
import useSessionStore from '../state/sessionStore';
import '../styles/Favorites.css';

function Favorites() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { resumeSessionFromServer } = useSessionStore();

  // Fetch favorite sessions from API
  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all favorites
      const response = await sessionApi.getSessions(50, { favorites: true });
      
      if (response.success && response.data.sessions) {
        // Group sessions by date
        const grouped = groupSessionsByDate(response.data.sessions);
        setSessions(grouped);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
      setError(err.message || 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

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

  const handleToggleFavorite = async (e, sessionId) => {
    e.stopPropagation();
    try {
      const response = await sessionApi.toggleFavorite(sessionId);
      if (response.success && !response.data.isFavorite) {
        // Remove from favorites list if unfavorited
        await loadFavorites();
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


  if (loading && sessions.length === 0) {
    return (
      <div className="favorites-container">
        <h1 className="favorites-heading">Favourites</h1>
        <div className="favorites-loading">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="favorites-container">
        <h1 className="favorites-heading">Favourites</h1>
        <p className="favorites-error">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="favorites-container">
      <div className="favorites-content">
        {/* Favorites List */}
        <div className="favorites-list">
          {sessions.length === 0 ? (
            <div className="favorites-empty">
              <p>No favorites found.</p>
              <p className="favorites-empty-hint">Bookmark conversations from Chat History to see them here.</p>
            </div>
          ) : (
            sessions.map((group, index) => (
              <div key={index} className="favorites-group">
                <div className="favorites-date-header">
                  <span className="favorites-date-text">{group.date}</span>
                  <div className="favorites-date-divider"></div>
                </div>
                {group.sessions.map((session) => {
                  const sessionId = session.id || session._id;
                  const displayTitle = session.chatTitle || session.topic || 'Untitled Chat';
                  return (
                    <div
                      key={sessionId}
                      className="favorites-item"
                      onClick={() => handleSessionClick(sessionId)}
                    >
                      <svg className="favorites-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span className="favorites-item-title">{displayTitle}</span>
                      <button
                        className="favorites-bookmark-button"
                        onClick={(e) => handleToggleFavorite(e, sessionId)}
                        title="Remove from favorites"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
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

export default Favorites;

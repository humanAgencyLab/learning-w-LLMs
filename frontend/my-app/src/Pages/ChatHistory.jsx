import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionApi from '../lib/sessionApi';
import useSessionStore from '../state/sessionStore';
// import '../styles/ChatHistory.css'; // LEGACY - Using Tailwind CSS

function ChatHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]); // stores filtered results
  const [searched, setSearched] = useState(false); // tracks if search has been performed
  const [bookmarks, setBookmarks] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { resumeSessionFromServer } = useSessionStore();

  // Fetch sessions from API
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoading(true);
        const response = await sessionApi.getSessions(50);
        if (response.success && response.data.sessions) {
          // Group sessions by date
          const grouped = groupSessionsByDate(response.data.sessions);
          setSessions(grouped);
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
        setError(err.message || 'Failed to load chat history');
      } finally {
        setLoading(false);
      }
    };
    loadSessions();
  }, []);

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

  const handleSearchClick = (e) => {
    e.preventDefault();
    // filter only when the button is clicked
    const filtered = sessions
      .map((group) => ({
        date: group.date,
        sessions: group.sessions.filter((session) =>
          (session.topic || session.chatTitle || '').toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      }))
      .filter((group) => group.sessions.length > 0);

    setResults(filtered);
    setSearched(true); // mark that user clicked Search
  };

  // Decide which data to show (search results or all chats if no search yet)
  const dataToDisplay = searched ? results : sessions;

  const toggleBookmark = (sessionId) => {
    setBookmarks((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
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

  if (loading) {
    return (
      <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <h3 className="chat-history-description">
          View your previous conversations with AI Study Assistant
        </h3>

        <div className="chat-history-list">
          <div className="chat-history-search-container">
            <input
              type="text"
              placeholder="Search..."
              className="chat-history-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearchClick(e);
                }
              }}
            />
            <button
              className="chat-history-search-button"
              onClick={handleSearchClick}
            >
              Search
            </button>
          </div>

          {/* Display the chat history */}
          {dataToDisplay.length === 0 ? (
            <div className="text-gray-500 mt-4">
              <p>No chat history found.</p>
              <p className="text-sm mt-2">Chats will appear here after you complete assessment and a learning plan is generated.</p>
            </div>
          ) : (
            dataToDisplay.map((group, index) => (
              <div key={index} className="chat-history-group">
                <div className="chat-history-date">
                  <h2>{group.date}</h2>
                </div>
                {group.sessions.map((session) => {
                  const sessionId = session.id || session._id;
                  const isBookmarked = bookmarks[sessionId];
                  const displayTitle = session.chatTitle || session.topic || 'Untitled Chat';
                  const phaseLabel = session.phase ? `(${session.phase})` : '';
                  return (
                    <div
                      key={sessionId}
                      className="chat-history-summary cursor-pointer"
                      onClick={() => handleSessionClick(sessionId)}
                    >
                      <div className="flex-1">
                        <p className="font-semibold">{displayTitle}</p>
                        {session.topic && session.topic !== displayTitle && (
                          <p className="text-sm text-gray-600">{session.topic}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {phaseLabel} • {session.progressPct || 0}% complete
                        </p>
                      </div>
                      <button
                        className={`bookmark-button ${isBookmarked ? 'bookmarked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(sessionId);
                        }}
                      >
                        {isBookmarked ? '★' : '☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
  );
}

export default ChatHistory;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sessionApi from '../../lib/sessionApi';
import useSessionStore from '../../state/sessionStore';

function RecentChats() {
  const navigate = useNavigate();
  const { resumeSessionFromServer } = useSessionStore();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentSessions();
  }, []);

  const loadRecentSessions = async () => {
    try {
      setLoading(true);
      const response = await sessionApi.getSessions(10); // Limit to 10 most recent
      if (response.success && response.data?.sessions) {
        setSessions(response.data.sessions);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error('Failed to load recent sessions:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionClick = async (sessionId) => {
    try {
      // Ensure sessionId is a string
      const id = String(sessionId || '');
      if (!id) {
        console.error('Invalid sessionId:', sessionId);
        return;
      }
      // Resume session first - this will update the store with chatTitle, topic, phase, etc.
      const sessionData = await resumeSessionFromServer(id);
      console.log('Session resumed, navigating to chat', { 
        chatTitle: sessionData?.chatTitle, 
        topic: sessionData?.topic,
        phase: sessionData?.phase 
      });
      // Small delay to ensure state is updated before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Failed to resume session:', err);
      // Show error to user (could use toast/alert here)
      alert('Failed to resume session: ' + (err.message || 'Unknown error'));
    }
  };

  // Group sessions by date (simplified for left nav)
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
        dateLabel = sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      if (!groups[dateLabel]) {
        groups[dateLabel] = [];
      }
      groups[dateLabel].push(session);
    });

    return Object.entries(groups);
  };

  if (loading) {
    return (
      <div className="px-2 py-2">
        <div className="text-xs text-gray-500">Loading recent chats...</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-2 py-2">
        <div className="text-xs text-gray-500 text-center py-4">No recent chats</div>
      </div>
    );
  }

  const groupedSessions = groupSessionsByDate(sessions);
  
  // Flatten grouped sessions and limit to 6
  const flattenedSessions = groupedSessions.flatMap(([dateLabel, dateSessions]) => 
    dateSessions.map(session => ({ ...session, dateLabel }))
  );
  const displaySessions = flattenedSessions.slice(0, 6);
  const hasMore = flattenedSessions.length > 6;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-2 py-2 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Recent Chats</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {displaySessions.map((session, idx) => {
          // Show date label for first item of each date group
          const showDateLabel = idx === 0 || 
            (displaySessions[idx - 1] && displaySessions[idx - 1].dateLabel !== session.dateLabel);
          const sessionId = session.id || session._id || session.sessionId;
          
          return (
            <div key={sessionId || `session-${idx}`}>
              {showDateLabel && (
                <div className="text-xs text-gray-500 mb-2 px-1 mt-4 first:mt-0">{session.dateLabel}</div>
              )}
              <button
                onClick={async () => {
                  if (sessionId) {
                    console.log('RecentChats: Clicked session', { sessionId, chatTitle: session.chatTitle, topic: session.topic });
                    await handleSessionClick(String(sessionId));
                  } else {
                    console.error('RecentChats: No sessionId found', session);
                  }
                }}
                className="w-full text-left px-2 py-2 mb-1 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-800 truncate"
                title={session.chatTitle || session.topic || 'Untitled Chat'}
              >
                {session.chatTitle || session.topic || 'Untitled Chat'}
              </button>
            </div>
          );
        })}
        {hasMore && (
          <button
            onClick={() => navigate('/history')}
            className="w-full text-left px-2 py-2 mt-2 rounded-lg hover:bg-gray-100 transition-colors text-sm text-blue-600 font-medium"
          >
            More...
          </button>
        )}
      </div>
    </div>
  );
}

export default RecentChats;

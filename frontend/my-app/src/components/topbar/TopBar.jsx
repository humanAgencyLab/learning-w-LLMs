import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useSessionStore from '../../state/sessionStore';

function TopBar({ onStartNewChat }) {
  const { phase, chatTitle, sessionId, mode, topic, messages, courseId, courseName, courseTopicTitle } = useSessionStore();
  const location = useLocation();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const handleStartChat = async () => {
    if (sessionId) {
      if (!(await confirm("Start new chat? Current session will be saved."))) return;
    }
    await onStartNewChat();
  };

  const handleConfirmNewChat = async () => {
    setShowConfirmDialog(false);
    await onStartNewChat();
  };

  const handleCancelNewChat = () => {
    setShowConfirmDialog(false);
  };

  // Capitalize all words in a string (title case)
  const toTitleCase = (str) => {
    if (!str) return str;
    // Remove "Revision: " prefix if present
    let cleaned = str.replace(/^Revision:\s*/i, '');
    // Capitalize first letter of each word
    return cleaned.split(' ').map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  // Show title when on /chat route and:
  // 1. In active learning phases (learning, quizzing, feedback, completed), OR
  // 2. Has sessionId (existing/resumed chat) with chatTitle or topic
  // BUT NOT in initial state (phase === 'pre' with no messages)
  // AND NOT in planning phase
  const isChatRoute = location.pathname === '/chat';
  const hasSession = sessionId && (chatTitle || topic);
  const isInitialState = phase === 'pre' && (!messages || messages.length === 0);
  const isPlanning = phase === 'planning';
  const showTitle = isChatRoute && !isInitialState && !isPlanning && (
    ['learning', 'quizzing', 'feedback', 'completed'].includes(phase) || 
    hasSession
  );
  
  // Determine title text based on mode
  const getTitleText = () => {
    // Use chatTitle if available, otherwise fallback to topic
    const displayTitle = chatTitle || topic;
    if (!displayTitle) return null;

    const isRevision = mode === 'reviewing' || mode === 'revision';
    const titleCaseTitle = toTitleCase(displayTitle);

    if (courseId) {
      return (
        <span className="flex items-center gap-2">
          {courseName && (
            <span className="text-xs font-semibold bg-[#eef3fd] text-[#4e81ee] px-2 py-0.5 rounded-full">
              {courseName}
            </span>
          )}
          <strong>Studying</strong>: {courseTopicTitle ? toTitleCase(courseTopicTitle) : titleCaseTitle}
        </span>
      );
    }

    if (isRevision) {
      return (
        <span>
          You are <strong>Revisioning</strong>: {titleCaseTitle} 💬
        </span>
      );
    } else {
      return (
        <span>
          You are <strong>Studying</strong>: {titleCaseTitle} 💪
        </span>
      );
    }
  };

  return (
    <>
      <div className="bg-white flex gap-6 items-center justify-between px-16 py-4 w-full">
        <div className="text-base font-semibold">
          {showTitle && getTitleText() ? (
            <div className="flex items-center gap-2">
              <img src="/icons/studying.svg" alt="graduation cap" className="h-6 w-6" />
              {getTitleText()}
            </div>
          ) : null}
        </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleStartChat}
                className="bg-[#4e81ee] flex gap-3 items-center justify-center px-5 py-3 rounded-[50px]"
              >
                <p className="font-bold text-base leading-6 text-white tracking-[-0.25px]">
                  Start Chat
                </p>
                <img src="/icons/start-chat.svg" alt="chat" className="w-5 h-5" />
              </button>
            </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Start new chat?</h3>
            <p className="text-gray-600 mb-6">Current session will be saved.</p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={handleCancelNewChat}
                className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmNewChat}
                className="px-4 py-2 bg-[#4e81ee] text-white rounded-lg hover:bg-blue-600"
              >
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
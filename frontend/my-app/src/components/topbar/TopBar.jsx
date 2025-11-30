import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSessionStore from '../../state/sessionStore';

function TopBar({ onStartNewChat }) {
  const { phase, chatTitle, sessionId } = useSessionStore();
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

  // Only show title when on /chat route and in active learning phases
  const isChatRoute = location.pathname === '/chat';
  const showTitle = isChatRoute && ['learning', 'quizzing', 'feedback', 'completed'].includes(phase);

  return (
    <>
      <div className="bg-white flex gap-6 items-center justify-between px-16 py-4 w-full">
        <div className="text-base font-semibold">
          {showTitle && chatTitle ? (
            <div className="flex items-center gap-2">
                  <img src="/icons/studying.svg" alt="graduation cap" className="h-6 w-6" />
              <span>
                You are <strong>Studying</strong> {chatTitle} 💪
              </span>
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
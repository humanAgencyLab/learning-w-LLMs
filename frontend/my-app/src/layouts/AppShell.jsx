import React from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from '../components/topbar/TopBar';
import LeftNav from '../components/nav/LeftNav';
import useSessionStore from '../state/sessionStore';

const AppShell = () => {
  const { reset } = useSessionStore();

  const handleStartNewChat = () => {
    // Reset the session to start fresh
    reset();
  };

      return (
        <div className="flex h-screen w-full bg-[#f7f8f8]">
          {/* Left Nav */}
          <LeftNav />

          {/* Right Content Area */}
          <div className="bg-[#f7f8f8] flex flex-col flex-1 min-h-0">
            {/* Topbar - Fixed at top */}
            <div className="flex-shrink-0">
              <TopBar onStartNewChat={handleStartNewChat} />
            </div>

            {/* Main content - Scrollable */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </div>
      );
};

export default AppShell;
import React from 'react';
import '../styles/AppShell.css';
import TopBar from '../components/topbar/TopBar';
import LeftNav from '../components/nav/LeftNav';
import useSessionStore from '../state/sessionStore';

const AppShell = ({ children }) => {
  const { reset } = useSessionStore();

  const handleStartNewChat = () => {
    // Reset the session to start fresh
    reset();
  };

  return (
    <div className="app">
      <LeftNav />
      <div className="main-area">
        <TopBar onStartNewChat={handleStartNewChat} />
        <main className="main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
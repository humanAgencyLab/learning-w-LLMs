// LEGACY - DO NOT IMPORT. AppShell/LeftNav replaces this. Kept for reference only.
import React, { useState, useEffect } from 'react';
import Navigation from './Navigation/Navigation';
// import './MainLayout.css'; // LEGACY - DO NOT IMPORT

function MainLayout({ children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isNavOpen, setIsNavOpen] = useState(window.innerWidth > 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setIsNavOpen(!mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="main-layout">
      <Navigation isOpen={isNavOpen} setIsOpen={setIsNavOpen} />

      <div
        className="main-content-wrapper"
        style={{
          marginLeft: isNavOpen ? '200px' : '0',
          width: isNavOpen ? 'calc(100% - 200px)' : '100%',
          transition: 'all 0.3s ease-in-out',
        }}
      >
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;

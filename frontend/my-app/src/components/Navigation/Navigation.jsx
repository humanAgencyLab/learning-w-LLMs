import React, { useState, useEffect } from 'react';
import NavMenu from './NavMenu';
import NavFooter from './NavFooter';
import NavModeButton from './NavModeButton';
import './Navigation.css';

function Navigation({ isOpen, setIsOpen }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const toggleNav = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setIsOpen(!mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsOpen]);

  return (
    <>
      {/* menu button */}
      <button className="menu-btn" onClick={toggleNav}>
        ☰
      </button>

      {/* Add the show class depending on isOpen */}
      <div className={`navigation-container ${isOpen ? 'show' : ''}`}>
        <NavMenu />
        <NavModeButton />
        <NavFooter />
      </div>
    </>
  );
}

export default Navigation;

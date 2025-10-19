import React from 'react';
import NavMenu from './NavMenu';
import NavFooter from './NavFooter';
import StudyPanelNav from './StudyPanelNav';
import ProfileChip from './ProfileChip';
import './LeftNav.css';

function LeftNav() {
  return (
    <div className="left-nav">
      {/* Header with logo */}
      <div className="nav-header">
        <div className="nav-logo">
          <img src="/logo.png" alt="Study Assist" className="logo-img" />
          <span className="nav-title">Study Assist</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="nav-menu-section">
        <NavMenu />
      </div>

      {/* Study Panel - Scrollable */}
      <div className="nav-study-section">
        <StudyPanelNav />
      </div>

      {/* Profile at bottom */}
      <div className="nav-profile-section">
        <ProfileChip />
      </div>
    </div>
  );
}

export default LeftNav;



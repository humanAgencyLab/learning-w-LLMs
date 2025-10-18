import React from 'react';
import PrimaryNav from './PrimaryNav';
import StudyPanelNav from '../study/StudyPanelNav';
import ProfileChip from './ProfileChip';
import useSessionStore from '../../state/sessionStore';
import './LeftNav.css';

function LeftNav() {
  const { phase, gems } = useSessionStore();
  
  // Only render StudyPanelNav when phase not in ['pre','assessing']
  const shouldShowStudyPanel = phase && !['pre', 'assessing'].includes(phase);
  

  return (
    <aside className="left">
      <div className="left-header">
        <div className="logo-section">
          <div className="logo-container">
            <img src="http://localhost:3845/assets/a3e4b99b707b5bf167ad4e32d151e28e8080cdc5.svg" alt="Study Assist" className="logo-img" />
          </div>
          <p className="logo-text">Study Assist</p>
        </div>
        <PrimaryNav />
      </div>
      <div className="left-scroll">
        {shouldShowStudyPanel && (
          <StudyPanelNav />
        )}
      </div>
      <div className="left-footer">
        <ProfileChip 
          name="John Smith" 
          gems={gems} 
        />
      </div>
    </aside>
  );
}

export default LeftNav;

import React, { useEffect, useState } from 'react';
import './LeftGamificationCard.css';

const LeftGamificationCard = ({ 
  progress = 87, 
  courseName = "Python Basic", 
  level = { current: 8, total: 10 }, 
  showTrophy = true 
}) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in animation
    setIsVisible(true);
    
    // Progress bar animation
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [progress]);

  return (
    <div className={`left-gamification-card ${isVisible ? 'visible' : ''}`}>
      <div className="card-background">
        <div className="card-content">
          <div className="progress-section">
            <div className="progress-header">
              <span className="progress-percentage">{progress}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-background"></div>
              <div 
                className="progress-bar-fill"
                style={{ width: `${animatedProgress}%` }}
              ></div>
            </div>
          </div>
          
          <div className="course-info">
            <h3 className="course-title">{courseName}</h3>
            <p className="course-level">Level {level.current}/{level.total}</p>
          </div>
          
          {showTrophy && (
            <div className="trophy-container">
              <div className="trophy-icon">🏆</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeftGamificationCard;

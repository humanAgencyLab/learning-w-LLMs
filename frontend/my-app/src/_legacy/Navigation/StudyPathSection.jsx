import React, { useState } from 'react';
import useSessionStore from '../../state/sessionStore';
import { Badge, Progress } from '../ui';

function StudyPathSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { topic, plan, progressPercent, points, gems, hasTrophy, phase } = useSessionStore();

  // Only show if we have a topic (after assessment)
  if (!topic) {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <li className="nav-menu-item study-path-item">
      <div className="study-path-header" onClick={handleToggle}>
        <span className="study-path-title">Study Path</span>
        <span className="study-path-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      {isExpanded && (
        <div className="study-path-content">
          {/* Topic Header */}
          <div className="study-path-topic">
            <h4 className="topic-name">{topic}</h4>
            <div className="topic-badges">
              {hasTrophy && <Badge variant="success">🏆 Trophy</Badge>}
              <Badge variant="info">{points} pts</Badge>
              <Badge variant="info">{gems} 💎</Badge>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="study-path-progress">
            <Progress value={progressPercent} label="Progress" />
          </div>

          {/* Modules List */}
          {plan.length > 0 && (
            <div className="study-path-modules">
              <h5>Modules</h5>
              <div className="modules-list">
                {plan.map((module, index) => (
                  <div key={module.id} className={`module-item ${module.status}`}>
                    <div className="module-header">
                      <span className="module-number">{index + 1}</span>
                      <span className="module-status">
                        {module.status === 'completed' ? '✓' : 
                         module.status === 'in_progress' ? '●' : '○'}
                      </span>
                      <span className="module-title">{module.title}</span>
                    </div>
                    {module.status === 'in_progress' && (
                      <div className="module-progress">
                        <Progress value={module.progress || 0} size="sm" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase Indicator */}
          <div className="study-path-phase">
            <span className="phase-label">Current Phase:</span>
            <Badge variant="info">{phase?.toUpperCase() || 'PRE'}</Badge>
          </div>
        </div>
      )}
    </li>
  );
}

export default StudyPathSection;

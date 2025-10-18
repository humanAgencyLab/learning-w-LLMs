import React from 'react';
import useSessionStore from '../../state/sessionStore';
import './StudyPanelNav.css';

function StudyPanelNav({ 
  topic, 
  points, 
  gems, 
  progressPercent, 
  modules, 
  currentModuleId, 
  onSelectModule 
}) {
  const sessionData = useSessionStore();
  
  // Use props if provided, otherwise derive from session store
  const displayTopic = topic || sessionData.topic || 'Learning Session';
  const displayPoints = points !== undefined ? points : sessionData.points || 0;
  // Gems calculation: Math.floor(points/20) - used in future features
  // const displayGems = gems !== undefined ? gems : Math.floor((points !== undefined ? points : sessionData.points || 0) / 20);
  const displayProgress = progressPercent !== undefined ? progressPercent : sessionData.progressPercent || 0;
  const displayModules = modules || sessionData.plan || [];
  const displayCurrentModuleId = currentModuleId || sessionData.currentModuleId;

  // Module status icon mapping (for future use)
  // const getModuleStatusIcon = (status) => {
  //   switch (status) {
  //     case 'complete': return '✓';
  //     case 'in_progress': return '●';
  //     case 'locked': return '🔒';
  //     default: return '○';
  //   }
  // };

  const handleModuleClick = (moduleId) => {
    if (onSelectModule) {
      onSelectModule(moduleId);
    }
  };

  return (
    <section className="study-panel">
      <div className="panel-top">
        <div className="topic-header">
          <p className="topic-line">Topic: {displayTopic}</p>
          <p className="points-line">{displayPoints}/100 point</p>
        </div>
        <div className="progress-section">
          <p className="progress-label">Overall Progress</p>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
          <p className="progress-text">{displayProgress}%</p>
        </div>
      </div>
      <div className="panel-list">
        {displayModules.length > 0 ? (
          displayModules.map((module, index) => (
            <div
              key={module.id}
              className={`module-item ${module.status} ${
                module.id === displayCurrentModuleId ? 'current' : ''
              }`}
              onClick={() => handleModuleClick(module.id)}
              title={module.title}
            >
              <div className="module-header">
                <div className="module-info">
                  <div className="module-title-row">
                    <span className="module-number">Module {index}</span>
                    <span className="module-points">{module.points || 20} point</span>
                  </div>
                  <span className="module-title">{module.title}</span>
                </div>
                {module.status === 'locked' && (
                  <img src="http://localhost:3845/assets/f415d45b8ee4168f89131feaf4154bc029bec4d0.svg" alt="locked" className="lock-icon" />
                )}
              </div>
              <div className="module-milestones">
                {module.milestones && module.milestones.map((milestone, mIndex) => (
                  <div key={mIndex} className={`milestone-item ${milestone.completed ? 'completed' : ''}`}>
                    <span className="milestone-text">{milestone.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="no-modules">
            <p>No modules available yet</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default StudyPanelNav;
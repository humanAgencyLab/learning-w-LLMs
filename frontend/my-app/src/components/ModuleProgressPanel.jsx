import React from 'react';
import './ModuleProgressPanel.css';

const ModuleProgressPanel = ({ 
  topic, 
  phase, 
  plan, 
  currentModuleId, 
  progress, 
  nextAction, 
  onNextAction 
}) => {
  const currentModule = plan.find(m => m.id === currentModuleId);
  
  const getPhaseBadgeClass = (phase) => {
    switch (phase) {
      case 'assessment': return 'phase-badge assessment';
      case 'learning': return 'phase-badge learning';
      case 'quiz': return 'phase-badge quiz';
      case 'feedback': return 'phase-badge feedback';
      default: return 'phase-badge';
    }
  };

  const getModuleStatusIcon = (status) => {
    switch (status) {
      case 'complete': return '✓';
      case 'in_progress': return '●';
      case 'locked': return '🔒';
      default: return '○';
    }
  };

  const getNextActionText = (nextAction) => {
    switch (nextAction) {
      case 'ask': return 'Ask Question';
      case 'teach': return 'Continue Learning';
      case 'mini_exercise': return 'Try Exercise';
      case 'start_quiz': return 'Start Quiz';
      case 'submit_quiz': return 'Submit Quiz';
      case 'review': return 'Review Material';
      default: return 'Next Step';
    }
  };

  return (
    <div className="module-progress-panel">
      {/* Header */}
      <div className="panel-header">
        <h3 className="topic-title">{topic || 'Learning Session'}</h3>
        <div className={getPhaseBadgeClass(phase)}>
          {phase?.toUpperCase() || 'ASSESSMENT'}
        </div>
      </div>

      {/* Overall Progress */}
      <div className="progress-section">
        <div className="progress-label">Overall Progress</div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress?.overallPct || 0}%` }}
          ></div>
        </div>
        <div className="progress-text">{progress?.overallPct || 0}%</div>
      </div>

      {/* Current Module */}
      {currentModule && (
        <div className="current-module">
          <h4 className="current-module-title">
            {getModuleStatusIcon(currentModule.status)} {currentModule.title}
          </h4>
          <div className="module-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress?.modulePct || 0}%` }}
              ></div>
            </div>
            <div className="progress-text">{progress?.modulePct || 0}%</div>
          </div>
          <p className="module-description">{currentModule.description}</p>
          
          {/* Milestones */}
          <div className="milestones">
            <h5>Milestones:</h5>
            <ul className="milestone-list">
              {currentModule.milestones?.map((milestone, index) => {
                const isCompleted = currentModule.completedMilestones?.includes(index) || false;
                return (
                  <li key={index} className="milestone-item">
                    <span className={`milestone-check ${isCompleted ? 'completed' : ''}`}>
                      {isCompleted ? '✓' : '○'}
                    </span>
                    <span className={`milestone-text ${isCompleted ? 'completed' : ''}`}>
                      {milestone}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* All Modules */}
      <div className="all-modules">
        <h4>Learning Path</h4>
        <div className="modules-list">
          {plan.map((module, index) => (
            <div 
              key={module.id} 
              className={`module-card ${module.status} ${
                module.id === currentModuleId ? 'current' : ''
              }`}
            >
              <div className="module-header">
                <span className="module-number">{index + 1}</span>
                <span className="module-status-icon">
                  {getModuleStatusIcon(module.status)}
                </span>
                <span className="module-title">{module.title}</span>
              </div>
              <p className="module-description">{module.description}</p>
              
              {/* Module Milestones */}
              <div className="module-milestones">
                {module.milestones?.slice(0, 3).map((milestone, mIndex) => (
                  <div key={mIndex} className="milestone-preview">
                    <span className="milestone-dot">•</span>
                    <span className="milestone-text">{milestone}</span>
                  </div>
                ))}
                {module.milestones?.length > 3 && (
                  <div className="milestone-more">
                    +{module.milestones.length - 3} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Action Button */}
      <div className="next-action-section">
        <button 
          className="next-action-btn"
          onClick={() => onNextAction && onNextAction(nextAction)}
          disabled={!nextAction}
        >
          {getNextActionText(nextAction)}
        </button>
      </div>
    </div>
  );
};

export default ModuleProgressPanel;

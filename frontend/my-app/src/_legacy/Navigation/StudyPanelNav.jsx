import React from 'react';
import useSessionStore from '../../state/sessionStore';
import './StudyPanelNav.css';

function StudyPanelNav() {
  const { topic, plan, progressPercent, points, gems, hasTrophy, phase, currentModuleId } = useSessionStore();

  // If no topic, show empty state
  if (!topic) {
    return (
      <div className="study-panel">
        <div className="study-panel-empty">
          <p>Start a learning session to see your progress here</p>
        </div>
      </div>
    );
  }

  const currentModule = plan.find(m => m.id === currentModuleId);

  return (
    <div className="study-panel">
      {/* Topic Header */}
      <div className="study-topic-header">
        <h3 className="topic-title">Topic: {topic}</h3>
        <p className="topic-points">{points}/100 points</p>
      </div>

      {/* Divider */}
      <div className="study-divider"></div>

      {/* Scrollable Modules */}
      <div className="study-modules-container">
        {plan.map((module, index) => (
          <div key={module.id} className={`study-module ${module.status}`}>
            <div className="module-header">
              <div className="module-info">
                <div className="module-title-row">
                  <span className="module-number">Module {index}</span>
                  <span className="module-points">20 points</span>
                </div>
                <h4 className="module-title">{module.title}</h4>
              </div>
              {module.status === 'locked' && (
                <div className="module-lock">
                  🔒
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="module-milestones">
              {module.milestones?.map((milestone, milestoneIndex) => {
                const isCompleted = module.completedMilestones?.includes(milestoneIndex);
                return (
                  <div key={milestoneIndex} className={`milestone ${isCompleted ? 'completed' : ''}`}>
                    <span className="milestone-text">{milestone}</span>
                    {isCompleted && <span className="milestone-check">✓</span>}
                  </div>
                );
              })}
            </div>

            {/* Divider between modules */}
            {index < plan.length - 1 && <div className="module-divider"></div>}
          </div>
        ))}
      </div>

      {/* Overall Progress Section */}
      <div className="study-overall-progress">
        <div className="progress-header">
          <h4 className="progress-title">Overall Progress</h4>
        </div>
        <div className="progress-content">
          <p className="progress-percentage">{Math.round(progressPercent)}%</p>
          <div className="progress-bar-container">
            <div className="progress-bar-bg">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudyPanelNav;



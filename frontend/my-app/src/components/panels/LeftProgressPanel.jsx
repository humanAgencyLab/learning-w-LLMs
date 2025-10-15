import React from 'react';
import './LeftProgressPanel.css';

const LeftProgressPanel = ({ srlState, gamification }) => {
  const { topic, phase, plan, currentModuleId, progress } = srlState || {};
  const { points, gems, trophy } = gamification || { points: 0, gems: 0, trophy: false };
  
  // Phase badge colors (from Figma)
  const getPhaseColor = (ph) => {
    const colors = {
      assessment: '#FDB022', // Orange
      planning: '#3B82F6',   // Blue
      learning: '#10B981',   // Green
      quiz: '#EC4899',       // Pink
      feedback: '#F97316'    // Orange-red
    };
    return colors[ph] || colors.learning;
  };
  
  // Status icon
  const getStatusIcon = (status) => {
    if (status === 'complete') return '✓';
    if (status === 'in_progress') return '▶';
    return '🔒';
  };
  
  return (
    <div className="left-progress-panel-new">
      {/* Header: Topic + Phase Badge */}
      <div className="panel-header-new">
        <h3 className="panel-topic-new">{topic || 'Python Basic'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span 
            className="phase-badge-new"
            style={{ backgroundColor: getPhaseColor(phase) }}
          >
            {(phase || 'LEARNING').toUpperCase()}
          </span>
          {!topic && (
            <span className="level-indicator">Level 8/10</span>
          )}
        </div>
      </div>
      
      {/* Overall Progress */}
      <div className="progress-section-new">
        <div className="progress-label-row">
          <span className="progress-label-text">Overall Progress</span>
          <span className="progress-percent-value">{progress?.overallPct || (topic ? 0 : 87)}%</span>
        </div>
        <div className="progress-bar-wrapper">
          <div 
            className="progress-bar-fill-new"
            style={{ width: `${progress?.overallPct || (topic ? 0 : 87)}%` }}
          />
        </div>
      </div>
      
      {/* Gamification Stats */}
      <div className="gamification-stats-new">
        <div className="stat-item-new">
          <span className="stat-icon-new">⭐</span>
          <div className="stat-text-new">
            <span className="stat-value-new">{points || 450}</span>
            <span className="stat-label-new">Points</span>
          </div>
        </div>
        <div className="stat-item-new">
          <span className="stat-icon-new">💎</span>
          <div className="stat-text-new">
            <span className="stat-value-new">{gems || 12}</span>
            <span className="stat-label-new">Gems</span>
          </div>
        </div>
        {(trophy || !topic) && (
          <div className="trophy-badge-new">
            <span className="trophy-icon-new">🏆</span>
          </div>
        )}
      </div>
      
      {/* Learning Path */}
      <div className="learning-path-section-new">
        <h4 className="section-title-new">Learning Path</h4>
        
        {(!plan || plan.length === 0) ? (
          <div className="modules-list-new">
            {/* Default modules for pre-chat state */}
            <div className="module-card-new status-complete">
              <div className="module-header-new">
                <div className="module-number-new">1</div>
                <div className="module-info-new">
                  <div className="module-title-new">Python Basics</div>
                  <div className="module-meta-new">15 min · 4 lessons</div>
                </div>
                <div className="module-status-icon-new">✓</div>
              </div>
            </div>
            <div className="module-card-new status-in_progress active">
              <div className="module-header-new">
                <div className="module-number-new">2</div>
                <div className="module-info-new">
                  <div className="module-title-new">Control Structures</div>
                  <div className="module-meta-new">25 min · 6 lessons</div>
                </div>
                <div className="module-status-icon-new">▶</div>
              </div>
              <div className="module-progress-wrapper">
                <div className="module-progress-text">Lesson 3 of 6</div>
                <div className="module-progress-bar-container">
                  <div className="module-progress-bar-fill" style={{ width: '50%' }} />
                </div>
              </div>
            </div>
            <div className="module-card-new status-locked">
              <div className="module-header-new">
                <div className="module-number-new">3</div>
                <div className="module-info-new">
                  <div className="module-title-new">Functions & Modules</div>
                  <div className="module-meta-new">30 min · 8 lessons</div>
                </div>
                <div className="module-status-icon-new">🔒</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="modules-list-new">
            {plan.map((module, idx) => {
              const isActive = currentModuleId === module.id;
              const completedCount = module.completedMilestones?.length || 0;
              const totalCount = module.milestones?.length || 1;
              const moduleProgress = (completedCount / totalCount) * 100;
              
              return (
                <div 
                  key={module.id}
                  className={`module-card-new status-${module.status} ${isActive ? 'active' : ''}`}
                >
                  {/* Module Header */}
                  <div className="module-header-new">
                    <div className="module-number-new">{idx + 1}</div>
                    <div className="module-info-new">
                      <div className="module-title-new">{module.title}</div>
                      <div className="module-meta-new">
                        15 min · {module.milestones?.length || 0} lessons
                      </div>
                    </div>
                    <div className="module-status-icon-new">
                      {getStatusIcon(module.status)}
                    </div>
                  </div>
                  
                  {/* Progress Bar (for in_progress modules) */}
                  {module.status === 'in_progress' && (
                    <div className="module-progress-wrapper">
                      <div className="module-progress-text">
                        Lesson {completedCount} of {totalCount}
                      </div>
                      <div className="module-progress-bar-container">
                        <div 
                          className="module-progress-bar-fill"
                          style={{ width: `${moduleProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Milestones (show first 3 for active/complete) */}
                  {(module.status === 'in_progress' || module.status === 'complete') && 
                   module.milestones && module.milestones.length > 0 && (
                    <div className="milestones-section-new">
                      {module.milestones.slice(0, 3).map((milestone, mIdx) => (
                        <div 
                          key={mIdx}
                          className={`milestone-item-new ${module.completedMilestones?.includes(mIdx) ? 'completed' : ''}`}
                        >
                          <span className="milestone-checkbox">
                            {module.completedMilestones?.includes(mIdx) ? '✓' : '○'}
                          </span>
                          <span className="milestone-label">{milestone}</span>
                        </div>
                      ))}
                      {module.milestones.length > 3 && (
                        <div className="milestone-more-text">
                          +{module.milestones.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftProgressPanel;
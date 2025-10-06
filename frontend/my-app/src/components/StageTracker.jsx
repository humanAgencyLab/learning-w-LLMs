import React, { useState } from 'react';
import './StageTracker.css';

const StageTracker = ({ 
  sessionId, 
  currentStage, 
  stageConfidence, 
  milestones, 
  stageHistory, 
  eligibleForQuiz,
  onReassess,
  onStartQuiz,
  onPromote,
  isOpen,
  onToggle,
  // SRL System Props
  topic = 'General Learning',
  phase = 'assessment',
  plan = [],
  currentModuleId = null,
  progress = { overallPct: 0, modulePct: 0 },
  nextAction = 'ask',
  onNextAction,
  onStartModuleQuiz
}) => {
  const [isReassessing, setIsReassessing] = useState(false);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);

  const stageLabels = {
    1: { label: 'Stage 1 Beginner', color: '#ef4444', bgColor: '#fef2f2' },
    2: { label: 'Stage 2 Learning', color: '#f59e0b', bgColor: '#fffbeb' },
    3: { label: 'Stage 3 Practicing', color: '#3b82f6', bgColor: '#eff6ff' },
    4: { label: 'Stage 4 Mastery', color: '#10b981', bgColor: '#f0fdf4' }
  };

  const stageMilestones = {
    1: [
      { key: 'M1', name: 'Concept Check', description: 'Understand basic concepts' },
      { key: 'M2', name: 'Practice Exercise', description: 'Complete simple exercises' },
      { key: 'M3', name: 'Quiz', description: 'Pass Stage 1 quiz' }
    ],
    2: [
      { key: 'M1', name: 'Pattern Recognition', description: 'Identify learning patterns' },
      { key: 'M2', name: 'Debugging', description: 'Fix common mistakes' },
      { key: 'M3', name: 'Quiz', description: 'Pass Stage 2 quiz' }
    ],
    3: [
      { key: 'M1', name: 'Advanced Practice', description: 'Complex problem solving' },
      { key: 'M2', name: 'Independent Work', description: 'Work without guidance' },
      { key: 'M3', name: 'Quiz', description: 'Pass Stage 3 quiz' }
    ],
    4: [
      { key: 'M1', name: 'Mastery Application', description: 'Apply knowledge creatively' },
      { key: 'M2', name: 'Teaching Others', description: 'Explain concepts to others' },
      { key: 'M3', name: 'Final Assessment', description: 'Comprehensive evaluation' }
    ]
  };

  const currentStageInfo = stageLabels[currentStage] || stageLabels[1];
  const currentMilestones = stageMilestones[currentStage] || stageMilestones[1];

  const handleReassess = async () => {
    if (!sessionId || isReassessing) return;
    
    setIsReassessing(true);
    try {
      await onReassess();
    } finally {
      setIsReassessing(false);
    }
  };

  const handleStartQuiz = async () => {
    if (!sessionId || isStartingQuiz) return;
    
    setIsStartingQuiz(true);
    try {
      if (currentModuleId && onStartModuleQuiz) {
        await onStartModuleQuiz(currentModuleId);
      } else {
        await onStartQuiz(currentStage);
      }
    } finally {
      setIsStartingQuiz(false);
    }
  };

  const handleNextAction = () => {
    if (onNextAction) {
      onNextAction(nextAction);
    }
  };

  const progressToNext = currentStage < 4 ? 
    Math.min((stageConfidence * 100) + (milestones ? Object.values(milestones).filter(m => m === 'done').length * 20 : 0), 100) : 100;

  // Check if we're in SRL mode
  const isSRLMode = plan.length > 0;

  return (
    <div className={`stage-tracker ${isOpen ? 'open' : ''}`}>
      <div className="stage-tracker-header">
        <h3>{isSRLMode ? 'Learning Plan' : 'Learning Progress'}</h3>
        <button 
          className="stage-tracker-close"
          onClick={onToggle}
          aria-label="Close learning progress"
        >
          ×
        </button>
      </div>

      {isSRLMode ? (
        // SRL System View
        <>
          {/* Topic and Phase */}
          <div className="srl-header">
            <h4>{topic}</h4>
            <div className={`phase-badge phase-${phase}`}>
              {phase.charAt(0).toUpperCase() + phase.slice(1)}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="progress-section">
            <div className="progress-label">Overall Progress</div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress.overallPct}%` }}
              />
            </div>
            <div className="progress-text">{progress.overallPct}%</div>
          </div>

          {/* Current Module */}
          {currentModuleId && (
            <div className="current-module-section">
              <h4>Current Module</h4>
              <div className="module-card current">
                <div className="module-header">
                  <div className="module-title">
                    {plan.find(m => m.id === currentModuleId)?.title || 'Current Module'}
                  </div>
                  <div className="module-progress">{progress.modulePct}%</div>
                </div>
                <div className="module-progress-bar">
                  <div 
                    className="module-progress-fill"
                    style={{ width: `${progress.modulePct}%` }}
                  />
                </div>
                <div className="module-description">
                  {plan.find(m => m.id === currentModuleId)?.description}
                </div>
                {plan.find(m => m.id === currentModuleId)?.milestones && (
                  <div className="module-milestones">
                    <strong>Milestones:</strong>
                    <ul>
                      {plan.find(m => m.id === currentModuleId).milestones.map((milestone, index) => (
                        <li key={index}>{milestone}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Learning Plan Modules */}
          <div className="learning-plan-section">
            <h4>Learning Path</h4>
            <div className="modules-list">
              {plan.map((module, index) => {
                const isCurrent = module.id === currentModuleId;
                const isCompleted = module.status === 'complete';
                const isLocked = module.status === 'locked';
                
                return (
                  <div 
                    key={module.id} 
                    className={`module-card ${isCurrent ? 'current' : isCompleted ? 'completed' : isLocked ? 'locked' : ''}`}
                  >
                    <div className="module-header">
                      <div className="module-number">{index + 1}</div>
                      <div className="module-title">{module.title}</div>
                      <div className="module-status">
                        {isCompleted ? '✓' : isCurrent ? '●' : isLocked ? '🔒' : '○'}
                      </div>
                    </div>
                    <div className="module-description">{module.description}</div>
                    {module.milestones && module.milestones.length > 0 && (
                      <div className="module-milestones">
                        <strong>Milestones:</strong>
                        <ul>
                          {module.milestones.map((milestone, milestoneIndex) => (
                            <li key={milestoneIndex}>{milestone}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        // Traditional Stage-based View
        <>
          {/* Current Stage Badge */}
          <div className="stage-badge" style={{ 
            backgroundColor: currentStageInfo.bgColor, 
            borderColor: currentStageInfo.color 
          }}>
            <div className="stage-number">{currentStage}</div>
            <div className="stage-label">{currentStageInfo.label}</div>
          </div>

          {/* Confidence Bar */}
          <div className="confidence-section">
            <div className="confidence-label">
              Confidence: {Math.round(stageConfidence * 100)}%
            </div>
            <div className="confidence-bar">
              <div 
                className="confidence-fill" 
                style={{ 
                  width: `${stageConfidence * 100}%`,
                  backgroundColor: currentStageInfo.color
                }}
              />
            </div>
          </div>

          {/* Progress to Next Stage */}
          {currentStage < 4 && (
            <div className="progress-section">
              <div className="progress-label">
                Progress to Stage {currentStage + 1}
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${progressToNext}%`,
                    backgroundColor: currentStageInfo.color
                  }}
                />
              </div>
              <div className="progress-text">{Math.round(progressToNext)}%</div>
            </div>
          )}

          {/* Milestones */}
          <div className="milestones-section">
            <h4>Milestones</h4>
            <div className="milestones-list">
              {currentMilestones.map((milestone) => {
                const status = milestones[milestone.key] || 'todo';
                return (
                  <div key={milestone.key} className={`milestone ${status}`}>
                    <div className="milestone-icon">
                      {status === 'done' ? '✓' : status === 'doing' ? '○' : '○'}
                    </div>
                    <div className="milestone-content">
                      <div className="milestone-name">{milestone.name}</div>
                      <div className="milestone-description">{milestone.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="action-buttons">
        {isSRLMode ? (
          // SRL Action Button
          <button 
            className="next-action-btn"
            onClick={handleNextAction}
          >
            {nextAction === 'ask' && 'Ask Question'}
            {nextAction === 'teach' && 'Continue Learning'}
            {nextAction === 'mini_exercise' && 'Try Exercise'}
            {nextAction === 'start_quiz' && 'Start Quiz'}
            {nextAction === 'submit_quiz' && 'Submit Quiz'}
            {nextAction === 'review' && 'Review Material'}
          </button>
        ) : (
          // Traditional Action Buttons
          <>
            <button 
              className="reassess-btn"
              onClick={handleReassess}
              disabled={isReassessing}
            >
              {isReassessing ? 'Re-assessing...' : 'Re-assess Now'}
            </button>
            
            {eligibleForQuiz && (
              <button 
                className="quiz-btn"
                onClick={handleStartQuiz}
                disabled={isStartingQuiz}
              >
                {isStartingQuiz ? 'Starting...' : 'Start Quiz'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Stage History */}
      <div className="stage-history">
        <h4>Recent Changes</h4>
        <div className="history-timeline">
          {stageHistory && stageHistory.slice(-5).map((entry, index) => {
            const getHistoryType = (reason) => {
              if (reason?.includes('assessment') || reason?.includes('auto')) return 'assessment';
              if (reason?.includes('quiz')) return 'quiz';
              if (reason?.includes('manual')) return 'manual';
              return 'assessment';
            };
            
            const historyType = getHistoryType(entry.reason);
            const typeIcons = {
              assessment: '🔍',
              quiz: '📝',
              manual: '⚙️'
            };
            
            return (
              <div key={index} className={`history-item history-${historyType}`}>
                <div className="history-icon">{typeIcons[historyType]}</div>
                <div className="history-content">
                  <div className="history-stage">
                    {entry.from ? `Stage ${entry.from} → ${entry.to}` : `Stage ${entry.to}`}
                  </div>
                  <div className="history-reason">{entry.reason || 'Stage change'}</div>
                  <div className="history-time">
                    {new Date(entry.at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StageTracker;

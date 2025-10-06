import React, { useState, useEffect } from 'react';
import './StagePanel.css';

function StagePanel({ 
  sessionId, 
  currentStage, 
  stageConfidence, 
  stageHistory, 
  milestones,
  onReassess, 
  onStartQuiz, 
  onStageOverride,
  isOpen,
  onToggle 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [masteryCounter, setMasteryCounter] = useState(0);
  const [lastAssessment, setLastAssessment] = useState(null);

  const stageLabels = {
    1: { name: 'Beginner', color: '#EF4444', description: 'Unconscious Incompetence' },
    2: { name: 'Learning', color: '#F59E0B', description: 'Conscious Incompetence' },
    3: { name: 'Practicing', color: '#3B82F6', description: 'Conscious Competence' },
    4: { name: 'Master', color: '#10B981', description: 'Unconscious Competence' }
  };

  const milestoneLabels = {
    1: { M1: 'Concepts', M2: 'Simple Practice' },
    2: { M1: 'Patterns', M2: 'Debugging' },
    3: { M1: 'Multi-step', M2: 'Explain Reasoning' },
    4: { M1: 'Create/Design', M2: 'Edge Cases' }
  };

  const currentStageInfo = stageLabels[currentStage] || stageLabels[1];

  // Calculate stage progress
  const getStageProgress = () => {
    if (!milestones || !milestones[currentStage]) return 0;
    const stageMilestones = milestones[currentStage];
    const total = Object.keys(stageMilestones).length;
    const completed = Object.values(stageMilestones).filter(status => status === 'complete').length;
    return Math.round((completed / total) * 100);
  };

  const getCurrentMilestone = () => {
    if (!milestones || !milestones[currentStage]) return null;
    const stageMilestones = milestones[currentStage];
    for (const [key, status] of Object.entries(stageMilestones)) {
      if (status === 'in_progress') return key;
    }
    return null;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSourceIcon = (type) => {
    switch (type) {
      case 'assessment': return '🤖';
      case 'quiz': return '📝';
      case 'manual': return '✋';
      default: return '❓';
    }
  };

  const getSourceLabel = (type) => {
    switch (type) {
      case 'assessment': return 'Assessment';
      case 'quiz': return 'Quiz';
      case 'manual': return 'Manual';
      default: return 'Unknown';
    }
  };

  // Heuristic for re-assessment
  useEffect(() => {
    if (masteryCounter >= 3 && lastAssessment) {
      const timeSinceLastAssessment = Date.now() - new Date(lastAssessment).getTime();
      const tenMinutes = 10 * 60 * 1000;
      
      if (timeSinceLastAssessment > tenMinutes) {
        console.log('🎯 Triggering re-assessment based on mastery counter');
        onReassess();
        setMasteryCounter(0);
        setLastAssessment(new Date().toISOString());
      }
    }
  }, [masteryCounter, lastAssessment, onReassess]);

  // Track mastery hints in messages
  const trackMasteryHint = (message) => {
    const masteryKeywords = [
      'correct', 'right', 'exactly', 'perfect', 'good', 'great', 'excellent',
      'understand', 'comprehend', 'grasp', 'master', 'solve', 'implement'
    ];
    
    const hasMasteryHint = masteryKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (hasMasteryHint) {
      setMasteryCounter(prev => prev + 1);
    }
  };

  const handleReassess = async () => {
    try {
      await onReassess();
      setLastAssessment(new Date().toISOString());
    } catch (error) {
      console.error('Re-assessment failed:', error);
    }
  };

  const handleStartQuiz = async () => {
    try {
      await onStartQuiz(currentStage);
    } catch (error) {
      console.error('Quiz start failed:', error);
    }
  };

  const handleStageOverride = (newStage) => {
    if (onStageOverride) {
      onStageOverride(newStage);
    }
  };

  if (!sessionId) {
    return (
      <div className={`stage-panel ${isOpen ? 'open' : ''}`}>
        <div className="stage-panel-header">
          <h3>Learning Stage</h3>
          <button className="close-btn" onClick={onToggle}>×</button>
        </div>
        <div className="stage-panel-content">
          <p className="no-session">Start a conversation to see your learning stage</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`stage-panel ${isOpen ? 'open' : ''}`}>
      <div className="stage-panel-header">
        <h3>Learning Stage</h3>
        <button className="close-btn" onClick={onToggle}>×</button>
      </div>

      <div className="stage-panel-content">
        {/* Stage Badge */}
        <div className="stage-badge" style={{ backgroundColor: currentStageInfo.color }}>
          Stage {currentStage}: {currentStageInfo.name}
        </div>
        <div className="stage-description">{currentStageInfo.description}</div>
        
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

        {/* Stage Progress */}
        <div className="progress-section">
          <div className="progress-label">
            Stage Progress: {getStageProgress()}%
          </div>
          <div className="progress-ring">
            <svg width="60" height="60" className="progress-circle">
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="4"
              />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke={currentStageInfo.color}
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 25}`}
                strokeDashoffset={`${2 * Math.PI * 25 * (1 - getStageProgress() / 100)}`}
                transform="rotate(-90 30 30)"
              />
            </svg>
            <span className="progress-text">{getStageProgress()}%</span>
          </div>
        </div>

        {/* Milestones */}
        <div className="milestones-section">
          <h4>Milestones</h4>
          <div className="milestones-list">
            {milestones && milestones[currentStage] && Object.entries(milestones[currentStage]).map(([key, status]) => (
              <div key={key} className={`milestone-item ${status}`}>
                <div className="milestone-status">
                  {status === 'complete' && '✓'}
                  {status === 'in_progress' && '●'}
                  {status === 'locked' && '○'}
                </div>
                <div className="milestone-content">
                  <div className="milestone-name">
                    {milestoneLabels[currentStage]?.[key] || key}
                  </div>
                  <div className="milestone-state">
                    {status === 'complete' && 'Complete'}
                    {status === 'in_progress' && 'In Progress'}
                    {status === 'locked' && 'Locked'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button 
            className="action-btn reassess-btn"
            onClick={handleReassess}
          >
            Re-assess
          </button>
          
          <button 
            className="action-btn quiz-btn"
            onClick={handleStartQuiz}
            disabled={!getCurrentMilestone()}
          >
            Start Quiz
          </button>
          
          <select 
            className="action-btn override-select"
            value={currentStage}
            onChange={(e) => handleStageOverride(parseInt(e.target.value))}
          >
            <option value={1}>Stage 1</option>
            <option value={2}>Stage 2</option>
            <option value={3}>Stage 3</option>
            <option value={4}>Stage 4</option>
          </select>
        </div>

        {/* Stage History */}
        <div className="history-section">
          <button 
            className="history-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'} History
          </button>
          
          {isExpanded && stageHistory && stageHistory.length > 0 && (
            <div className="history-timeline">
              {stageHistory.map((entry, index) => (
                <div key={index} className="history-item">
                  <div className="history-icon">
                    {getSourceIcon(entry.type)}
                  </div>
                  <div className="history-content">
                    <div className="history-stage">
                      {entry.from ? `Stage ${entry.from} → ${entry.to}` : `Stage ${entry.to}`}
                    </div>
                    <div className="history-source">
                      {getSourceLabel(entry.type)}
                    </div>
                    <div className="history-confidence">
                      Confidence: {Math.round(entry.confidence * 100)}%
                    </div>
                    {entry.reason && (
                      <div className="history-reason">
                        {entry.reason}
                      </div>
                    )}
                    <div className="history-timestamp">
                      {formatDate(entry.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StagePanel;



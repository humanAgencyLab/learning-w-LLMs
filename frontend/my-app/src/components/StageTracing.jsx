import React, { useState, useEffect } from 'react';
import './StageTracing.css';

function StageTracing({ sessionId, currentStage, stageConfidence, stageHistory, onStageChange, onReassess, onStartQuiz }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReassessing, setIsReassessing] = useState(false);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);

  const stageLabels = {
    1: { name: 'Beginner', color: '#EF4444', description: 'Unconscious Incompetence' },
    2: { name: 'Learning', color: '#F59E0B', description: 'Conscious Incompetence' },
    3: { name: 'Practicing', color: '#3B82F6', description: 'Conscious Competence' },
    4: { name: 'Master', color: '#10B981', description: 'Unconscious Competence' }
  };

  const currentStageInfo = stageLabels[currentStage] || stageLabels[1];

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSourceIcon = (source) => {
    switch (source) {
      case 'auto': return '🤖';
      case 'manual': return '✋';
      case 'quiz': return '📝';
      default: return '❓';
    }
  };

  const getSourceLabel = (source) => {
    switch (source) {
      case 'auto': return 'Auto Assessment';
      case 'manual': return 'Manual Override';
      case 'quiz': return 'Quiz Completion';
      default: return 'Unknown';
    }
  };

  const handleReassess = async () => {
    setIsReassessing(true);
    try {
      await onReassess();
    } finally {
      setIsReassessing(false);
    }
  };

  const handleStartQuiz = async () => {
    setIsStartingQuiz(true);
    try {
      await onStartQuiz(currentStage);
    } finally {
      setIsStartingQuiz(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="stage-tracing">
        <div className="stage-tracing-header">
          <h3>Learning Stage</h3>
        </div>
        <div className="stage-tracing-content">
          <p className="no-session">Start a conversation to see your learning stage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stage-tracing">
      <div className="stage-tracing-header">
        <h3>Learning Stage</h3>
        <button 
          className="expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      <div className="stage-tracing-content">
        {/* Current Stage Display */}
        <div className="current-stage">
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
        </div>

        {/* Action Buttons */}
        <div className="stage-actions">
          <button 
            className="action-btn reassess-btn"
            onClick={handleReassess}
            disabled={isReassessing}
          >
            {isReassessing ? 'Re-assessing...' : 'Re-assess'}
          </button>
          
          <button 
            className="action-btn quiz-btn"
            onClick={handleStartQuiz}
            disabled={isStartingQuiz}
          >
            {isStartingQuiz ? 'Starting...' : 'Start Quiz'}
          </button>
        </div>

        {/* Stage History */}
        {isExpanded && stageHistory && stageHistory.length > 0 && (
          <div className="stage-history">
            <h4>Stage History</h4>
            <div className="history-timeline">
              {stageHistory.map((entry, index) => (
                <div key={index} className="history-item">
                  <div className="history-icon">
                    {getSourceIcon(entry.source)}
                  </div>
                  <div className="history-content">
                    <div className="history-stage">
                      Stage {entry.stage}: {stageLabels[entry.stage]?.name || 'Unknown'}
                    </div>
                    <div className="history-source">
                      {getSourceLabel(entry.source)}
                    </div>
                    <div className="history-confidence">
                      Confidence: {Math.round(entry.confidence * 100)}%
                    </div>
                    {entry.rationale && (
                      <div className="history-rationale">
                        {entry.rationale}
                      </div>
                    )}
                    <div className="history-timestamp">
                      {formatDate(entry.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StageTracing;



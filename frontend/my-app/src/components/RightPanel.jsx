import React from 'react';
import './RightPanel.css';

const RightPanel = ({ srlState, onNextAction }) => {
  return (
    <div className="right-panel">
      <div className="panel-header">
        <h3>Learning Progress</h3>
      </div>
      
      <div className="panel-content">
        {srlState.topic ? (
          <div className="topic-info">
            <h4>Current Topic</h4>
            <p>{srlState.topic}</p>
            
            <div className="progress-info">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${srlState.progress.overallPct || 0}%` }}
                ></div>
              </div>
              <span>{srlState.progress.overallPct || 0}% Complete</span>
            </div>
            
            {srlState.nextAction && (
              <button 
                className="next-action-btn"
                onClick={() => onNextAction && onNextAction(srlState.nextAction)}
              >
                {srlState.nextAction.replace('_', ' ').toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <div className="empty-panel">
            <p>Start a conversation to see your learning progress here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;

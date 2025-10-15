import React, { useState, useEffect } from 'react';
import { updateSessionStage } from '../lib/sessionApi';
import './StageControl.css';

function StageControl({ sessionId, currentStage, onStageChange }) {
  const [stage, setStage] = useState(currentStage || 1);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setStage(currentStage || 1);
  }, [currentStage]);

  const handleStageChange = async (newStage) => {
    if (newStage === stage || !sessionId) return;
    
    setUpdating(true);
    setError(null);
    
    try {
      await updateSessionStage(sessionId, newStage);
      setStage(newStage);
      onStageChange(newStage);
    } catch (err) {
      console.error('Failed to update stage:', err);
      setError('Failed to update stage');
      // Revert the UI change
      setStage(stage);
    } finally {
      setUpdating(false);
    }
  };

  const stages = [
    { value: 1, label: 'Beginner', description: 'Learning basics' },
    { value: 2, label: 'Learning', description: 'Building understanding' },
    { value: 3, label: 'Practicing', description: 'Applying knowledge' },
    { value: 4, label: 'Advanced', description: 'Mastering concepts' }
  ];

  return (
    <div className="stage-control">
      <label htmlFor="stage-select" className="stage-label">
        Learning Stage:
      </label>
      <select
        id="stage-select"
        value={stage}
        onChange={(e) => handleStageChange(parseInt(e.target.value))}
        disabled={updating || !sessionId}
        className="stage-select"
      >
        {stages.map((stageOption) => (
          <option key={stageOption.value} value={stageOption.value}>
            Stage {stageOption.value}: {stageOption.label}
          </option>
        ))}
      </select>
      
      {updating && <span className="updating">Updating...</span>}
      {error && <span className="error">{error}</span>}
      
      <div className="stage-description">
        {stages.find(s => s.value === stage)?.description}
      </div>
    </div>
  );
}

export default StageControl;





import React from 'react';
import useSessionStore from '../state/sessionStore';
import { HARDCODED_PROFILE } from '../data/userProfile';

const StateDisplay = () => {
  const {
    sessionId,
    learningStyle,
    phase,
    topic,
    chatTitle,
    plan,
    progressPercent,
    points,
    gems,
    hasTrophy,
    isViewOnly,
    nextAction,
    getLearningStyleDisplayName,
    getPhaseDisplayName,
  } = useSessionStore();

  const containerStyles = {
    position: 'fixed',
    top: '10px',
    right: '10px',
    backgroundColor: 'var(--color-panel)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    fontSize: '12px',
    color: 'var(--color-text)',
    maxWidth: '300px',
    zIndex: 1000,
    fontFamily: 'monospace',
  };

  const titleStyles = {
    fontWeight: 'bold',
    marginBottom: 'var(--space-2)',
    color: 'var(--color-primary)',
  };

  const rowStyles = {
    marginBottom: 'var(--space-1)',
    display: 'flex',
    justifyContent: 'space-between',
  };

  const labelStyles = {
    color: 'var(--color-muted)',
  };

  return (
    <div style={containerStyles}>
      <div style={titleStyles}>State Debug Panel</div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>User:</span>
        <span>{HARDCODED_PROFILE.name}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Learning Style:</span>
        <span>{getLearningStyleDisplayName()}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Phase:</span>
        <span>{getPhaseDisplayName()}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Session ID:</span>
        <span>{sessionId || 'None'}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Topic:</span>
        <span>{topic || 'None'}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Progress:</span>
        <span>{progressPercent}%</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Points:</span>
        <span>{points}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Gems:</span>
        <span>{gems}</span>
      </div>
      
      <div style={rowStyles}>
        <span style={labelStyles}>Trophy:</span>
        <span>{hasTrophy ? '🏆' : '❌'}</span>
      </div>
    </div>
  );
};

export default StateDisplay;

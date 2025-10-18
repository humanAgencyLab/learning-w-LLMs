import React from 'react';

export const Progress = ({ 
  value = 0, 
  max = 100, 
  label, 
  className = '', 
  ...props 
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const containerStyles = {
    width: '100%',
    marginBottom: 'var(--space-4)',
  };

  const labelStyles = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
    color: 'var(--color-text)',
    fontSize: '14px',
  };

  const progressBarStyles = {
    width: '100%',
    height: '8px',
    backgroundColor: 'var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  };

  const progressFillStyles = {
    height: '100%',
    width: `${percentage}%`,
    backgroundColor: 'var(--color-primary)',
    borderRadius: 'var(--radius-md)',
    transition: 'width 0.3s ease',
  };

  return (
    <div style={containerStyles} className={className} {...props}>
      {label && (
        <div style={labelStyles}>
          <span>{label}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div style={progressBarStyles}>
        <div style={progressFillStyles} />
      </div>
    </div>
  );
};

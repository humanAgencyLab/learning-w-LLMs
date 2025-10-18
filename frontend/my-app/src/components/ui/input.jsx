import React from 'react';

export const Input = ({ 
  label, 
  error, 
  className = '', 
  ...props 
}) => {
  const inputStyles = {
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${error ? 'var(--color-warning)' : 'var(--color-border)'}`,
    backgroundColor: 'var(--color-panel)',
    color: 'var(--color-text)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  };

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {label && (
        <label style={{ 
          display: 'block', 
          marginBottom: 'var(--space-2)', 
          color: 'var(--color-text)',
          fontSize: '14px',
          fontWeight: '500',
        }}>
          {label}
        </label>
      )}
      <input 
        style={inputStyles}
        className={className}
        {...props}
      />
      {error && (
        <div style={{ 
          color: 'var(--color-warning)', 
          fontSize: '12px', 
          marginTop: 'var(--space-1)' 
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

import React from 'react';

export const Select = ({ 
  label, 
  error, 
  options = [], 
  className = '', 
  ...props 
}) => {
  const selectStyles = {
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
      <select 
        style={selectStyles}
        className={className}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

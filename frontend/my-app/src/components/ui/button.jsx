import React from 'react';

export const Button = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    width: fullWidth ? '100%' : 'auto',
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-text)',
    },
    secondary: {
      backgroundColor: 'var(--color-panel)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text)',
      border: '1px solid transparent',
    },
  };

  const styles = {
    ...baseStyles,
    ...variantStyles[variant],
  };

  return (
    <button 
      style={styles} 
      className={className}
      {...props}
    >
      {children}
    </button>
  );
};

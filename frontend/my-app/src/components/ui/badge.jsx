import React from 'react';

export const Badge = ({ 
  children, 
  variant = 'info', 
  className = '', 
  ...props 
}) => {
  const variantStyles = {
    info: {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-text)',
    },
    success: {
      backgroundColor: 'var(--color-positive)',
      color: 'var(--color-text)',
    },
    warning: {
      backgroundColor: 'var(--color-warning)',
      color: 'var(--color-text)',
    },
  };

  const badgeStyles = {
    ...variantStyles[variant],
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-block',
  };

  return (
    <span style={badgeStyles} className={className} {...props}>
      {children}
    </span>
  );
};

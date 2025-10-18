import React from 'react';

export const Topbar = ({ 
  children, 
  height = '60px', 
  className = '', 
  ...props 
}) => {
  const topbarStyles = {
    height,
    backgroundColor: 'var(--color-panel)',
    borderBottom: '1px solid var(--color-border)',
    padding: '0 var(--space-6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  };

  return (
    <div style={topbarStyles} className={className} {...props}>
      {children}
    </div>
  );
};

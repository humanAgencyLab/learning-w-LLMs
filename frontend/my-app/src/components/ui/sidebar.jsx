import React from 'react';

export const Sidebar = ({ 
  children, 
  isOpen = true, 
  width = '250px', 
  className = '', 
  ...props 
}) => {
  const sidebarStyles = {
    width: isOpen ? width : '0',
    height: '100%',
    backgroundColor: 'var(--color-panel)',
    borderRight: '1px solid var(--color-border)',
    padding: isOpen ? 'var(--space-6)' : '0',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 100,
  };

  return (
    <div style={sidebarStyles} className={className} {...props}>
      {isOpen && children}
    </div>
  );
};

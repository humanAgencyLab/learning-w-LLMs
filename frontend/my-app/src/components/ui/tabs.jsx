import React, { useState } from 'react';

export const Tabs = ({ 
  tabs = [], 
  defaultTab = 0, 
  className = '', 
  ...props 
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabStyles = {
    display: 'flex',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 'var(--space-4)',
  };

  const tabButtonStyles = (isActive) => ({
    padding: 'var(--space-3) var(--space-4)',
    border: 'none',
    backgroundColor: 'transparent',
    color: isActive ? 'var(--color-primary)' : 'var(--color-muted)',
    borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: isActive ? '500' : '400',
    transition: 'all 0.2s ease',
  });

  const contentStyles = {
    color: 'var(--color-text)',
  };

  return (
    <div className={className} {...props}>
      <div style={tabStyles}>
        {tabs.map((tab, index) => (
          <button
            key={index}
            style={tabButtonStyles(activeTab === index)}
            onClick={() => setActiveTab(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={contentStyles}>
        {tabs[activeTab]?.content}
      </div>
    </div>
  );
};

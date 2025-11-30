import React, { useState } from 'react';

function CollapsibleSection({ title, children, defaultExpanded = false, icon }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`collapsible-section ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="collapsible-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="collapsible-header-content">
          {icon && <span className="collapsible-icon">{icon}</span>}
          <h3 className="collapsible-title">{title}</h3>
        </div>
        <span className="collapsible-arrow">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      {isExpanded && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
}

export default CollapsibleSection;


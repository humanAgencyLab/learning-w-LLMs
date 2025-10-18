import React from 'react';

export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className = '', 
  ...props 
}) => {
  if (!isOpen) return null;

  const overlayStyles = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyles = {
    backgroundColor: 'var(--color-panel)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
    padding: 'var(--space-6)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  };

  const headerStyles = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-4)',
    paddingBottom: 'var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
  };

  const titleStyles = {
    color: 'var(--color-text)',
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  };

  const closeButtonStyles = {
    background: 'none',
    border: 'none',
    color: 'var(--color-muted)',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 'var(--space-1)',
  };

  return (
    <div style={overlayStyles} onClick={onClose}>
      <div 
        style={modalStyles} 
        className={className}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        <div style={headerStyles}>
          {title && <h2 style={titleStyles}>{title}</h2>}
          <button style={closeButtonStyles} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

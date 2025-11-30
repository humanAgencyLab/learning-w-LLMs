import React, { useState, useEffect } from 'react';

// Simple event bus for toast notifications
class ToastEventBus {
  constructor() {
    this.listeners = [];
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  publish(toast) {
    this.listeners.forEach(listener => listener(toast));
  }
}

export const toastBus = new ToastEventBus();

export const Toast = ({ 
  id, 
  message, 
  type = 'info', 
  duration = 3000, 
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(id), 300); // Allow fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  const typeStyles = {
    info: {
      backgroundColor: 'var(--color-panel, #ffffff)',
      borderLeft: '4px solid var(--color-primary, #4e81ee)',
      color: 'var(--color-text, #111827)',
    },
    success: {
      backgroundColor: 'var(--color-panel, #ffffff)',
      borderLeft: '4px solid var(--color-positive, #10b981)',
      color: 'var(--color-text, #111827)',
    },
    warning: {
      backgroundColor: 'var(--color-panel, #fff7ed)',
      borderLeft: '4px solid var(--color-warning, #f59e0b)',
      color: 'var(--color-text, #92400e)',
    },
  };

  const toastStyles = {
    ...typeStyles[type],
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #e5e7eb)',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
    transition: 'all 0.3s ease',
    maxWidth: '400px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '1.5',
    zIndex: 1002,
  };

  return (
    <div style={toastStyles}>
      {message}
    </div>
  );
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toastBus.subscribe((toast) => {
      const id = Date.now().toString();
      setToasts(prev => [...prev, { ...toast, id }]);
    });

    return unsubscribe;
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const containerStyles = {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1001,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  };

  return (
    <div style={containerStyles}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={removeToast}
        />
      ))}
    </div>
  );
};

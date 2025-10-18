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
      backgroundColor: 'var(--color-panel)',
      borderLeft: '4px solid var(--color-primary)',
    },
    success: {
      backgroundColor: 'var(--color-panel)',
      borderLeft: '4px solid var(--color-positive)',
    },
    warning: {
      backgroundColor: 'var(--color-panel)',
      borderLeft: '4px solid var(--color-warning)',
    },
  };

  const toastStyles = {
    ...typeStyles[type],
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    marginBottom: 'var(--space-2)',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'all 0.3s ease',
    maxWidth: '400px',
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
    top: 'var(--space-4)',
    right: 'var(--space-4)',
    zIndex: 1001,
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

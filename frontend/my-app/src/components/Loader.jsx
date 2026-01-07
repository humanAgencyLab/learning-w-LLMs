import React from 'react';
import '../styles/Loader.css';

const Loader = ({ 
  size = 'medium', 
  message = '', 
  overlay = false,
  fullScreen = false 
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  const spinner = (
    <div className={`loader-spinner ${sizeClasses[size]}`}>
      <div className="loader-spinner-ring"></div>
      <div className="loader-spinner-ring"></div>
      <div className="loader-spinner-ring"></div>
      <div className="loader-spinner-ring"></div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="loader-fullscreen">
        <div className="loader-content">
          {spinner}
          {message && <p className="loader-message">{message}</p>}
        </div>
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="loader-overlay">
        <div className="loader-content">
          {spinner}
          {message && <p className="loader-message">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="loader-inline">
      {spinner}
      {message && <p className="loader-message">{message}</p>}
    </div>
  );
};

export default Loader;


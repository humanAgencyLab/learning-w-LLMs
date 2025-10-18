import React from 'react';

export const Avatar = ({ 
  src, 
  alt, 
  size = 'md', 
  fallback, 
  className = '', 
  ...props 
}) => {
  const sizeStyles = {
    sm: '32px',
    md: '40px',
    lg: '48px',
    xl: '64px',
  };

  const avatarStyles = {
    width: sizeStyles[size],
    height: sizeStyles[size],
    borderRadius: '50%',
    backgroundColor: 'var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text)',
    fontSize: size === 'sm' ? '12px' : size === 'lg' ? '18px' : '14px',
    fontWeight: '500',
    overflow: 'hidden',
  };

  const imageStyles = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div style={avatarStyles} className={className} {...props}>
      {src ? (
        <img src={src} alt={alt} style={imageStyles} />
      ) : (
        <span>{fallback || alt?.charAt(0)?.toUpperCase() || '?'}</span>
      )}
    </div>
  );
};

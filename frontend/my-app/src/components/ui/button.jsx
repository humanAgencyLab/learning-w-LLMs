import React from "react";

export function Button({ className = "", variant = "ghost", size = "md", style = {}, ...props }) {
  const baseStyles = "inline-flex items-center justify-center gap-2 rounded-lg border focus-visible:outline-none focus-visible:ring-2";
  
  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };
  
  const variantStyles = {
    solid: {
      backgroundColor: 'var(--brand)',
      color: 'white',
      borderColor: 'transparent',
      boxShadow: '0 6px 24px rgba(0,0,0,0.06)'
    },
    ghost: {
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      borderColor: 'var(--border)',
      boxShadow: '0 6px 24px rgba(0,0,0,0.06)'
    }
  };
  
  return (
    <button 
      className={`${baseStyles} ${sizeClasses[size]} ${className}`}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    />
  );
}
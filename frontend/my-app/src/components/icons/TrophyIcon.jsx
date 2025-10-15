import React from 'react';

export default function TrophyIcon({ className = '', ...props }) {
  return (
    <svg 
      className={`icon-20 ${className}`}
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path 
        d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z" 
        fill="currentColor"
      />
      <path 
        d="M7 12L8 16L12 17L8 18L7 22L5 18L1 17L5 16L7 12Z" 
        fill="currentColor"
      />
      <path 
        d="M17 12L16 16L12 17L16 18L17 22L19 18L23 17L19 16L17 12Z" 
        fill="currentColor"
      />
    </svg>
  );
}

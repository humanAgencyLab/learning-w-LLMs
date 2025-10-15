import React from 'react';

export default function GemIcon({ className = '', ...props }) {
  return (
    <svg 
      className={`icon-20 ${className}`}
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path 
        d="M6 3L3 6V18L6 21H18L21 18V6L18 3H6Z" 
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path 
        d="M8 8L12 4L16 8L12 12L8 8Z" 
        fill="currentColor"
      />
      <path 
        d="M8 16L12 20L16 16L12 12L8 16Z" 
        fill="currentColor"
      />
    </svg>
  );
}

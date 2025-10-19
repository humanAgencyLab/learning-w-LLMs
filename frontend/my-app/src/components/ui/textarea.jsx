import React from "react";

export function Textarea(props) {
  return (
    <textarea
      className="block w-full resize-none rounded-lg border p-3 text-sm leading-5"
      style={{ 
        minHeight: "48px",
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.06)'
      }}
      {...props}
    />
  );
}

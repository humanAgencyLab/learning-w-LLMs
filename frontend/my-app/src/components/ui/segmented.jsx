import React from "react";

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border p-1" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className="rounded-md px-4 py-2 text-sm"
          style={{ backgroundColor: value === o.value ? 'var(--brand-ghost)' : 'transparent' }}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

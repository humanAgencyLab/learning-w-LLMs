import React, { useState } from 'react';

/**
 * Reusable expander for the Insights IA redesign. Matches the existing card
 * conventions on InstructorInsightsPage (bg-white border border-gray-200
 * rounded-xl). Children are unmounted when collapsed (not display:none), so an
 * expensive child like the heatmap pays no render cost while closed.
 */
export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  innerRef,
  children,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const toggle = () => {
    if (isControlled) onToggle?.(!open);
    else setInternalOpen((o) => !o);
  };
  return (
    <section ref={innerRef} className="bg-white border border-gray-200 rounded-xl scroll-mt-6">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors rounded-xl"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-gray-400 text-sm leading-none w-3 flex-shrink-0">{open ? '▾' : '▸'}</span>
          <span className="text-base font-semibold text-gray-900 truncate">{title}</span>
        </span>
        {subtitle && <span className="text-xs text-gray-500 flex-shrink-0">{subtitle}</span>}
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </section>
  );
}

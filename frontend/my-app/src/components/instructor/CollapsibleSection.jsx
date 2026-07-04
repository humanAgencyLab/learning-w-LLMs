import React, { useState } from 'react';

/**
 * Reusable expander (Insights IA / PR-3 restyle). Matches the mockup's Course
 * health card: title + muted preview text on the left, chevron chip on the
 * right. Children are unmounted when collapsed (not display:none), so an
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
    <section ref={innerRef} className="bg-surface border border-hairline rounded-2xl shadow-card scroll-mt-6">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 p-5 text-left rounded-2xl"
      >
        <span className="flex items-baseline gap-3 min-w-0">
          <span className="text-base font-bold text-ink-900 whitespace-nowrap">{title}</span>
          {subtitle && <span className="text-[12.5px] text-ink-300 truncate">{subtitle}</span>}
        </span>
        <span className="w-[26px] h-[26px] rounded-lg bg-surface-chip text-ink-500 flex items-center justify-center text-[15px] font-bold flex-shrink-0">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && <div className="px-5 pb-5 pt-0 animate-fadeIn">{children}</div>}
    </section>
  );
}

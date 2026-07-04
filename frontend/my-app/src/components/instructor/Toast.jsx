import React from 'react';
import useToastStore from '../../state/toastStore';

/** PR-10 global toast — mounted once in InstructorShell. */
export default function ToastMount() {
  const { message, show } = useToastStore();
  if (!show) return null;
  return (
    <div
      key={message} /* replay popIn when the message changes */
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[90] bg-ink-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-toast animate-popIn"
    >
      {message}
    </div>
  );
}

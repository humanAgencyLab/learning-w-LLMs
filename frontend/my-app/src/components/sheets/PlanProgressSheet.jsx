import React, { useState } from 'react';
import RightStudyPanel from '../panels/RightStudyPanel';

export default function PlanProgressSheet(props) {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <button
        className="w-full rounded-xl border bg-white py-2.5 text-sm font-medium shadow-sm hover:bg-neutral-50 transition-colors"
        onClick={() => setOpen(true)}
      >
        Plan & Progress
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">Plan & Progress</h3>
              <button 
                className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors" 
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-3">
              <RightStudyPanel {...props} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import React from 'react';

const ProgressIndicator = ({ points, gems, progressPct, milestoneInfo }) => {
  const pointsRemaining = 100 - points;
  const milestoneText = milestoneInfo 
    ? `Milestone ${milestoneInfo.current} of ${milestoneInfo.total} in Module ${milestoneInfo.moduleNum}`
    : null;
  
  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/* Points indicator */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700">Points:</span>
          <span className="font-bold text-blue-600">{points}/100</span>
          {pointsRemaining > 0 && (
            <span className="text-slate-500 text-xs">({pointsRemaining} remaining)</span>
          )}
        </div>
        
        {/* Gems indicator */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700">Gems:</span>
          <span className="font-bold text-yellow-600">💎 {gems}</span>
        </div>
        
        {/* Progress bar */}
        <div className="flex-1 min-w-[100px]">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        
        {/* Percentage */}
        <div className="text-xs font-medium text-slate-600">
          {progressPct}%
        </div>
      </div>
      
      {/* Milestone info */}
      {milestoneText && (
        <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
          {milestoneText}
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;

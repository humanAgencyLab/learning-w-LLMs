import React from 'react';
import useSessionStore from '../../state/sessionStore';

function StudyPanelNav({ 
  topic, 
  progressPct, 
  modules 
}) {
  const sessionData = useSessionStore();
  
  // Use props if provided, otherwise derive from session store
  const displayTopic = topic || sessionData.topic;
  const displayProgress = progressPct !== undefined ? progressPct : sessionData.progressPercent || 0;
  const displayModules = modules || sessionData.plan || [];

  // Don't render if no topic data
  if (!displayTopic) {
    return null;
  }

  return (
    <section className="rounded-lg border border-[#e6e7e8] bg-[#f7f8f8] p-2 h-full flex flex-col">
      {/* Topic header (fixed) */}
      <div className="pb-1 flex-shrink-0">
        <div className="text-xs font-semibold truncate text-[#030712]">Topic: {displayTopic}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-white">
          <div
            className="h-full rounded bg-[#4e81ee]"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>

      {/* Overall row (fixed) */}
      <div className="py-1 text-xs text-[#5b6470] flex-shrink-0">
        Overall Progress <span className="float-right">{displayProgress}%</span>
      </div>

      {/* Scrollable modules */}
      <div className="min-h-0 flex-1 overflow-auto">
        <ul className="pr-1">
          {displayModules.map(module => (
            <li key={module.id} className="mb-1 rounded bg-white p-2 text-xs">
              <div className="font-medium text-[#030712]">{module.title}</div>
              <ul className="mt-1 pl-3 text-xs text-[#5b6470] list-disc">
                {module.milestones?.slice(0, 2).map((milestone, i) => (
                  <li key={i} className={milestone.completed ? 'text-green-600' : ''}>
                    {milestone.completed ? '✓ ' : '○ '}{milestone.text}
                  </li>
                ))}
                {module.milestones?.length > 2 && (
                  <li>+{module.milestones.length - 2} more...</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default StudyPanelNav;
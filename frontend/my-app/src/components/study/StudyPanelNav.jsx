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
  // Use progressPct from session store, which should be updated from backend
  const displayProgress = progressPct !== undefined ? progressPct : 
                         (sessionData.progressPct !== undefined ? sessionData.progressPct : 
                         (sessionData.progressPercent || 0));
  const displayModules = modules || sessionData.plan || [];

  // Don't render if no topic data
  if (!displayTopic) {
    return null;
  }

  // Determine module states based on sequential completion logic
  const getModuleState = (module, index) => {
    const totalMilestones = module.milestones?.length || 0;
    const completedMilestones = module.milestones?.filter(m => m.completed).length || 0;
    
    // Check if previous module is completed
    const previousModuleCompleted = index === 0 || 
      (displayModules[index - 1]?.milestones?.every(m => m.completed) || false);
    
    // Check if current module is completed
    const isCompleted = completedMilestones === totalMilestones && totalMilestones > 0;
    
    // Check if current module is active (has some progress but not complete)
    const isActive = completedMilestones > 0 && !isCompleted && previousModuleCompleted;
    
    // Check if module is locked (previous not completed)
    const isLocked = !previousModuleCompleted;
    
    if (isCompleted) return 'completed';
    if (isActive) return 'active';
    if (isLocked) return 'locked';
    return 'available';
  };

  return (
    <section className="relative rounded-lg border border-[#e6e7e8] bg-gradient-to-b from-[#f7f8f8] to-[#ffffff] p-3 h-full flex flex-col overflow-hidden">
      {/* Background Elliptical Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large Ellipse - Top Right */}
        <div className="absolute top-0 right-0 w-[137px] h-[207px] bg-gradient-to-br from-[#4e81ee]/10 to-[#4e81ee]/5 rounded-full transform translate-x-1/2 -translate-y-1/2"></div>
        {/* Medium Ellipse - Center Left */}
        <div className="absolute top-16 left-0 w-[149px] h-[187px] bg-gradient-to-br from-[#4e81ee]/8 to-[#4e81ee]/3 rounded-full transform -translate-x-1/2"></div>
      </div>

      {/* Topic Section - Sticky at top with point count */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-[#f7f8f8] to-transparent pb-2 flex-shrink-0">
        <div className="text-sm font-semibold truncate text-[#030712] mb-1">Topic: {displayTopic}</div>
        <div className="text-xs text-[#5b6470] mb-2">{sessionData.points || 5}/100 point</div>
      </div>

      {/* Scrollable Modules Section */}
      <div className="min-h-0 flex-1 overflow-auto py-2 relative z-10">
        <ul className="space-y-2">
          {displayModules.map((module, index) => {
            const moduleState = getModuleState(module, index);
            const isActive = moduleState === 'active';
            const isCompleted = moduleState === 'completed';
            const isLocked = moduleState === 'locked';
            
            return (
              <li key={module.id || `module-${index}`} className={`rounded-lg p-3 shadow-sm backdrop-blur-sm ${
                isActive ? 'bg-gradient-to-r from-orange-50 to-white border border-orange-200' : 
                isCompleted ? 'bg-white border border-gray-200' :
                isLocked ? 'bg-white border border-gray-200' :
                'bg-white border border-gray-200'
              }`}>
                {/* Module Header */}
                <div className="mb-2">
                  {/* Module Number and Points Row */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium text-sm ${
                      isActive ? 'text-gray-800' :
                      isCompleted ? 'text-gray-800' :
                      isLocked ? 'text-gray-400' :
                      'text-gray-800'
                    }`}>
                      Module {index + 1}
                    </span>
                    <div className={`flex items-center ${isLocked ? 'gap-1' : 'gap-2'}`}>
                      <span className={`text-xs ${
                        isLocked ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {module.points || 20} point
                      </span>
                      {isLocked && (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {/* Module Name Row */}
                  <div className={`text-sm ${
                    isActive ? 'text-gray-800 font-medium' :
                    isCompleted ? 'text-gray-800 font-medium' :
                    isLocked ? 'text-gray-400' :
                    'text-gray-800'
                  }`}>
                    {module.title}
                  </div>
                </div>
                
                {/* Module Milestones */}
                <ul className="space-y-1">
                  {module.milestones?.map((milestone, i) => {
                    // Determine milestone state within the module
                    const previousMilestoneCompleted = i === 0 || module.milestones[i - 1]?.completed;
                    const isMilestoneCompleted = milestone.completed;
                    const isMilestoneActive = !isMilestoneCompleted && previousMilestoneCompleted && isActive;
                    const isMilestoneLocked = !previousMilestoneCompleted && !isMilestoneCompleted;
                    
                    return (
                      <li 
                        key={i} 
                        className={`text-xs flex items-center gap-2 ${
                          isMilestoneCompleted ? 'text-gray-800 font-medium' : 
                          isMilestoneActive ? 'text-orange-600 font-medium' :
                          isMilestoneLocked ? 'text-gray-400' :
                          isLocked ? 'text-gray-400' :
                          'text-gray-600'
                        }`}
                      >
                        <span className="w-2 h-2 flex items-center justify-center text-xs">
                          {isMilestoneCompleted ? '✓' : 
                           isMilestoneActive ? '●' : '•'}
                        </span>
                        <span className="flex-1">{milestone.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Progress Section - Sticky at bottom with progress bar */}
      <div className="sticky bottom-0 z-10 bg-gradient-to-b from-transparent to-[#ffffff] pt-2 flex-shrink-0 backdrop-blur-sm">
        <div className="border-t border-gray-200 pt-2">
          <div className="text-xs text-gray-600 text-center mb-2">
            Overall Progress
          </div>
          <div className="text-sm font-semibold text-gray-800 text-center mb-2">
            {displayProgress}%
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-300"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default StudyPanelNav;
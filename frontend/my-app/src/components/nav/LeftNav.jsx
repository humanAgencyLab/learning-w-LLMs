import React from 'react';
import PrimaryNav from './PrimaryNav';
import StudyPanelNav from '../study/StudyPanelNav';
import useSessionStore from '../../state/sessionStore';

function LeftNav() {
  const { phase, gems } = useSessionStore();
  
  const showStudyPanel = ['learning', 'quizzing', 'feedback', 'completed'].includes(phase);

  return (
    <div className="bg-white border-r border-[#e6e7e8] h-full w-[252px] flex flex-col flex-shrink-0">
      {/* Brand - Header Section (matches topbar height, max 10%) */}
      <div className="flex items-center gap-2 pl-3 pr-4 py-3 h-[72px] flex-shrink-0">
        <div className="w-8 h-8 flex items-center justify-center">
            <img alt="Study Assist" className="w-6 h-6" src="/icons/logo.svg" />
        </div>
        <p className="font-bold text-base leading-5 text-[#030712] tracking-[-0.4px]">
          Study Assist
        </p>
      </div>

      {/* Middle Content Area - Takes remaining space */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Navigation Menu - Flexible height, scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-1 px-0 py-2">
            <PrimaryNav />
          </div>
        </div>

        {/* Study Panel - Flexible height, scrollable */}
        {showStudyPanel && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-0 py-2">
              <StudyPanelNav />
            </div>
          </div>
        )}
      </div>

          {/* Profile Section - Footer (minimal height, max 15%) */}
          <div className="bg-gradient-to-b from-[#ecf2fd] to-transparent rounded-t-2xl mx-0.5 mb-3 p-3 flex-shrink-0 flex items-center">
            <div className="flex gap-2 items-center w-full">
              <img 
                className="w-10 h-10 rounded-full" 
                src="/icons/profile.png" 
                alt="John Smith" 
              />
              <div className="flex flex-col justify-center flex-1">
                <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
                  John Smith
                </p>
                <div className="flex gap-2 items-center rounded-3xl">
                  <img 
                    className="w-[16px] h-[16px]" 
                    src="/icons/diamond.svg" 
                    alt="diamond" 
                  />
                  <p className="font-bold text-sm leading-4 text-[#4e81ee] tracking-[-0.25px]">
                    {gems || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
    </div>
  );
}

export default LeftNav;

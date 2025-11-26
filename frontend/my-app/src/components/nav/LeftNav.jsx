import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PrimaryNav from './PrimaryNav';
import StudyPanelNav from '../study/StudyPanelNav';
import useSessionStore from '../../state/sessionStore';
import useAuthStore from '../../state/authStore';

function LeftNav() {
  const navigate = useNavigate();
  const { phase, gems } = useSessionStore();
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  
  const showStudyPanel = ['learning', 'quizzing', 'feedback', 'completed'].includes(phase);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleProfileClick = () => {
    navigate('/profile');
    setShowDropdown(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/signin', { replace: true });
    setShowDropdown(false);
  };

  const userName = user?.name || 'User';
  const userAvatar = user?.avatarUrl || '/icons/profile.png';

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
        {/* Navigation Menu - Reduced height */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '200px' }}>
          <div className="flex flex-col gap-1 px-0 py-2">
            <PrimaryNav />
          </div>
        </div>

        {/* Study Panel - Takes remaining space */}
        {showStudyPanel && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="px-2 py-2 h-full">
              <StudyPanelNav />
            </div>
          </div>
        )}
      </div>

          {/* Profile Section - Footer (minimal height, max 15%) */}
          <div className="relative bg-gradient-to-b from-[#ecf2fd] to-transparent rounded-t-2xl mx-0.5 mb-3 p-3 flex-shrink-0" ref={dropdownRef}>
            <div 
              className="flex gap-2 items-center w-full cursor-pointer"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <img 
                className="w-10 h-10 rounded-full" 
                src={userAvatar}
                alt={userName}
              />
              <div className="flex flex-col justify-center flex-1">
                <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
                  {userName}
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
            
            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button
                  onClick={handleProfileClick}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  View Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 rounded-b-lg"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
    </div>
  );
}

export default LeftNav;

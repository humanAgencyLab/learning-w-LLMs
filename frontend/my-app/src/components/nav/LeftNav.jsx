import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PrimaryNav from './PrimaryNav';
import StudyPanelNav from '../study/StudyPanelNav';
import RecentChats from './RecentChats';
import useSessionStore from '../../state/sessionStore';
import useAuthStore from '../../state/authStore';

function LeftNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { phase, plan, reset } = useSessionStore();
  const { user, logout, fetchUser } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  
  // Fetch user data on mount and when phase changes to ensure stats are loaded
  useEffect(() => {
    // Always fetch user to get latest stats (especially gems)
    fetchUser().catch(err => console.error('Failed to fetch user:', err));
  }, [fetchUser, phase]); // Re-fetch when phase changes (e.g., after quiz completion)
  
  // Use global gems from user stats, fallback to 0
  const globalGems = user?.stats?.gemsTotal || 0;
  
  // Only show study panel when:
  // 1. On /chat page
  // 2. In learning phases
  // 3. Plan is generated
  const isChatPage = location.pathname === '/chat';
  const isHistoryPage = location.pathname === '/history';
  const showStudyPanel = isChatPage && 
                         ['learning', 'quizzing', 'feedback', 'completed'].includes(phase) && 
                         plan && plan.length > 0;

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

  const handleLogoClick = async () => {
    // Same action as Start Chat button - reset session and navigate to /chat
    await reset();
    navigate('/chat', { replace: true });
  };

  const userName = user?.name || 'User';
  // Get avatar from user object - use actual avatarUrl if available, otherwise fallback
  // Always use the user's avatarUrl if it exists, even if it's a local import path
  const userAvatar = user?.avatarUrl && user.avatarUrl.trim()
    ? user.avatarUrl 
    : '/icons/profile.png';

  return (
    <div className="bg-white border-r border-[#e6e7e8] h-full w-[252px] flex flex-col flex-shrink-0">
      {/* Brand - Header Section (matches topbar height, max 10%) */}
      <div 
        className="flex items-center gap-2 pl-3 pr-4 py-3 h-[72px] flex-shrink-0 cursor-pointer hover:bg-gray-50 transition-colors rounded-r-lg"
        onClick={handleLogoClick}
      >
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

        {/* Study Panel or Recent Chats - Takes remaining space */}
        {/* Hide Recent Chats when on history page */}
        {showStudyPanel ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="px-2 py-2 h-full">
              <StudyPanelNav />
            </div>
          </div>
        ) : !isHistoryPage ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full">
              <RecentChats />
            </div>
          </div>
        ) : null}
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
                    {globalGems}
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

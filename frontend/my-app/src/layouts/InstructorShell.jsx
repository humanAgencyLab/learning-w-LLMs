import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../state/authStore';

const NAV_ITEMS = [
  {
    to: '/instructor/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/instructor/courses',
    label: 'Courses',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

function InstructorNav() {
  return (
    <nav className="flex flex-col gap-1 px-3 mt-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/instructor/dashboard'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function InstructorShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/signin', { replace: true });
  };

  const userName = user?.name || 'Instructor';

  return (
    <div className="flex h-screen w-full bg-gray-50">
      {/* Sidebar */}
      <aside className="w-[240px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 h-[64px] border-b border-gray-100 flex-shrink-0">
          <img alt="Study Assist" className="w-6 h-6" src="/icons/logo.svg" />
          <span className="font-bold text-base text-gray-900 tracking-tight">Teach</span>
        </div>

        {/* Nav */}
        <div className="flex-1 py-3">
          <InstructorNav />
        </div>

        {/* Switch to student view */}
        <div className="px-3 pb-2">
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Student view
          </button>
        </div>

        {/* Profile footer */}
        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-400">Instructor</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../state/authStore';
import InstructorChatPanel from '../components/instructor/InstructorChatPanel';
import CommandPalette from '../components/instructor/CommandPalette';
import ToastMount from '../components/instructor/Toast';

const NAV_ITEMS = [
  {
    key: 'dashboard',
    to: '/instructor/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.7V21h14V9.7" />
      </svg>
    ),
  },
  {
    key: 'courses',
    to: '/instructor/courses',
    label: 'Courses',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.5C10.5 5 8 4.6 4 4.6V19c4 0 5.6.4 8 2 2.4-1.6 4-2 8-2V4.6c-4 0-5.5.4-8 1.9Z" />
        <path d="M12 6.5V21" />
      </svg>
    ),
  },
  // No top-level /instructor/students route exists yet (students are per-course:
  // /instructor/courses/:courseId/students), so this points at the courses list
  // per the integration plan. `fallback: true` suppresses active styling so the
  // Courses item stays the only one highlighted on /instructor/courses.
  // TODO PR-3: point to a real Students landing
  {
    key: 'students',
    to: '/instructor/courses',
    fallback: true,
    label: 'Students',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  // No top-level /instructor/insights route exists yet (insights are per-course:
  // /instructor/courses/:courseId/insights) — same fallback as Students.
  // TODO PR-3: point to a real Insights landing
  {
    key: 'insights',
    to: '/instructor/courses',
    fallback: true,
    label: 'Insights',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="m7 14 4-4 3 3 5-6" />
      </svg>
    ),
  },
];

function InstructorNav() {
  return (
    <nav className="flex flex-col gap-1 px-3 mt-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.to === '/instructor/dashboard'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive && !item.fallback
                ? 'bg-surface-chip text-ink-900 font-semibold'
                : 'text-ink-500 font-medium hover:bg-surface-chip'
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
      <aside className="w-[240px] bg-white border-r border-hairline flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-1 flex-shrink-0">
          <img alt="Study Assist" className="w-6 h-6" src="/icons/logo.svg" />
          <div className="leading-tight">
            <div className="font-bold text-base text-ink-900 tracking-tight">Study Assist</div>
            <div className="font-mono text-[9px] tracking-[.14em] uppercase text-ink-300 mt-0.5">Teach · Instructor</div>
          </div>
        </div>

        {/* ⌘K search — PR-9 listens for this event; no visible action yet, by design. */}
        <div className="px-3 mt-4 mb-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
            className="flex items-center gap-2 w-full px-3 py-2 bg-surface-subtle border border-hairline rounded-lg text-ink-400 hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <span className="flex-1 text-left text-xs">Search students</span>
            <span className="font-mono text-[10px] border border-hairline-strong rounded px-1 py-px text-ink-200">⌘K</span>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 py-1">
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
        <div className="border-t border-hairline-soft px-4 py-3 flex items-center gap-3">
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

      {/* Floating insights chatbot — scope from route params */}
      <InstructorChatPanel />

      {/* ⌘K cross-course student search (PR-9) */}
      <CommandPalette />

      {/* Global toast (PR-10) */}
      <ToastMount />
    </div>
  );
}

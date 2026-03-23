import React from 'react';
import { NavLink } from 'react-router-dom';
import useAuthStore from '../../state/authStore';

function PrimaryNav() {
  const user = useAuthStore((s) => s.user);
  const isInstructor = user?.role === 'instructor';

  return (
    <div className="flex flex-col gap-1">
      <NavLink 
        to="/history" 
        className="flex gap-3 h-8 items-center px-3 py-1 hover:bg-gray-50"
      >
            <img 
              src="/icons/history.svg" 
              alt="transaction history" 
              className="w-5 h-5" 
            />
        <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
          Chat History
        </p>
      </NavLink>
      
      <NavLink 
        to="/performance" 
        className="flex gap-3 h-8 items-center px-3 py-1 rounded-lg hover:bg-gray-50"
      >
            <img 
              src="/icons/performance.svg" 
              alt="laptop performance" 
              className="w-5 h-5" 
            />
        <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
          Performance
        </p>
      </NavLink>
      
      <NavLink 
        to="/favorites" 
        className="flex gap-3 h-8 items-center px-3 py-1 rounded-lg hover:bg-gray-50"
      >
            <img 
              src="/icons/favorites.svg" 
              alt="all bookmark" 
              className="w-5 h-5" 
            />
        <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
          Favourites
        </p>
      </NavLink>

      <NavLink
        to="/courses"
        className="flex gap-3 h-8 items-center px-3 py-1 rounded-lg hover:bg-gray-50"
      >
        <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
          My courses
        </p>
      </NavLink>

      {isInstructor && (
        <NavLink
          to="/instructor/dashboard"
          className="flex gap-3 h-8 items-center px-3 py-1 rounded-lg hover:bg-gray-50"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-normal text-sm leading-4 text-[#030712] tracking-[-0.25px]">
            Teach
          </p>
        </NavLink>
      )}
    </div>
  );
}

export default PrimaryNav;

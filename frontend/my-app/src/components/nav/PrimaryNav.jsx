import React from 'react';
import { NavLink } from 'react-router-dom';

function PrimaryNav() {
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
    </div>
  );
}

export default PrimaryNav;

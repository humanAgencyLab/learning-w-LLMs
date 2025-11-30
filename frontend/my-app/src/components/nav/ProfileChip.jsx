import React from 'react';
import useAuthStore from '../../state/authStore';

function ProfileChip({ name, gems }) {
  const { user } = useAuthStore();
  // Always use the user's avatarUrl if it exists, otherwise fallback to placeholder
  // Don't filter out any avatarUrl - use whatever is stored
  const userAvatar = user?.avatarUrl && user.avatarUrl.trim()
    ? user.avatarUrl 
    : '/icons/profile.png';
  // Use global gems from user stats
  const displayGems = user?.stats?.gemsTotal || gems || 0;
  
  return (
    <div className="flex items-center gap-3 truncate rounded-lg border border-border p-3">
      <img 
        className="h-8 w-8 rounded-full" 
        src={userAvatar} 
        alt={name || user?.name || 'User'}
        onError={(e) => {
          // Fallback to placeholder if image fails to load
          e.target.src = '/icons/profile.png';
        }}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name || user?.name || 'User'}</div>
        <div className="truncate text-xs text-text-soft">💎 {displayGems}</div>
      </div>
    </div>
  );
}

export default ProfileChip;

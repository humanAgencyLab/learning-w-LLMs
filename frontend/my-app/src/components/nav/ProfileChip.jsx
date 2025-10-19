import React from 'react';

function ProfileChip({ name, gems }) {
  return (
    <div className="flex items-center gap-3 truncate rounded-lg border border-border p-3">
      <img className="h-8 w-8 rounded-full" src="/icons/profile.png" alt={name} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-text-soft">💎 {gems}</div>
      </div>
    </div>
  );
}

export default ProfileChip;

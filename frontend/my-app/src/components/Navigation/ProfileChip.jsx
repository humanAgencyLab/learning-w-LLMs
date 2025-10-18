import React from 'react';
import { HARDCODED_PROFILE } from '../../data/userProfile';
import './ProfileChip.css';

function ProfileChip() {
  const { name, gems } = HARDCODED_PROFILE;

  return (
    <div className="profile-chip">
      <div className="profile-content">
        <div className="profile-avatar">
          <img src="/image.png" alt={name} className="avatar-img" />
        </div>
        <div className="profile-info">
          <p className="profile-name">{name}</p>
          <div className="profile-gems">
            <span className="gem-icon">💎</span>
            <span className="gem-count">{gems}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileChip;
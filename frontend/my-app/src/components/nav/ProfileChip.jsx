import React from 'react';
import './ProfileChip.css';

function ProfileChip({ name, gems }) {
  return (
    <div className="profile-chip">
        <div className="profile-avatar">
          <img src="http://localhost:3845/assets/b67ca395c616301e6bc108685999d7acc3382993.png" alt={name} className="avatar-img" />
        </div>
        <div className="profile-info">
          <div className="profile-name">{name}</div>
          <div className="profile-gems">
            <img src="http://localhost:3845/assets/9b3a0383b659d8cb4955b9d49e6353cac1aab30c.svg" alt="diamond" className="gem-icon" />
            <span className="gem-count">{gems}</span>
          </div>
        </div>
    </div>
  );
}

export default ProfileChip;

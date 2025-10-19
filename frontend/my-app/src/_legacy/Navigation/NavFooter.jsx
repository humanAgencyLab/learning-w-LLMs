import React from 'react';
import { Avatar } from '../ui';
import { getUserDisplayName } from '../../data/userProfile';

function NavFooter() {
  const userName = getUserDisplayName();

  return (
    <div className="nav-footer">
      <div className="user-profile">
        <Avatar size="sm" name={userName} />
        <div className="user-info">
          <div className="user-name">{userName}</div>
          <div className="user-status">Online</div>
        </div>
      </div>
      <div className="footer-credit">
        <p>
          Made by <strong>Kean University</strong>
        </p>
      </div>
    </div>
  );
}

export default NavFooter;

import React from 'react';
import { Link } from 'react-router-dom';

function NavMenuItem({ to, label, icon }) {
  return (
    <li className="nav-menu-item">
      <Link to={to} className="nav-menu-link">
        <div className="nav-menu-icon">{icon}</div>
        <span className="nav-menu-label">{label}</span>
      </Link>
    </li>
  );
}

export default NavMenuItem;

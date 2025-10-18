import React from 'react';
import { NavLink } from 'react-router-dom';
import './PrimaryNav.css';

function PrimaryNav() {
  return (
    <nav className="primary-nav">
      <ul className="nav-menu">
        <li className="nav-item">
          <NavLink to="/history" className="nav-link">
            <img src="http://localhost:3845/assets/c9e53785d6d8fe725d9ca5d28b943ebc664131cc.svg" alt="transaction history" className="nav-icon" />
            Chat History
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/settings" className="nav-link">
            <img src="http://localhost:3845/assets/f0f0a175a1b085aaecd21d02b8da1827f8afab0c.svg" alt="settings" className="nav-icon" />
            Settings
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/performance" className="nav-link">
            <img src="http://localhost:3845/assets/795e088a4db5203233713dbfbb2ac6a4c62a2181.svg" alt="laptop performance" className="nav-icon" />
            Performance
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/favorites" className="nav-link">
            <img src="http://localhost:3845/assets/8990d3ce9cd2aa4e7fc6dfad8e55da3edb6fe53d.svg" alt="all bookmark" className="nav-icon" />
            Favourites
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/chatquiz" className="nav-link">
            <img src="http://localhost:3845/assets/f07908a0c179614fea65964cfa641a2cb7ca74bb.svg" alt="idea" className="nav-icon" />
            Quiz
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default PrimaryNav;

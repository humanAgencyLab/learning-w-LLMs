import React from 'react';
import NavMenuItem from './NavMenuItem';

function NavMenu() {
  return (
    <ul className="nav-menu">
      <NavMenuItem to="/history" label="Chat History" icon="📝" />
      <NavMenuItem to="/settings" label="Settings" icon="⚙️" />
      <NavMenuItem to="/performance" label="Performance" icon="📊" />
      <NavMenuItem to="/favorites" label="Favourites" icon="⭐" />
      <NavMenuItem to="/quiz" label="Quiz" icon="🧠" />
    </ul>
  );
}

export default NavMenu;

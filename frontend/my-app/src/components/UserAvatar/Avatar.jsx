import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Avatar.css';

function Avatar() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/profile');
  };

  return (
    <div
      className="avatar-floating"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <img
        src="/image.png"
        alt="User"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

export default Avatar;

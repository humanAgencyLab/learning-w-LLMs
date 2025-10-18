import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/SignUp.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';

function SignUp() {
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/chat');
  };

  return (
    <div className="signup-container">
      <img
        src="/logo.png"
        alt="AI Study Assistant Logo"
        className="signup-logo"
      />

      <h2 className="signup-title">Create an Account</h2>

      <form className="signup-form" onSubmit={handleSubmit}>
        <div className="input-group">
          <EmailIcon className="input-icon" />
          <input type="email" placeholder="Email" required />
        </div>

        <div className="input-group">
          <LockIcon className="input-icon" />
          <input type="password" placeholder="Password" required />
        </div>

        <div className="input-group">
          <LockIcon className="input-icon" />
          <input type="password" placeholder="Confirm Password" required />
        </div>

        <button type="submit" className="signup-button">
          Sign Up
        </button>
      </form>
    </div>
  );
}

export default SignUp;

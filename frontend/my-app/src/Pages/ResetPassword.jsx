import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/ResetPassword.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';

function ResetPassword() {
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/chat');
  };

  return (
    <div className="resetpassword-container">
      <img
        src="/logo.png"
        alt="AI Study Assistant Logo"
        className="resetpassword-logo"
      />

      <h2 className="resetpassword-title">Forgot password?</h2>
      <h3>No worries! We'll send you a secure code through your email</h3>
      <h3>You can use the code to reset your password!</h3>

      <form className="resetpassword-form" onSubmit={handleSubmit}>
        <div className="input-group">
          <EmailIcon className="input-icon" />
          <input type="email" placeholder="Email" required />
        </div>

        <div className="input-group">
          <LockIcon className="input-icon" />
          <input type="password" placeholder="New Password" required />
        </div>

        <div className="input-group">
          <LockIcon className="input-icon" />
          <input type="password" placeholder="Confirm Password" required />
        </div>

        <button type="submit" className="resetpassword-button">
          Reset password
        </button>
      </form>

      <p className="resetpassword-prompt">
        Want to go back? <Link to="/signin">Sign in</Link>
      </p>
    </div>
  );
}

export default ResetPassword;

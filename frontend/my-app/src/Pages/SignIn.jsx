'use client';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import '../styles/SignIn.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';
import useAuthStore from '../state/authStore';
import Loader from '../components/Loader';

function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  // Always redirect to /chat after signin (never to onboarding)
  const from = location.state?.from?.pathname || '/chat';
  
  // Ensure we never redirect to onboarding from signin
  const redirectPath = from === '/onboarding' ? '/chat' : from;

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectPath]);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!email || !password) {
      setLocalError('Please enter both email and password');
      return;
    }

    try {
      await login({ email, password });
      // Always redirect to /chat after successful signin (never to onboarding)
      navigate('/chat', { replace: true });
    } catch (err) {
      setLocalError(err.message || 'Login failed. Please try again.');
    }
  };

  const displayError = localError || error;

  return (
    <div className="signin-overlay">
      {isLoading && <Loader overlay message="Signing in..." />}
      <div className="signin-modal">
        {/* Logo and Title */}
        <div className="signin-header">
          <img
            src="/icons/logo.svg"
            alt="AI Study Assistant Logo"
            className="signin-logo"
          />
          <p className="signin-brand">AI Study Assistant</p>
        </div>

        <div className="signin-content">
          <h2 className="signin-title">Sign In</h2>

          {displayError && (
            <div className="error-message">
              {displayError}
            </div>
          )}

          <form className="signin-form" onSubmit={handleSubmit}>
            {/* Email */}
            <div className="input-field">
              <label className="input-label">Mail</label>
              <div className="input-group input-group-with-icon">
                <EmailIcon className="input-icon" />
                <input 
                  type="email" 
                  placeholder="yourname@mail.com" 
                  value={email}
                  maxLength={255}
                  onChange={(e) => {
                    if (e.target.value.length <= 255) {
                      setEmail(e.target.value);
                    }
                  }}
                  required 
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="input-field">
              <label className="input-label">Password</label>
              <div className="input-group input-group-with-icon">
                <LockIcon className="input-icon" />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  maxLength={128}
                  onChange={(e) => {
                    if (e.target.value.length <= 128) {
                      setPassword(e.target.value);
                    }
                  }}
                  required 
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="signin-button"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>

          {/* Footer Links */}
          <div className="signin-footer">
            <p className="signin-link-text">
              Forgot your password? <Link to="/resetpassword" className="signin-link">Reset Password</Link>
            </p>
            <p className="signin-link-text">
              Don't have an account? <Link to="/signup" className="signin-link">Sign Up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignIn;

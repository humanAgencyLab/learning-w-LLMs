import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/SignUp.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';
import useAuthStore from '../state/authStore';
import Loader from '../components/Loader';
import * as authApi from '../lib/authApi';

function SignUp() {
  const navigate = useNavigate();
  const { signup, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    // Validation
    if (!firstName || !lastName || !email || !password) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long');
      return;
    }

    // Check for at least 1 letter and 1 number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      setLocalError('Password must contain at least 1 letter and 1 number');
      return;
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }

    setIsCheckingEmail(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      
      // FIRST: Check sessionStorage for pending signup with same email
      // This prevents duplicate signups when user hasn't completed onboarding yet
      const existingPendingSignup = sessionStorage.getItem('pendingSignup');
      if (existingPendingSignup) {
        try {
          const pendingData = JSON.parse(existingPendingSignup);
          if (pendingData.email && pendingData.email.toLowerCase() === normalizedEmail) {
            setLocalError('You already have a signup in progress with this email. Please complete the onboarding process or use a different email.');
            setIsCheckingEmail(false);
            return;
          }
        } catch (parseError) {
          // If we can't parse existing pending signup, clear it and continue
          sessionStorage.removeItem('pendingSignup');
        }
      }
      
      // SECOND: Check database for existing registered users
      const emailCheck = await authApi.checkEmail(normalizedEmail);
      
      if (emailCheck.exists) {
        setLocalError('This email is already registered. Please use a different email or sign in instead.');
        setIsCheckingEmail(false);
        return;
      }

      // Email is available - store signup data temporarily in sessionStorage
      // Use normalized email (lowercase) for consistency
      const signupData = {
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        password: password
      };
      sessionStorage.setItem('pendingSignup', JSON.stringify(signupData));
      
      // Redirect to onboarding - account will be created after onboarding is complete
      navigate('/onboarding', { replace: true });
    } catch (err) {
      // Provide more specific error messages
      let errorMessage = 'Failed to check email. Please try again.';
      const errMsg = err.message || '';
      
      console.error('Error checking email:', err);
      
      if (errMsg.includes('endpoint not found') || errMsg.includes('Route not found')) {
        errorMessage = 'Backend server may not be running. Please ensure the backend is started on port 5001.';
      } else if (errMsg.includes('Network error') || errMsg.includes('Unable to connect')) {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection and ensure the backend server is running.';
      } else if (errMsg.includes('404')) {
        errorMessage = 'Email check endpoint not found. Please ensure the backend server is running and the route is available.';
      } else {
        errorMessage = errMsg || errorMessage;
      }
      setLocalError(errorMessage);
      setIsCheckingEmail(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="signup-overlay">
      <div className="signup-modal">
        {/* Logo and Title */}
        <div className="signup-header">
          <img
            src="/icons/logo.svg"
            alt="AI Study Assistant Logo"
            className="signup-logo"
          />
          <p className="signup-brand">AI Study Assistant</p>
        </div>

        <div className="signup-content">
          <h2 className="signup-title">Sign Up</h2>

          {displayError && (
            <div className="error-message">
              {displayError}
            </div>
          )}

          <form className="signup-form" onSubmit={handleSubmit}>
            {/* First Name and Last Name */}
            <div className="name-row">
              <div className="input-field">
                <label className="input-label">First Name</label>
                <div className="input-group input-group-no-icon">
                  <input 
                    type="text" 
                    placeholder="First Name" 
                    value={firstName}
                    maxLength={50}
                    onChange={(e) => {
                      if (e.target.value.length <= 50) {
                        setFirstName(e.target.value);
                      }
                    }}
                    required 
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="input-field">
                <label className="input-label">Last Name</label>
                <div className="input-group input-group-no-icon">
                  <input 
                    type="text" 
                    placeholder="Last Name" 
                    value={lastName}
                    maxLength={50}
                    onChange={(e) => {
                      if (e.target.value.length <= 50) {
                        setLastName(e.target.value);
                      }
                    }}
                    required 
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

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
                  minLength={8}
                />
              </div>
              <p className="password-requirements">≥8 chars, 1 letter, 1 number</p>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="signup-button"
              disabled={isLoading || isCheckingEmail}
            >
              {isCheckingEmail ? 'Checking...' : 'Continue to Onboarding'}
              {!isCheckingEmail && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="signup-footer">
            <span>I already have an account</span>
            <Link to="/signin" className="login-link">Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignUp;

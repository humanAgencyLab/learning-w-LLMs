import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/SignUp.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import UserIcon from '../components/Icons-Avatars/UserIcon';
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
  const [username, setUsername] = useState('');
  const [autoGenerateUsername, setAutoGenerateUsername] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);

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
      setLocalError('Please fill in all required fields');
      return;
    }

    // Validate username
    if (!username) {
      setLocalError('Please enter a username or click "Generate a Username"');
      return;
    }

    // Validate username format (3-30 characters, alphanumeric + underscores)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username)) {
      setLocalError('Username must be 3-30 characters and contain only letters, numbers, and underscores');
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
    setIsCheckingUsername(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      
      // FIRST: Check database for existing registered users (most important check)
      const emailCheck = await authApi.checkEmail(normalizedEmail);
      
      if (emailCheck.exists) {
        setLocalError('This email is already registered. Please use a different email or sign in instead.');
        setIsCheckingEmail(false);
        setIsCheckingUsername(false);
        return;
      }

      // SECOND: Check username
      const usernameCheck = await authApi.checkUsername(username);
      if (usernameCheck.exists) {
        setLocalError('This username is already taken. Please choose a different username or click "Generate a Username".');
        setIsCheckingEmail(false);
        setIsCheckingUsername(false);
        return;
      }
      
      // SECOND: Check sessionStorage for pending signup with same email
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

      // Email and username are available - store signup data temporarily in sessionStorage
      // Use normalized email (lowercase) for consistency
      const signupData = {
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        password: password,
        username: username,
        autoGenerateUsername: false // User provided username manually
      };
      sessionStorage.setItem('pendingSignup', JSON.stringify(signupData));
      
      setIsCheckingEmail(false);
      setIsCheckingUsername(false);
      
      // Redirect to onboarding - account will be created after onboarding is complete
      navigate('/onboarding', { replace: true });
    } catch (err) {
      // Provide more specific error messages
      let errorMessage = 'Failed to check email. Please try again.';
      const errMsg = err.message || '';
      
      console.error('Error checking email:', err);
      
      if (errMsg.includes('endpoint not found') || errMsg.includes('Route not found') || errMsg.includes('404')) {
        errorMessage = 'Unable to connect to backend server. Please check your connection and try again.';
      } else if (errMsg.includes('Network error') || errMsg.includes('Unable to connect') || errMsg.includes('Failed to fetch')) {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection and try again.';
      } else {
        errorMessage = errMsg || errorMessage;
      }
      setLocalError(errorMessage);
      setIsCheckingEmail(false);
      setIsCheckingUsername(false);
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
                  disabled={isLoading || isCheckingEmail}
                />
              </div>
            </div>

            {/* Username */}
            <div className="input-field">
              <label className="input-label">Username</label>
              <div className="input-group input-group-with-icon">
                <UserIcon className="input-icon" />
                <input 
                  type="text" 
                  placeholder="Enter username (3-30 chars)" 
                  value={username}
                  maxLength={30}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                    if (value.length <= 30) {
                      setUsername(value);
                    }
                  }}
                  required
                  disabled={isLoading || isCheckingUsername}
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  // Generate username client-side based on name
                  setIsGeneratingUsername(true);
                  const fullName = `${firstName} ${lastName}`.trim();
                  let cleanBase = fullName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
                  if (!cleanBase) cleanBase = 'user';
                  
                  // Add timestamp suffix to make it more unique
                  const generatedUsername = `${cleanBase}${Date.now().toString(36).substring(7)}`;
                  
                  // Limit to 30 chars
                  let finalUsername = generatedUsername.substring(0, 30);
                  
                  // Check if available, if not try variations
                  setIsCheckingUsername(true);
                  try {
                    let attempts = 0;
                    while (attempts < 5) {
                      const check = await authApi.checkUsername(finalUsername);
                      if (!check.exists) {
                        break; // Username is available
                      }
                      // If taken, try with different suffix
                      finalUsername = `${cleanBase}${Math.floor(Math.random() * 10000)}`;
                      finalUsername = finalUsername.substring(0, 30);
                      attempts++;
                    }
                    setUsername(finalUsername);
                  } catch (err) {
                    // If check fails, just set the generated username
                    setUsername(finalUsername);
                  } finally {
                    setIsCheckingUsername(false);
                    setIsGeneratingUsername(false);
                  }
                }}
                disabled={isLoading || isCheckingUsername || isGeneratingUsername || !firstName || !lastName}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #4e81ee',
                  background: 'white',
                  color: '#4e81ee',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: (isLoading || isCheckingUsername || isGeneratingUsername || !firstName || !lastName) ? 'not-allowed' : 'pointer',
                  opacity: (isLoading || isCheckingUsername || isGeneratingUsername || !firstName || !lastName) ? 0.5 : 1
                }}
              >
                {isGeneratingUsername || isCheckingUsername ? 'Generating...' : 'Generate a Username'}
              </button>
              <p className="password-requirements">3-30 chars, letters, numbers, underscores only</p>
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
              disabled={isLoading || isCheckingEmail || isCheckingUsername}
            >
              {(isCheckingEmail || isCheckingUsername) ? 'Checking...' : 'Continue to Onboarding'}
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

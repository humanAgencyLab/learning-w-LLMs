import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/SignUp.css';
import UserIcon from '../components/Icons-Avatars/UserIcon';
import LockIcon from '../components/SignIn/LockIcon';
import useAuthStore from '../state/authStore';
import Loader from '../components/Loader';
import * as authApi from '../lib/authApi';

function SignUp() {
  const navigate = useNavigate();
  const { signup, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [autoGenerateUsername, setAutoGenerateUsername] = useState(false);
  const [localError, setLocalError] = useState('');
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
    if (!name || !password) {
      setLocalError('Please fill in all required fields');
      return;
    }

    // Validate name (required for certificate)
    if (name.trim().length === 0) {
      setLocalError('Name is required for certificate generation');
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

    setIsCheckingUsername(true);
    try {
      // Check username
      const usernameCheck = await authApi.checkUsername(username);
      if (usernameCheck.exists) {
        setLocalError('This username is already taken. Please choose a different username or click "Generate a Username".');
        setIsCheckingUsername(false);
        return;
      }
      
      // Check sessionStorage for pending signup with same username
      // This prevents duplicate signups when user hasn't completed onboarding yet
      const existingPendingSignup = sessionStorage.getItem('pendingSignup');
      if (existingPendingSignup) {
        try {
          const pendingData = JSON.parse(existingPendingSignup);
          if (pendingData.username && pendingData.username.toLowerCase() === username.toLowerCase()) {
            setLocalError('You already have a signup in progress with this username. Please complete the onboarding process or use a different username.');
            setIsCheckingUsername(false);
            return;
          }
        } catch (parseError) {
          // If we can't parse existing pending signup, clear it and continue
          sessionStorage.removeItem('pendingSignup');
        }
      }

      // Username is available - store signup data temporarily in sessionStorage
      const signupData = {
        name: name.trim(),
        password: password,
        username: username,
        autoGenerateUsername: false // User provided username manually
      };
      sessionStorage.setItem('pendingSignup', JSON.stringify(signupData));
      
      setIsCheckingUsername(false);
      
      // Redirect to onboarding - account will be created after onboarding is complete
      navigate('/onboarding', { replace: true });
    } catch (err) {
      // Provide more specific error messages
      let errorMessage = 'Failed to check username. Please try again.';
      const errMsg = err.message || '';
      
      console.error('Error checking username:', err);
      
      if (errMsg.includes('endpoint not found') || errMsg.includes('Route not found') || errMsg.includes('404')) {
        errorMessage = 'Unable to connect to backend server. Please check your connection and try again.';
      } else if (errMsg.includes('Network error') || errMsg.includes('Unable to connect') || errMsg.includes('Failed to fetch')) {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection and try again.';
      } else {
        errorMessage = errMsg || errorMessage;
      }
      setLocalError(errorMessage);
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
            {/* Display Name */}
            <div className="input-field">
              <label className="input-label">Display Name</label>
              <div className="input-group input-group-no-icon">
                <input 
                  type="text" 
                  placeholder="Enter your name or a pseudonym" 
                  value={name}
                  maxLength={100}
                  onChange={(e) => {
                    if (e.target.value.length <= 100) {
                      setName(e.target.value);
                    }
                  }}
                  required 
                  disabled={isLoading}
                />
              </div>
              <p className="password-requirements" style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                Pseudonyms are welcome! This name will appear on certificates.
              </p>
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
                  const fullName = name.trim();
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
                disabled={isLoading || isCheckingUsername || isGeneratingUsername || !name}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #4e81ee',
                  background: 'white',
                  color: '#4e81ee',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: (isLoading || isCheckingUsername || isGeneratingUsername || !name) ? 'not-allowed' : 'pointer',
                  opacity: (isLoading || isCheckingUsername || isGeneratingUsername || !name) ? 0.5 : 1
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
              disabled={isLoading || isCheckingUsername}
            >
              {isCheckingUsername ? 'Checking...' : 'Continue to Onboarding'}
              {!isCheckingUsername && (
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

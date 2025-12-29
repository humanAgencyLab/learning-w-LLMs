import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/SignUp.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';
import useAuthStore from '../state/authStore';

function SignUp() {
  const navigate = useNavigate();
  const { signup, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [researchConsent, setResearchConsent] = useState(false);
  const [localError, setLocalError] = useState('');

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

    if (!researchConsent) {
      setLocalError('Please consent to participate in research');
      return;
    }

    try {
      const name = `${firstName} ${lastName}`;
      await signup({ name, email, password });
      // Redirect to onboarding after signup
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setLocalError(err.message || 'Signup failed. Please try again.');
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
                    onChange={(e) => setFirstName(e.target.value)}
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
                    onChange={(e) => setLastName(e.target.value)}
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
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                  minLength={8}
                />
              </div>
              <p className="password-requirements">≥8 chars, 1 letter, 1 number</p>
            </div>

            {/* Research Consent */}
            <div className="consent-checkbox">
              <input
                type="checkbox"
                id="researchConsent"
                checked={researchConsent}
                onChange={(e) => setResearchConsent(e.target.checked)}
                disabled={isLoading}
              />
              <label htmlFor="researchConsent">Research Consent</label>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="signup-button"
              disabled={isLoading || !researchConsent}
            >
              {isLoading ? 'Creating Account...' : 'Create account'}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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

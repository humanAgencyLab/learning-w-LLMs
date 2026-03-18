import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import '../styles/ResetPassword.css';
import UserIcon from '../components/Icons-Avatars/UserIcon';
import LockIcon from '../components/SignIn/LockIcon';
import * as authApi from '../lib/authApi';

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetLink, setResetLink] = useState('');

  // If token exists, we're in reset mode; otherwise, forgot password mode
  const isResetMode = !!token;

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    if (!username) {
      setError('Please enter your username');
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.forgotPassword(username);
      const d = response?.data ?? response?.result ?? response;
      const token =
        (d && d.resetToken) ||
        (typeof response?.resetToken === 'string' ? response.resetToken : null);
      const linkFromApi =
        (d && d.resetLink) ||
        (typeof response?.resetLink === 'string' ? response.resetLink : null);
      if (token) {
        const origin = window.location.origin;
        const link =
          linkFromApi ||
          `${origin}/resetpassword?token=${encodeURIComponent(token)}`;
        setResetToken(token);
        setResetLink(link);
        setSuccess(true);
        setError('');
      } else {
        setSuccess(true);
        setError('');
        setResetToken('');
        setResetLink('');
      }
    } catch (err) {
      setError(err.message || 'Failed to request password reset. Please try again.');
      setResetToken('');
      setResetLink('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    // Validation
    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    // Check for at least 1 letter and 1 number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      setError('Password must contain at least 1 letter and 1 number');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      await authApi.resetPassword({ token, password });
      setSuccess(true);
      setError('');
      // Redirect to sign in after 2 seconds
      setTimeout(() => {
        navigate('/signin', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="resetpassword-overlay">
      <div className="resetpassword-modal">
        {/* Logo and Title */}
        <div className="resetpassword-header">
          <img
            src="/icons/logo.svg"
            alt="AI Study Assistant Logo"
            className="resetpassword-logo"
          />
          <p className="resetpassword-brand">AI Study Assistant</p>
        </div>

        <div className="resetpassword-content">
          <h2 className="resetpassword-title">
            {isResetMode ? 'Reset Password' : 'Forgot password?'}
          </h2>

          {isResetMode ? (
            <>
              <p className="resetpassword-description">
                Enter your new password below
              </p>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {success && (
                <div className="success-message">
                  Password reset successfully! Redirecting to sign in...
                </div>
              )}

              <form className="resetpassword-form" onSubmit={handleResetPassword}>
                {/* Password */}
                <div className="input-field">
                  <label className="input-label">New Password</label>
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

                {/* Confirm Password */}
                <div className="input-field">
                  <label className="input-label">Confirm Password</label>
                  <div className="input-group input-group-with-icon">
                    <LockIcon className="input-icon" />
                    <input
                      type="password"
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      maxLength={128}
                      onChange={(e) => {
                        if (e.target.value.length <= 128) {
                          setConfirmPassword(e.target.value);
                        }
                      }}
                      required
                      disabled={isLoading}
                      minLength={8}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="resetpassword-button"
                  disabled={isLoading || success}
                >
                  {isLoading ? 'Resetting...' : 'Reset password'}
                  {!isLoading && !success && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="resetpassword-description">
                Enter your username to receive a password reset link
              </p>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {success && resetToken && (
                <div className="reset-token-section">
                  <div className="success-message">
                    Password reset token generated!
                  </div>
                  <div className="token-display">
                    <label className="token-label">Reset Link:</label>
                    <div className="token-input-group">
                      <input
                        type="text"
                        readOnly
                        value={resetLink}
                        className="token-input"
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetLink);
                          alert('Link copied to clipboard!');
                        }}
                        className="copy-button"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="token-instruction">
                      Click the link above or copy it to reset your password
                    </p>
                  </div>
                </div>
              )}

              {success && !resetToken && (
                <div className="success-message">
                  No account found with that username. Check the spelling and try again — when it&apos;s correct, the reset link will appear above.
                </div>
              )}

              <form className="resetpassword-form" onSubmit={handleForgotPassword}>
                {/* Username */}
                <div className="input-field">
                  <label className="input-label">Username</label>
                  <div className="input-group input-group-with-icon">
                    <UserIcon className="input-icon" />
                    <input
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      maxLength={30}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                        if (value.length <= 30) {
                          setUsername(value);
                        }
                      }}
                      required
                      disabled={isLoading || success}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="resetpassword-button"
                  disabled={isLoading || success}
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                  {!isLoading && !success && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Footer Links */}
          <div className="resetpassword-footer">
            <p className="resetpassword-link-text">
              Want to go back? <Link to="/signin" className="resetpassword-link">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;

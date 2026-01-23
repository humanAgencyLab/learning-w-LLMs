import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../state/authStore';
import * as profileApi from '../lib/profileApi';
import * as authApi from '../lib/authApi';
import { getRandomAvatar } from '../utils/avatars';
import '../styles/Onboarding.css';

function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile, signup, isAuthenticated } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Major, Topic, Self-Rating
    major: 'Computer Science',
    recentTopics: [], // Limited to 1 topic
    selfRating: 'Intermediate',
    
    // Step 2: Goal & Schedule
    primaryGoal: 'Master Basics',
    daysPerWeek: 3,
    minutesPerSession: 40,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Track if we're in the middle of submission
  const [topicInput, setTopicInput] = useState('');

  // If user is authenticated, they've already completed onboarding (users only exist after onboarding)
  // Redirect them to chat instead of showing onboarding page
  // But only if we're not in the middle of onboarding flow (no pendingSignup)
  useEffect(() => {
    // Don't redirect if we're currently submitting (handled by handleSubmit)
    if (isSubmitting || isLoading) return;
    
    const pendingSignup = sessionStorage.getItem('pendingSignup');
    // Only redirect if authenticated AND no pending signup AND not currently loading/submitting
    // AND we're not on step 2 (which means we're in the middle of onboarding)
    if (isAuthenticated && !pendingSignup && currentStep !== 2) {
      navigate('/chat', { replace: true });
    }
  }, [isAuthenticated, navigate, isLoading, isSubmitting, currentStep]);

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (currentStep > 1 && !isLoading && !isSubmitting) {
      setCurrentStep(currentStep - 1);
    }
  };


  const handleSubmit = async () => {
    setIsSubmitting(true); // Mark that we're submitting
    setIsLoading(true);
    setError('');
    
    try {
      // Check if there's pending signup data (user hasn't created account yet)
      const pendingSignupStr = sessionStorage.getItem('pendingSignup');
      let shouldCreateAccount = false;
      let signupData = null;
      
      if (pendingSignupStr) {
        try {
          signupData = JSON.parse(pendingSignupStr);
          // Validate that signupData has required fields
          if (signupData && signupData.password && signupData.name && signupData.username) {
            shouldCreateAccount = true;
          } else {
            // Invalid pending signup data - clear it
            sessionStorage.removeItem('pendingSignup');
            throw new Error('Invalid signup data. Please start the signup process again.');
          }
        } catch (parseError) {
          // If we can't parse or validate, clear it and show error
          sessionStorage.removeItem('pendingSignup');
          throw new Error('Invalid signup data. Please start the signup process again.');
        }
      }
      
      // If user needs to create account, do it first
      if (shouldCreateAccount && signupData) {
        try {
          // Double-check username doesn't exist in DB (race condition protection)
          // This is a backup check in case someone else registered with this username
          // between the signup page check and onboarding completion
          const usernameCheck = await authApi.checkUsername(signupData.username);
          if (usernameCheck.exists) {
            setError('This username was registered while you were completing onboarding. Please sign in instead.');
            setIsLoading(false);
            setIsSubmitting(false);
            // Ensure we stay on step 4 to show the error
            setCurrentStep(4);
            // DON'T clear pendingSignup here - let user see the error
            // Only clear it if they navigate away or successfully complete onboarding
            return;
          }
          
          await signup({
            name: signupData.name,
            password: signupData.password,
            username: signupData.username,
            autoGenerateUsername: signupData.autoGenerateUsername || false
          });
          // Clear pending signup data immediately after signup succeeds
          sessionStorage.removeItem('pendingSignup');
        } catch (signupError) {
          // Handle duplicate username errors specifically
          if (signupError.code === 'USERNAME_EXISTS' || signupError.message.toLowerCase().includes('username already taken')) {
            setError('This username is already taken. Please choose a different username or enable auto-generate in signup.');
            setIsLoading(false);
            setIsSubmitting(false);
            setCurrentStep(4);
            return;
          }
          // Re-throw other errors to be caught by outer catch
          throw signupError;
        }
      }
      
      // Assign a random avatar if user doesn't have one
      const randomAvatar = getRandomAvatar();
      
      // Update profile with all onboarding data via auth store (which calls API)
      // Backend expects flat structure, not wrapped in profile object
      await updateProfile({
        avatarUrl: randomAvatar, // Assign random avatar during onboarding
        major: formData.major || 'Other',
        daysPerWeek: formData.daysPerWeek,
        minutesPerSession: formData.minutesPerSession,
        recentTopics: formData.recentTopics,
        selfRating: formData.selfRating,
        primaryGoal: formData.primaryGoal,
        background: 'Student learning with AI assistance',
        goals: ['Improve knowledge'],
        strengths: ['Quick learner'],
        gaps: ['No specific gaps'],
        onboardingCompleted: true, // Mark onboarding as completed
      });
      
      // Clear any pending signup data first
      sessionStorage.removeItem('pendingSignup');
      
      // Clear loading state
      setIsLoading(false);
      setIsSubmitting(false); // Reset submitting flag on success
      
      // Navigate immediately - don't wait, and use replace to prevent back navigation
      // Use window.location as a fallback if navigate doesn't work
      try {
        navigate('/chat', { replace: true });
      } catch (navError) {
        console.error('Navigation error, using window.location:', navError);
        window.location.href = '/chat';
      }
    } catch (err) {
      console.error('Onboarding submission error:', err);
      setError(err.message || 'Failed to save profile');
      setIsLoading(false);
      setIsSubmitting(false); // Reset submitting flag on error
      // Ensure we stay on step 2 to show the error (don't reset to step 1)
      setCurrentStep(2);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTopic = () => {
    // Limit to 1 topic only
    if (topicInput.trim() && formData.recentTopics.length === 0) {
      setFormData(prev => ({
        ...prev,
        recentTopics: [topicInput.trim()]
      }));
      setTopicInput('');
    }
  };

  const removeTopic = (topic) => {
    setFormData(prev => ({
      ...prev,
      recentTopics: prev.recentTopics.filter(t => t !== topic)
    }));
  };

  const progressPercentage = (currentStep / 2) * 100;
  const progressWidth = progressPercentage; // Use percentage instead of fixed pixels

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        {/* Header */}
        <div className="onboarding-header">
          <img src="/icons/logo.svg" alt="AI Study Assistant" className="onboarding-logo" />
          <p className="onboarding-brand">AI Study Assistant</p>
        </div>

        {/* Progress Bar */}
        <div className="progress-section">
          <p className="progress-text">Steps {currentStep}/2</p>
          <div className="progress-bar-container">
            <div className="progress-bar-background">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <span className="progress-percentage">{Math.round(progressPercentage)}%</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Step 1: Major, Topic, Self-Rating */}
        {currentStep === 1 && (
          <div className="onboarding-step">
            <h2 className="step-title">Academic Background</h2>
            <div className="step-content">
              <div className="input-field">
                <label className="input-label">Major</label>
                <div className="select-group">
                  <select
                    value={formData.major}
                    onChange={(e) => handleInputChange('major', e.target.value)}
                    className="select-input"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Data Science">Data Science</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Other">Other</option>
                  </select>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">Topic of Interest</label>
                <div className="topics-container">
                  {formData.recentTopics.map((topic, index) => (
                    <div key={index} className="topic-chip">
                      <span>{topic}</span>
                      <button
                        type="button"
                        onClick={() => removeTopic(topic)}
                        className="topic-remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {formData.recentTopics.length === 0 && (
                    <div className="topic-input-group">
                      <input
                        type="text"
                        placeholder="Enter a topic you'd like to study"
                        value={topicInput}
                        maxLength={50}
                        onChange={(e) => {
                          if (e.target.value.length <= 50) {
                            setTopicInput(e.target.value);
                          }
                        }}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTopic();
                          }
                        }}
                        className="topic-input"
                      />
                      <button
                        type="button"
                        onClick={addTopic}
                        className="topic-add"
                        disabled={!topicInput.trim()}
                      >
                        +
                      </button>
                    </div>
                  )}
                  {formData.recentTopics.length > 0 && (
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>You can add 1 topic only</p>
                  )}
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">
                  Self-rating <span className="label-note">(for the topic you'll likely study)</span>
                </label>
                <div className="select-group">
                  <select
                    value={formData.selfRating}
                    onChange={(e) => handleInputChange('selfRating', e.target.value)}
                    className="select-input"
                  >
                    <option value="None">None</option>
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Goal & Schedule */}
        {currentStep === 2 && (
          <div className="onboarding-step">
            <h2 className="step-title">Learning Goals & Schedule</h2>
            <div className="step-content">
              <div className="input-field">
                <label className="input-label">Primary Goal</label>
                <div className="select-group">
                  <select
                    value={formData.primaryGoal}
                    onChange={(e) => handleInputChange('primaryGoal', e.target.value)}
                    className="select-input"
                  >
                    <option value="Master Basics">Master Basics</option>
                    <option value="Exam Prep">Exam Prep</option>
                    <option value="Revise Gaps">Revise Gaps</option>
                    <option value="Project Help">Project Help</option>
                    <option value="Interview Prep">Interview Prep</option>
                  </select>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">Weekly Goal</label>
                <div className="goal-row">
                  <div className="goal-field">
                    <label className="goal-label">Days per week</label>
                    <div className="select-group">
                      <select
                        value={formData.daysPerWeek}
                        onChange={(e) => handleInputChange('daysPerWeek', parseInt(e.target.value))}
                        className="select-input"
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map(num => (
                          <option key={num} value={num}>{String(num).padStart(2, '0')}</option>
                        ))}
                      </select>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                        <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className="goal-field">
                    <label className="goal-label">Minutes per session</label>
                    <div className="select-group">
                      <select
                        value={formData.minutesPerSession}
                        onChange={(e) => handleInputChange('minutesPerSession', parseInt(e.target.value))}
                        className="select-input"
                      >
                        {[10, 20, 30, 40, 50, 60, 90, 120].map(num => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                      </select>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                        <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Navigation Buttons */}
        <div className="onboarding-actions">
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBack(e);
                }}
                className="back-button"
                disabled={isLoading || isSubmitting}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: '1px solid #e6e7e8',
                  background: 'white',
                  color: '#030712',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ transform: 'rotate(180deg)' }}>
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="#030712" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {currentStep < 2 ? (
              <button
                type="button"
                onClick={handleNext}
                className="next-button"
                disabled={isLoading}
              >
                Next
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '12px' }}>
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Prevent multiple clicks
                  if (isLoading || isSubmitting) {
                    return;
                  }
                  
                  try {
                    await handleSubmit();
                  } catch (error) {
                    // Error is already handled in handleSubmit
                    console.error('Finish button error:', error);
                  }
                }}
                className="next-button"
                disabled={isLoading || isSubmitting}
              >
                {isLoading || isSubmitting ? 'Saving...' : 'Finish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;

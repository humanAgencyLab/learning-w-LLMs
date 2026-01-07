import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../state/authStore';
import * as profileApi from '../lib/profileApi';
import { getRandomAvatar } from '../utils/avatars';
import '../styles/Onboarding.css';

function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile, signup, isAuthenticated } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Profile Basics
    skillLevel: 'Beginner',
    learningType: 'Visual',
    major: 'Computer Science',
    
    // Step 2: Course & Goal
    currentCourses: [],
    daysPerWeek: 3,
    minutesPerSession: 40,
    
    // Step 3: Background & Intent
    recentTopics: [],
    selfRating: 'Intermediate',
    primaryGoal: 'Master Basics',
    
    // Step 4: Preferences
    defaultMode: 'Studying',
    explanationLength: 'Balanced',
    examplesPreference: 'Many',
    codeLanguagePreference: 'Python',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseInput, setCourseInput] = useState('');

  // Note: Onboarding check simplified - no redirect logic
  // Users are only saved to DB after onboarding completion

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const addCourse = () => {
    if (courseInput.trim() && formData.currentCourses.length < 5 && !formData.currentCourses.includes(courseInput.trim())) {
      setFormData(prev => ({
        ...prev,
        currentCourses: [...prev.currentCourses, courseInput.trim()]
      }));
      setCourseInput('');
      setShowCourseModal(false);
    }
  };

  const removeCourse = (course) => {
    setFormData(prev => ({
      ...prev,
      currentCourses: prev.currentCourses.filter(c => c !== course)
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Check if there's pending signup data (user hasn't created account yet)
      const pendingSignupStr = sessionStorage.getItem('pendingSignup');
      let shouldCreateAccount = false;
      let signupData = null;
      
      if (pendingSignupStr) {
        signupData = JSON.parse(pendingSignupStr);
        shouldCreateAccount = true;
      }
      
      // If user needs to create account, do it first
      if (shouldCreateAccount && signupData) {
        await signup({
          name: signupData.name,
          email: signupData.email,
          password: signupData.password
        });
        // Clear pending signup data
        sessionStorage.removeItem('pendingSignup');
      }
      
      // Assign a random avatar if user doesn't have one
      const randomAvatar = getRandomAvatar();
      
      // Update profile with all onboarding data via auth store (which calls API)
      // Backend expects flat structure, not wrapped in profile object
      await updateProfile({
        avatarUrl: randomAvatar, // Assign random avatar during onboarding
        skillLevel: formData.skillLevel,
        learningType: formData.learningType,
        major: formData.major || 'Other',
        currentCourses: formData.currentCourses,
        daysPerWeek: formData.daysPerWeek,
        minutesPerSession: formData.minutesPerSession,
        recentTopics: formData.recentTopics,
        selfRating: formData.selfRating,
        primaryGoal: formData.primaryGoal,
        defaultMode: formData.defaultMode,
        explanationLength: formData.explanationLength,
        examplesPreference: formData.examplesPreference,
        codeLanguagePreference: formData.codeLanguagePreference,
        background: 'Student learning with AI assistance',
        goals: ['Improve knowledge'],
        strengths: ['Quick learner'],
        gaps: ['No specific gaps'],
        onboardingCompleted: true, // Mark onboarding as completed
      });
      
      // Redirect to chat (onboardingCompleted is already set in profile update above)
      navigate('/chat', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to save profile');
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTopic = () => {
    if (topicInput.trim() && !formData.recentTopics.includes(topicInput.trim())) {
      setFormData(prev => ({
        ...prev,
        recentTopics: [...prev.recentTopics, topicInput.trim()]
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

  const progressPercentage = (currentStep / 4) * 100;
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
          <p className="progress-text">Steps {currentStep}/4</p>
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

        {/* Step 1: Profile Basics */}
        {currentStep === 1 && (
          <div className="onboarding-step">
            <h2 className="step-title">Profile Basics</h2>
            <div className="step-content">
              <div className="form-group">
                <div className="input-field">
                  <label className="input-label">Skill Level</label>
                  <div className="select-group">
                    <select
                      value={formData.skillLevel}
                      onChange={(e) => handleInputChange('skillLevel', e.target.value)}
                      className="select-input"
                    >
                      <option value="Beginner">✨ Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                <div className="input-field">
                  <label className="input-label">Learning Type</label>
                  <div className="select-group">
                    <select
                      value={formData.learningType}
                      onChange={(e) => handleInputChange('learningType', e.target.value)}
                      className="select-input"
                    >
                      <option value="Visual">Visual</option>
                      <option value="Auditory">Auditory</option>
                      <option value="Reading/Writing">Reading/Writing</option>
                      <option value="Kinesthetic">Kinesthetic</option>
                    </select>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

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
            </div>
          </div>
        )}

        {/* Step 2: Course & Goal */}
        {currentStep === 2 && (
          <div className="onboarding-step">
            <h2 className="step-title">Course & Goal</h2>
            <div className="step-content">
              <div className="input-field">
                <label className="input-label">Current Courses</label>
                <div className="topics-container">
                  {formData.currentCourses.map((course, index) => (
                    <div key={index} className="topic-chip">
                      <span>{course}</span>
                      <button
                        type="button"
                        onClick={() => removeCourse(course)}
                        className="topic-remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {formData.currentCourses.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setShowCourseModal(true)}
                      className="add-course-button"
                    >
                      + Add course
                    </button>
                  )}
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

        {/* Step 3: Background & Intent */}
        {currentStep === 3 && (
          <div className="onboarding-step">
            <h2 className="step-title">Background & Intent</h2>
            <div className="step-content">
              <div className="input-field">
                <label className="input-label">Recent Topics</label>
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
                  <div className="topic-input-group">
                    <input
                      type="text"
                      placeholder="Topic"
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
                    >
                      +
                    </button>
                  </div>
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
            </div>
          </div>
        )}

        {/* Step 4: Preferences */}
        {currentStep === 4 && (
          <div className="onboarding-step">
            <h2 className="step-title">Preferences</h2>
            <div className="step-content">
              <div className="input-field">
                <label className="input-label">Default Mode</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="defaultMode"
                      value="Studying"
                      checked={formData.defaultMode === 'Studying'}
                      onChange={(e) => handleInputChange('defaultMode', e.target.value)}
                    />
                    <span>Studying</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="defaultMode"
                      value="Revision"
                      checked={formData.defaultMode === 'Revision'}
                      onChange={(e) => handleInputChange('defaultMode', e.target.value)}
                    />
                    <span>Revision</span>
                  </label>
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">Explanation Length</label>
                <div className="select-group">
                  <select
                    value={formData.explanationLength}
                    onChange={(e) => handleInputChange('explanationLength', e.target.value)}
                    className="select-input"
                  >
                    <option value="Concise">Concise</option>
                    <option value="Balanced">Balanced</option>
                    <option value="Detailed">Detailed</option>
                  </select>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">Examples Preference</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="examplesPreference"
                      value="Few"
                      checked={formData.examplesPreference === 'Few'}
                      onChange={(e) => handleInputChange('examplesPreference', e.target.value)}
                    />
                    <span>Few</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="examplesPreference"
                      value="Many"
                      checked={formData.examplesPreference === 'Many'}
                      onChange={(e) => handleInputChange('examplesPreference', e.target.value)}
                    />
                    <span>Many</span>
                  </label>
                </div>
              </div>

              <div className="input-field">
                <label className="input-label">Code Language Preference</label>
                <div className="select-group">
                  <select
                    value={formData.codeLanguagePreference}
                    onChange={(e) => handleInputChange('codeLanguagePreference', e.target.value)}
                    className="select-input"
                  >
                    <option value="Python">Python</option>
                    <option value="JavaScript">JavaScript</option>
                    <option value="C++">C++</option>
                    <option value="None">None</option>
                  </select>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Course Modal */}
        {showCourseModal && (
          <div className="course-modal-overlay" onClick={() => setShowCourseModal(false)}>
            <div className="course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="course-modal-title">Add Course</h3>
              <div className="course-modal-content">
                <input
                  type="text"
                  placeholder="Enter course name"
                  value={courseInput}
                  maxLength={50}
                  onChange={(e) => {
                    if (e.target.value.length <= 50) {
                      setCourseInput(e.target.value);
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCourse();
                    }
                  }}
                  className="course-modal-input"
                  autoFocus
                />
                {formData.currentCourses.length >= 5 && (
                  <p className="course-limit-message">Maximum 5 courses allowed</p>
                )}
              </div>
              <div className="course-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowCourseModal(false);
                    setCourseInput('');
                  }}
                  className="course-modal-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addCourse}
                  className="course-modal-add"
                  disabled={!courseInput.trim() || formData.currentCourses.length >= 5 || formData.currentCourses.includes(courseInput.trim())}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="onboarding-actions">
          {currentStep < 4 ? (
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
              onClick={handleSubmit}
              className="next-button"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Finish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;

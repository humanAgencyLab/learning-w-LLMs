import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../state/authStore';
import { getRandomAvatar } from '../../utils/avatars';
import '../../styles/Onboarding.css';

/**
 * Short setup for new instructor accounts (no student-style learning survey).
 */
function InstructorOnboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.role !== 'instructor') {
      navigate('/chat', { replace: true });
    }
    if (user?.role === 'instructor' && user.profile?.onboardingCompleted === true) {
      navigate('/instructor/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleContinue = async () => {
    setError('');
    setLoading(true);
    try {
      await updateProfile({
        avatarUrl: getRandomAvatar(),
        onboardingCompleted: true,
        background: 'Course instructor',
        goals: ['Support student learning'],
        strengths: ['Teaching', 'Subject expertise'],
        gaps: [],
        major: 'Other',
        daysPerWeek: 3,
        minutesPerSession: 30,
        recentTopics: [],
        selfRating: 'Intermediate',
        primaryGoal: 'Master Basics',
      });
      navigate('/instructor/dashboard', { replace: true });
    } catch (e) {
      setError(e.message || 'Could not complete setup. Try again or open Profile later.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <p className="progress-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (user.role !== 'instructor') {
    return null;
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <img src="/icons/logo.svg" alt="Study Assist" className="onboarding-logo" />
          <p className="onboarding-brand">Study Assist</p>
        </div>

        <div className="onboarding-step">
          <h2 className="step-title">Welcome, {user.name || 'instructor'}</h2>
          <p style={{ color: '#4b5563', fontSize: '15px', lineHeight: 1.5, marginBottom: '20px' }}>
            Your instructor account is ready. You can create courses, upload materials, and publish topics for
            students. Student-style learning preferences are skipped—you can change profile details anytime in
            Settings.
          </p>
          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="onboarding-actions">
          <button
            type="button"
            className="next-button"
            onClick={handleContinue}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Saving…' : 'Go to instructor dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstructorOnboarding;

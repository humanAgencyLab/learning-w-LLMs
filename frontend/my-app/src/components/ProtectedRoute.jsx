import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../state/authStore';

/**
 * Protected Route Component
 * Redirects to signin if user is not authenticated
 * Redirects to onboarding if user hasn't completed onboarding
 */
function ProtectedRoute({ children, requireOnboarding = true }) {
  const { isAuthenticated, isLoading, initialize, user } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // Initialize auth state on mount
    if (!isAuthenticated && !isLoading) {
      initialize();
    }
  }, [isAuthenticated, isLoading, initialize]);

  if (isLoading) {
    // Show loading state while checking authentication
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  // If onboarding route doesn't require authentication (requireOnboarding=false), allow access
  // This allows users with pending signup to access onboarding
  if (!requireOnboarding) {
    const pendingSignup = sessionStorage.getItem('pendingSignup');
    // Allow access if there's pending signup or if user is authenticated
    if (pendingSignup || isAuthenticated) {
      return children;
    }
    // If no pending signup and not authenticated, redirect to signup
    return <Navigate to="/signup" replace />;
  }

  if (!isAuthenticated) {
    // Check if there's pending signup data (user is in onboarding flow)
    const pendingSignup = sessionStorage.getItem('pendingSignup');
    if (pendingSignup) {
      // User is in onboarding flow, redirect to onboarding
      return <Navigate to="/onboarding" replace />;
    }
    // Redirect to signin with return path
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // If onboarding is required and user hasn't completed it, redirect to onboarding
  if (requireOnboarding && user) {
    const onboardingCompleted = user.profile?.onboardingCompleted;
    const pendingSignup = sessionStorage.getItem('pendingSignup');
    
    // For existing users: if they have profile data (skillLevel, learningType, etc.),
    // they've likely completed onboarding before this flag was added
    // Only redirect NEW users who explicitly have onboardingCompleted === false
    const hasProfileData = user.profile && (
      user.profile.skillLevel || 
      user.profile.learningType || 
      user.profile.major
    );
    
    // Only redirect if:
    // 1. onboardingCompleted is explicitly false (not undefined/null)
    // 2. AND they don't have existing profile data (new user)
    // 3. AND no pending signup
    // 4. AND not already on onboarding page
    if (
      onboardingCompleted === false && 
      !hasProfileData && 
      !pendingSignup && 
      location.pathname !== '/onboarding'
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    
    // If onboardingCompleted is undefined/null but user has profile data, allow access
    // This handles existing users who signed up before onboardingCompleted flag was added
  }

  return children;
}

export default ProtectedRoute;












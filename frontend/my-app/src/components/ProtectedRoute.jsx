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

  // Note: Onboarding check removed - users are only saved to DB after onboarding completion
  // So there's no risk of accessing the app before onboarding is complete

  return children;
}

export default ProtectedRoute;












import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from '../state/authStore';

/**
 * Root route redirect component
 * Redirects to /signin if logged out, /chat if logged in
 */
function RootRedirect() {
  const { isAuthenticated, isLoading, initialize, user } = useAuthStore();

  // Initialize auth state on mount
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      initialize();
    }
  }, [isAuthenticated, isLoading, initialize]);

  // Show nothing while loading (or show a minimal loader if needed)
  if (isLoading) {
    return null; // Or return a loading spinner if preferred
  }

  // Redirect based on auth status
  if (isAuthenticated) {
    if (user?.role === 'instructor') {
      return <Navigate to="/instructor/courses" replace />;
    }
    return <Navigate to="/chat" replace />;
  }

  return <Navigate to="/signin" replace />;
}

export default RootRedirect;


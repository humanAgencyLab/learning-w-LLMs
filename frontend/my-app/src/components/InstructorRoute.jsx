import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../state/authStore';
import ProtectedRoute from './ProtectedRoute';

/**
 * Requires auth + user.role === 'instructor'
 */
function InstructorRoute({ children }) {
  const { user } = useAuthStore();
  const location = useLocation();

  return (
    <ProtectedRoute>
      {user?.role === 'instructor' ? children : (
        <Navigate to="/courses" replace state={{ from: location, error: 'Instructor access only' }} />
      )}
    </ProtectedRoute>
  );
}

export default InstructorRoute;

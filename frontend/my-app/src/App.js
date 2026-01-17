import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import RootRedirect from './components/RootRedirect';
import SignIn from './Pages/SignIn';
import SignUp from './Pages/SignUp';
import ChatInterface from './Pages/ChatInterface';
import ResetPassword from './Pages/ResetPassword';
import Profile from './Pages/Profile';
import Performance from './Pages/Performance';
import ChatHistory from './Pages/ChatHistory';
import Favorites from './Pages/Favorites';
import AppShell from './layouts/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import useAuthStore from './state/authStore';
import Onboarding from './Pages/Onboarding';
import { ToastContainer } from './components/ui/toast';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  // Initialize auth state on app mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Router>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/resetpassword" element={<ResetPassword />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute requireOnboarding={false}>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route element={<AppShell />}>
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatInterface />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <ChatHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/performance"
            element={
              <ProtectedRoute>
                <Performance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/favorites"
            element={
              <ProtectedRoute>
                <Favorites />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            index
            element={
              <ProtectedRoute>
                <Navigate to="/chat" />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

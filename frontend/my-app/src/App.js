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
import InstructorShell from './layouts/InstructorShell';
import ProtectedRoute from './components/ProtectedRoute';
import useAuthStore from './state/authStore';
import Onboarding from './Pages/Onboarding';
import { ToastContainer } from './components/ui/toast';
import InstructorRoute from './components/InstructorRoute';
import InstructorDashboardPage from './Pages/instructor/InstructorDashboardPage';
import InstructorCoursesPage from './Pages/instructor/InstructorCoursesPage';
import InstructorCourseDetailPage from './Pages/instructor/InstructorCourseDetailPage';
import InstructorTopicEditorPage from './Pages/instructor/InstructorTopicEditorPage';
import InstructorStudentsPage from './Pages/instructor/InstructorStudentsPage';
import InstructorOnboarding from './Pages/instructor/InstructorOnboarding';
import StudentCoursesPage from './Pages/student/StudentCoursesPage';
import StudentCourseTopicsPage from './Pages/student/StudentCourseTopicsPage';

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
        <Route
          path="/instructor/onboarding"
          element={
            <ProtectedRoute requireOnboarding={false}>
              <InstructorOnboarding />
            </ProtectedRoute>
          }
        />

        {/* Student app shell */}
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
            path="/courses"
            element={
              <ProtectedRoute>
                <StudentCoursesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId/topics"
            element={
              <ProtectedRoute>
                <StudentCourseTopicsPage />
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

        {/* Instructor dashboard shell */}
        <Route element={<InstructorShell />}>
          <Route
            path="/instructor/dashboard"
            element={
              <InstructorRoute>
                <InstructorDashboardPage />
              </InstructorRoute>
            }
          />
          <Route
            path="/instructor/courses"
            element={
              <InstructorRoute>
                <InstructorCoursesPage />
              </InstructorRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId"
            element={
              <InstructorRoute>
                <InstructorCourseDetailPage />
              </InstructorRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/topics/:topicId"
            element={
              <InstructorRoute>
                <InstructorTopicEditorPage />
              </InstructorRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/students"
            element={
              <InstructorRoute>
                <InstructorStudentsPage />
              </InstructorRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

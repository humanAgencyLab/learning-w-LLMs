import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './Pages/LandingPage';
import SignIn from './Pages/SignIn';
import SignUp from './Pages/SignUp';
import ChatInterface from './Pages/ChatInterface';
import ResetPassword from './Pages/ResetPassword';
import Profile from './Pages/Profile';
import Performance from './Pages/Performance';
import Settings from './Pages/Settings';
import ChatHistory from './Pages/ChatHistory';
import ChatInterfaceQUIZ from './Pages/ChatInterfaceQUIZ';
import Favorites from './Pages/Favorites';
import UIDemo from './Pages/UIDemo';
import StateTest from './Pages/StateTest';
import QuickTest from './Pages/QuickTest';
import SimpleTest from './Pages/SimpleTest';
import SessionFlow from './components/SessionFlow';
import AppShell from './layouts/AppShell';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/resetpassword" element={<ResetPassword />} />
        <Route element={<AppShell />}>
          <Route path="/chat" element={<ChatInterface />} />
          <Route path="/history" element={<ChatHistory />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/chatquiz" element={<ChatInterfaceQUIZ />} />
          <Route path="/ui-demo" element={<UIDemo />} />
          <Route path="/state-test" element={<StateTest />} />
          <Route path="/quick-test" element={<QuickTest />} />
          <Route path="/simple-test" element={<SimpleTest />} />
          <Route path="/session-flow" element={<SessionFlow />} />
          <Route path="/profile" element={<Profile />} />
          <Route index element={<Navigate to="/chat" />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

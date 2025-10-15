import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './Pages/LandingPage';
import  SignIn  from './Pages/SignIn';
import  SignUp  from './Pages/SignUp';
import ChatInterface from './Pages/ChatInterface';
import ResetPassword from './Pages/ResetPassword';
import Avatar from './components/User Avatar/Avatar';
import Profile from './Pages/Profile';
import Performance from './Pages/Performance';
import Settings from './Pages/Settings';
import ChatHistory from './Pages/ChatHistory';
import ChatInterfaceQUIZ from './Pages/ChatInterfaceQUIZ';
import Favorites from './Pages/Favorites';

function App() {
  return (
    <Router>
      <Avatar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/chat" element={<ChatInterface />} />
        <Route path="/resetpassword" element={<ResetPassword/>} />
        <Route path="/profile" element={<Profile/>} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/history" element={<ChatHistory />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/chatquiz" element={<ChatInterfaceQUIZ/>}/>
      </Routes>
    </Router>
  );
}

export default App;










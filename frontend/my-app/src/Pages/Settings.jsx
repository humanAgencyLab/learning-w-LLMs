import React, { useState } from 'react';
import '../styles/Settings.css';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';
import PhoneIcon from '../components/Icons-Avatars/PhoneIcon';
import UserIcon from '../components/Icons-Avatars/UserIcon';
import defaultProfile from '../components/Icons-Avatars/defaultProfile.png';
import MainLayout from '../layouts/MainLayout';
import FontSizeIcon from '../components/Icons-Avatars/FontSizeIcon';
import AppearanceModeIcon from '../components/Icons-Avatars/ApperanceModeIcon';
import HistoryIcon from '../components/Icons-Avatars/HistoryIcon';
import NotificationsIcon from '../components/Icons-Avatars/NotificationsIcon';
import AccountIcon from '../components/Icons-Avatars/AccountIcon';

function Settings() {
  // State variables for settings
  // used to manage user preferences and account information
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotificiations] = useState(true);
  const [fontSize, setFontSize] = useState(20);
  const [profilePicture, setProfilePicture] = useState(
    'https://via.placeholder.com/150',
  );
  const [preview, setPreview] = useState(null);

  // Function to handle profile picture change
  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePicture(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  // Functions to toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Function to toggle notifications
  const toggleNotifications = () => {
    setNotificiations(!notifications);
  };

  return (
    <MainLayout>
      <div className={`settings-container ${darkMode ? 'dark' : ''}`}>
        <h1 className={`settings-heading ${darkMode ? 'dark' : ''}`}>
          {' '}
          Settings{' '}
        </h1>
        <h3 className={`settings-description ${darkMode ? 'dark' : ''}`}>
          {' '}
          Manage your setting preferences and account information
        </h3>

        <form className="settings-form">
          <div className="profile-picture">
            <img
              src={preview || defaultProfile}
              alt="Profile"
              className="profile-picture-img"
            />
            <input
              type="file"
              accept="image/*"
              id="profile-picture-input"
              onChange={handleProfilePictureChange}
              className="profile-picture-input"
            />
            <label
              htmlFor="profile-picture-input"
              className={`profile-picture-label ${darkMode ? 'dark' : ''}`}
            >
              Change Picture
            </label>
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <EmailIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              {' '}
              Email
            </h2>
            <input
              type="email"
              placeholder="Enter your email"
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <LockIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              {' '}
              Password
            </h2>
            <input
              type="password"
              placeholder="Enter your password"
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <PhoneIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              {' '}
              Phone Number
            </h2>
            <input
              type="tel"
              placeholder="Enter your phone number"
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <UserIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              {' '}
              Username
            </h2>
            <input
              type="text"
              placeholder="Enter your username"
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <UserIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Age
            </h2>
            <input
              type="number"
              placeholder="Enter your age"
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <FontSizeIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Fontsize
            </h2>
            <input
              type="range"
              min="10"
              max="50"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              className={`settings-input ${darkMode ? 'dark' : ''}`}
            />
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <AppearanceModeIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Apperance Mode
            </h2>
            <div className="button-container">
              <button
                type="button"
                className={`settings-button ${darkMode ? 'dark' : ''}`}
                onClick={toggleDarkMode}
              >
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <NotificationsIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Notifications
            </h2>
            <div className="button-container">
              <button
                type="button"
                className={`settings-button ${darkMode ? 'dark' : ''}`}
                onClick={toggleNotifications}
              >
                {notifications ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <HistoryIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Delete History
            </h2>
            <div className="button-container">
              <button
                type="button"
                className={`settings-button ${darkMode ? 'dark' : ''}`}
              >
                {' '}
                Delete{' '}
              </button>
            </div>
          </div>

          <div className={`input-group ${darkMode ? 'dark' : ''}`}>
            <AccountIcon className="input-icon" />
            <h2 className={`settings-property ${darkMode ? 'dark' : ''}`}>
              Delete Account
            </h2>
            <div className="button-container">
              <button
                type="button"
                className={`settings-button ${darkMode ? 'dark' : ''}`}
              >
                {' '}
                Delete{' '}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className={`settings-button ${darkMode ? 'dark' : ''}`}
          >
            Save Changes
          </button>
        </form>
      </div>
    </MainLayout>
  );
}

export default Settings;

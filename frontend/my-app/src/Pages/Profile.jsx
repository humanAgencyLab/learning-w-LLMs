import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Profile.css';
import birdAvatar from '../components/Icons-Avatars/birdAvatar.png';
import catAvatar from '../components/Icons-Avatars/catAvatar.png';
import dogAvatar from '../components/Icons-Avatars/dogAvatar.png';
import fishAvatar from '../components/Icons-Avatars/fishAvatar.png';
import lionAvatar from '../components/Icons-Avatars/lionAvatar.png';
import tigerAvatar from '../components/Icons-Avatars/tigerAvatar.png';
import giraffeAvatar from '../components/Icons-Avatars/giraffeAvatar.png';
import bunnyAvatar from '../components/Icons-Avatars/bunnyAvatar.png';
import gorillaAvatar from '../components/Icons-Avatars/gorillaAvatar.png';
import snakeAvatar from '../components/Icons-Avatars/snakeAvatar.png';
import kangarooAvatar from '../components/Icons-Avatars/kangarooAvatar.png';
import sheepAvatar from '../components/Icons-Avatars/sheepAvatar.png';
import useAuthStore from '../state/authStore';
import * as profileApi from '../lib/profileApi';

function Profile() {
  const navigate = useNavigate();
  const { user, uploadAvatar, isLoading, fetchUser } = useAuthStore();
  
  // Avatar options
  const avatars = [
    birdAvatar,
    catAvatar,
    dogAvatar,
    fishAvatar,
    lionAvatar,
    tigerAvatar,
    giraffeAvatar,
    bunnyAvatar,
    gorillaAvatar,
    snakeAvatar,
    kangarooAvatar,
    sheepAvatar,
  ];
  
  // Form state
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(avatars[0]);
  const [major, setMajor] = useState('');
  const [courses, setCourses] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState('Beginner');
  const [selectedStyle, setSelectedStyle] = useState('Visual');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [minutesPerSession, setMinutesPerSession] = useState(40);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showMajorDropdown, setShowMajorDropdown] = useState(false);
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const [showMinutesDropdown, setShowMinutesDropdown] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourse, setNewCourse] = useState('');

  // Refs for dropdowns
  const skillDropdownRef = useRef(null);
  const styleDropdownRef = useRef(null);
  const majorDropdownRef = useRef(null);
  const daysDropdownRef = useRef(null);
  const minutesDropdownRef = useRef(null);
  const avatarDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(event.target)) {
        setShowSkillDropdown(false);
      }
      if (styleDropdownRef.current && !styleDropdownRef.current.contains(event.target)) {
        setShowStyleDropdown(false);
      }
      if (majorDropdownRef.current && !majorDropdownRef.current.contains(event.target)) {
        setShowMajorDropdown(false);
      }
      if (daysDropdownRef.current && !daysDropdownRef.current.contains(event.target)) {
        setShowDaysDropdown(false);
      }
      if (minutesDropdownRef.current && !minutesDropdownRef.current.contains(event.target)) {
        setShowMinutesDropdown(false);
      }
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(event.target)) {
        setShowAvatarDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // First ensure user is loaded
        if (!user) {
          await fetchUser();
        }
        
        // Load profile data from API
        const profileData = await profileApi.getProfile();
        console.log('Loaded profile data:', profileData);
        
        if (profileData?.profile) {
          const profile = profileData.profile;
          
          // Set all fields from loaded profile data
          setName(profile.name || user?.name || '');
          // Handle major - map common abbreviations to full names
          const majorMapping = {
            'CS': 'Computer Science',
            'IT': 'Information Technology',
            'Math': 'Mathematics',
            'Eng': 'Engineering',
            'Bio': 'Biology',
            'Chem': 'Chemistry',
            'Phys': 'Physics',
            'Arch': 'Architecture',
            'Bus': 'Business',
            'Fin': 'Finance',
            'Mkt': 'Marketing',
            'Art': 'Arts',
            'Comm': 'Communications',
            'Psych': 'Psychology',
            'Soc': 'Sociology',
            'Hist': 'History',
            'Edu': 'Education',
            'Perf': 'Performing Arts',
            'Mus': 'Music',
            'Lit': 'Literature',
            'GD': 'Graphic Design',
            'PA': 'Public Administration',
            'PolSci': 'Political Science',
            'Econ': 'Economics',
            'EnvSci': 'Environmental Science',
            'Phil': 'Philosophy'
          };
          const mappedMajor = majorMapping[profile.major] || profile.major || '';
          setMajor(mappedMajor);
          setCourses(Array.isArray(profile.currentCourses) ? profile.currentCourses : []);
          setSelectedSkill(profile.skillLevel || 'Beginner');
          // Handle learning type - ensure it matches the dropdown options exactly
          const learningType = profile.learningType || 'Visual';
          setSelectedStyle(learningType);
          setDaysPerWeek(profile.daysPerWeek || 3);
          setMinutesPerSession(profile.minutesPerSession || 40);
          
          // Set avatar if user has one
          if (profile.avatarUrl) {
            // Try to match avatar URL to one of our avatars
            const avatarIndex = avatars.findIndex(av => av === profile.avatarUrl);
            if (avatarIndex >= 0) {
              setSelectedAvatar(avatars[avatarIndex]);
            }
          }
        } else if (user?.profile) {
          // Fallback to user.profile if API doesn't return profile wrapper
          const profile = user.profile;
          setName(user.name || '');
          // Handle major mapping
          const majorMapping = {
            'CS': 'Computer Science',
            'IT': 'Information Technology',
            'Math': 'Mathematics',
            'Eng': 'Engineering',
            'Bio': 'Biology',
            'Chem': 'Chemistry',
            'Phys': 'Physics',
            'Arch': 'Architecture',
            'Bus': 'Business',
            'Fin': 'Finance',
            'Mkt': 'Marketing',
            'Art': 'Arts',
            'Comm': 'Communications',
            'Psych': 'Psychology',
            'Soc': 'Sociology',
            'Hist': 'History',
            'Edu': 'Education',
            'Perf': 'Performing Arts',
            'Mus': 'Music',
            'Lit': 'Literature',
            'GD': 'Graphic Design',
            'PA': 'Public Administration',
            'PolSci': 'Political Science',
            'Econ': 'Economics',
            'EnvSci': 'Environmental Science',
            'Phil': 'Philosophy'
          };
          const mappedMajor = majorMapping[profile.major] || profile.major || '';
          setMajor(mappedMajor);
          setCourses(Array.isArray(profile.currentCourses) ? profile.currentCourses : []);
          setSelectedSkill(profile.skillLevel || 'Beginner');
          const learningType = profile.learningType || 'Visual';
          setSelectedStyle(learningType);
          setDaysPerWeek(profile.daysPerWeek || 3);
          setMinutesPerSession(profile.minutesPerSession || 40);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        // Try to use user data as fallback
        if (user?.profile) {
          const profile = user.profile;
          setName(user.name || '');
          // Handle major mapping
          const majorMapping = {
            'CS': 'Computer Science',
            'IT': 'Information Technology',
            'Math': 'Mathematics',
            'Eng': 'Engineering',
            'Bio': 'Biology',
            'Chem': 'Chemistry',
            'Phys': 'Physics',
            'Arch': 'Architecture',
            'Bus': 'Business',
            'Fin': 'Finance',
            'Mkt': 'Marketing',
            'Art': 'Arts',
            'Comm': 'Communications',
            'Psych': 'Psychology',
            'Soc': 'Sociology',
            'Hist': 'History',
            'Edu': 'Education',
            'Perf': 'Performing Arts',
            'Mus': 'Music',
            'Lit': 'Literature',
            'GD': 'Graphic Design',
            'PA': 'Public Administration',
            'PolSci': 'Political Science',
            'Econ': 'Economics',
            'EnvSci': 'Environmental Science',
            'Phil': 'Philosophy'
          };
          const mappedMajor = majorMapping[profile.major] || profile.major || '';
          setMajor(mappedMajor);
          setCourses(Array.isArray(profile.currentCourses) ? profile.currentCourses : []);
          setSelectedSkill(profile.skillLevel || 'Beginner');
          const learningType = profile.learningType || 'Visual';
          setSelectedStyle(learningType);
          setDaysPerWeek(profile.daysPerWeek || 3);
          setMinutesPerSession(profile.minutesPerSession || 40);
        } else if (!user) {
          setError('Failed to load profile. Please refresh the page.');
        }
      }
    };
    
    loadProfile();
  }, []); // Run once on mount

  const handleAvatarChange = (avatar) => {
    setSelectedAvatar(avatar);
    setShowAvatarDropdown(false);
  };

  const addCourse = () => {
    if (newCourse.trim() && courses.length < 5 && !courses.includes(newCourse.trim())) {
      setCourses([...courses, newCourse.trim()]);
      setNewCourse('');
      setShowCourseModal(false);
    }
  };

  const removeCourse = (course) => {
    setCourses(courses.filter(c => c !== course));
  };

  const handleEditClick = () => {
    setIsEditing(true);
    // Close all dropdowns when entering edit mode
    setShowAvatarDropdown(false);
    setShowSkillDropdown(false);
    setShowStyleDropdown(false);
    setShowMajorDropdown(false);
    setShowDaysDropdown(false);
    setShowMinutesDropdown(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Reverse map major from display name to stored value if needed
      const majorReverseMapping = {
        'Computer Science': 'Computer Science',
        'Information Technology': 'Information Technology',
        'Mathematics': 'Mathematics',
        'Biology': 'Biology',
        'Chemistry': 'Chemistry',
        'Physics': 'Physics',
        'Engineering': 'Engineering',
        'Architecture': 'Architecture',
        'Business': 'Business',
        'Finance': 'Finance',
        'Marketing': 'Marketing',
        'Arts': 'Arts',
        'Communications': 'Communications',
        'Psychology': 'Psychology',
        'Sociology': 'Sociology',
        'History': 'History',
        'Education': 'Education',
        'Performing Arts': 'Performing Arts',
        'Music': 'Music',
        'Literature': 'Literature',
        'Graphic Design': 'Graphic Design',
        'Public Administration': 'Public Administration',
        'Political Science': 'Political Science',
        'Economics': 'Economics',
        'Environmental Science': 'Environmental Science',
        'Philosophy': 'Philosophy',
        'Other': 'Other'
      };
      const majorToSave = majorReverseMapping[major] || major || 'Other';

      await profileApi.updateProfile({
        name: name.trim() || user?.name,
        major: majorToSave,
        currentCourses: courses,
        skillLevel: selectedSkill,
        learningType: selectedStyle, // This should already be correct (Visual, Auditory, Reading/Writing, Kinesthetic)
        daysPerWeek,
        minutesPerSession,
      });
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      // Close all dropdowns after saving
      setShowAvatarDropdown(false);
      setShowSkillDropdown(false);
      setShowStyleDropdown(false);
      setShowMajorDropdown(false);
      setShowDaysDropdown(false);
      setShowMinutesDropdown(false);
      try {
        await fetchUser();
      } catch (refreshErr) {
        console.warn('Failed to refresh user data:', refreshErr);
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    try {
      setError('');
      await uploadAvatar(file);
      setSuccess('Avatar uploaded successfully!');
    } catch (err) {
      setError(err.message || 'Failed to upload avatar');
    }
  };

  const skillLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  const learningTypes = ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'];
  const majors = [
    'Computer Science',
    'Information Technology',
    'Biology',
    'Chemistry',
    'Mathematics',
    'Physics',
    'Engineering',
    'Architecture',
    'Business',
    'Finance',
    'Marketing',
    'Arts',
    'Communications',
    'Psychology',
    'Sociology',
    'History',
    'Education',
    'Performing Arts',
    'Music',
    'Literature',
    'Graphic Design',
    'Public Administration',
    'Political Science',
    'Economics',
    'Environmental Science',
    'Philosophy',
    'Other'
  ];
  const daysOptions = [1, 2, 3, 4, 5, 6, 7];
  const minutesOptions = [10, 20, 30, 40, 50, 60, 90, 120];

  return (
    <div className="profile-page-container">
      <form className="profile-content" onSubmit={handleSubmit}>
        {/* First Card: Profile Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <div className="profile-title-section">
              <h1 className="profile-title">Profile</h1>
              {isEditing ? (
                <button
                  type="submit"
                  className="profile-save-button"
                  disabled={isLoading}
                >
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  className="profile-save-button"
                  onClick={handleEditClick}
                  disabled={isLoading}
                >
                  Edit Profile
                </button>
              )}
            </div>
            <p className="profile-subtitle">Your personal learning dashboard</p>
          </div>

          {error && (
            <div className="profile-error-message">
              {error}
            </div>
          )}

          {success && (
            <div className="profile-success-message">
              {success}
            </div>
          )}

          {/* Avatar Section */}
          <div className="profile-avatar-section">
            <div className="profile-avatar-wrapper">
              <img
                src={user?.avatarUrl || selectedAvatar}
                alt="Avatar"
                className="profile-avatar-image"
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
                  className="profile-avatar-chevron"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="#030712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
            <p className="profile-name">{name || user?.name || 'User'}</p>
          </div>

          {/* Avatar Dropdown */}
          {showAvatarDropdown && isEditing && (
            <div className="profile-avatar-dropdown" ref={avatarDropdownRef}>
              <div className="profile-avatar-grid">
                {avatars.map((avatar, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleAvatarChange(avatar)}
                    className={`profile-avatar-option ${selectedAvatar === avatar ? 'selected' : ''}`}
                  >
                    <img src={avatar} alt={`Avatar ${index + 1}`} />
                  </button>
                ))}
              </div>
              <div className="profile-avatar-upload-section">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                  id="avatar-upload"
                  disabled={isLoading || !isEditing}
                />
                {isEditing && (
                  <label htmlFor="avatar-upload" className="profile-avatar-upload-button">
                    Upload Custom Avatar
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Skill Level and Learning Type Row */}
          <div className="profile-row">
            <div className="profile-field-group">
              <label className="profile-field-label">Skill Level</label>
              <div className="profile-dropdown-wrapper" ref={skillDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      setShowSkillDropdown(!showSkillDropdown);
                      setShowStyleDropdown(false);
                      setShowMajorDropdown(false);
                    }
                  }}
                  className="profile-dropdown-button"
                  disabled={!isEditing}
                >
                  <span>{selectedSkill === 'Beginner' ? '✨ ' : ''}{selectedSkill}</span>
                  {isEditing && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                {showSkillDropdown && isEditing && (
                  <div className="profile-dropdown-menu">
                    {skillLevels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          setSelectedSkill(level);
                          setShowSkillDropdown(false);
                        }}
                        className={`profile-dropdown-item ${selectedSkill === level ? 'selected' : ''}`}
                      >
                        {level === 'Beginner' ? '✨ ' : ''}{level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">Learning Type</label>
              <div className="profile-dropdown-wrapper" ref={styleDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      setShowStyleDropdown(!showStyleDropdown);
                      setShowSkillDropdown(false);
                      setShowMajorDropdown(false);
                    }
                  }}
                  className="profile-dropdown-button"
                  disabled={!isEditing}
                >
                  <span>{selectedStyle}</span>
                  {isEditing && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                {showStyleDropdown && isEditing && (
                  <div className="profile-dropdown-menu">
                    {learningTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setSelectedStyle(type);
                          setShowStyleDropdown(false);
                        }}
                        className={`profile-dropdown-item ${selectedStyle === type ? 'selected' : ''}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Major Field */}
          <div className="profile-field-row">
            <label className="profile-field-label">Major</label>
            <div className="profile-dropdown-wrapper" ref={majorDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    setShowMajorDropdown(!showMajorDropdown);
                    setShowSkillDropdown(false);
                    setShowStyleDropdown(false);
                  }
                }}
                className="profile-dropdown-button"
                disabled={!isEditing}
              >
                <span>{major || 'Select Major'}</span>
                {isEditing && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              {showMajorDropdown && isEditing && (
                <div className="profile-dropdown-menu profile-dropdown-menu-wide">
                  {majors.map((maj) => (
                    <button
                      key={maj}
                      type="button"
                      onClick={() => {
                        setMajor(maj);
                        setShowMajorDropdown(false);
                      }}
                      className={`profile-dropdown-item ${major === maj ? 'selected' : ''}`}
                    >
                      {maj}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Second Card: Course & Goal Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <h2 className="profile-section-title">Course & Goal</h2>
            <p className="profile-subtitle">Your personal learning dashboard</p>
          </div>

          <div className="profile-row">
            {/* Current Course Section */}
            <div className="profile-course-section">
              <label className="profile-field-label">Current Course</label>
              <div className="profile-courses-list">
                {courses.map((course, index) => (
                  <div key={index} className="profile-course-chip">
                    <span>{course}</span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeCourse(course)}
                        className="profile-course-remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isEditing && courses.length < 5 && (
                <button
                  type="button"
                  onClick={() => setShowCourseModal(true)}
                  className="profile-add-course-button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5V19M5 12H19" stroke="#4e81ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Add Course</span>
                </button>
              )}
            </div>

            {/* Weekly Goal Section */}
            <div className="profile-goal-section">
              <label className="profile-field-label">Weekly Goal</label>
              <div className="profile-goal-row">
                <div className="profile-goal-field">
                  <label className="profile-goal-label">Days per week</label>
                  <div className="profile-dropdown-wrapper" ref={daysDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setShowDaysDropdown(!showDaysDropdown);
                          setShowMinutesDropdown(false);
                        }
                      }}
                      className="profile-dropdown-button"
                      disabled={!isEditing}
                    >
                      <span>{String(daysPerWeek).padStart(2, '0')}</span>
                      {isEditing && (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    {showDaysDropdown && isEditing && (
                      <div className="profile-dropdown-menu">
                        {daysOptions.map((day) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              setDaysPerWeek(day);
                              setShowDaysDropdown(false);
                            }}
                            className={`profile-dropdown-item ${daysPerWeek === day ? 'selected' : ''}`}
                          >
                            {String(day).padStart(2, '0')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="profile-goal-field">
                  <label className="profile-goal-label">Min per Session</label>
                  <div className="profile-dropdown-wrapper" ref={minutesDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setShowMinutesDropdown(!showMinutesDropdown);
                          setShowDaysDropdown(false);
                        }
                      }}
                      className="profile-dropdown-button"
                      disabled={!isEditing}
                    >
                      <span>{minutesPerSession}</span>
                      {isEditing && (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    {showMinutesDropdown && isEditing && (
                      <div className="profile-dropdown-menu">
                        {minutesOptions.map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => {
                              setMinutesPerSession(min);
                              setShowMinutesDropdown(false);
                            }}
                            className={`profile-dropdown-item ${minutesPerSession === min ? 'selected' : ''}`}
                          >
                            {min}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Course Modal */}
      {showCourseModal && (
        <div className="profile-modal-overlay" onClick={() => setShowCourseModal(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="profile-modal-title">Add Course</h3>
            <div className="profile-modal-content">
              <input
                type="text"
                placeholder="Enter course name"
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCourse();
                  }
                }}
                className="profile-modal-input"
                autoFocus
              />
              {courses.length >= 5 && (
                <p className="profile-modal-error">Maximum 5 courses allowed</p>
              )}
            </div>
            <div className="profile-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowCourseModal(false);
                  setNewCourse('');
                }}
                className="profile-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCourse}
                className="profile-modal-add"
                disabled={!newCourse.trim() || courses.length >= 5 || courses.includes(newCourse.trim())}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;

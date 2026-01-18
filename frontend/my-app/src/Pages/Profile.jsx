import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Profile.css';
import { avatars } from '../utils/avatars';
import useAuthStore from '../state/authStore';
import * as profileApi from '../lib/profileApi';
import EmailIcon from '../components/SignIn/EmailIcon';
import LockIcon from '../components/SignIn/LockIcon';
import PhoneIcon from '../components/Icons-Avatars/PhoneIcon';
import UserIcon from '../components/Icons-Avatars/UserIcon';
import { API_BASE } from '../config';
import { getAuthHeaders } from '../lib/authApi';
import { toastBus } from '../components/ui/toast';

function Profile() {
  const navigate = useNavigate();
  const { user, uploadAvatar, isLoading, fetchUser } = useAuthStore();
  
  // Form state
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(avatars[0]);
  const [originalAvatar, setOriginalAvatar] = useState(null); // Store original avatar when entering edit mode
  const [major, setMajor] = useState('');
  const [recentTopics, setRecentTopics] = useState([]);
  const [selfRating, setSelfRating] = useState('Intermediate');
  const [topicInput, setTopicInput] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [minutesPerSession, setMinutesPerSession] = useState(40);
  
  // Store original values when entering edit mode
  const [originalValues, setOriginalValues] = useState(null);
  const [originalSettingsValues, setOriginalSettingsValues] = useState(null); // Store original Settings values
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Settings fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  
  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingSettings, setIsEditingSettings] = useState(false); // Separate edit state for Settings section
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const [showSelfRatingDropdown, setShowSelfRatingDropdown] = useState(false);
  const [showMajorDropdown, setShowMajorDropdown] = useState(false);
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const [showMinutesDropdown, setShowMinutesDropdown] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [gemsCount, setGemsCount] = useState(0);
  const [modulesCompleted, setModulesCompleted] = useState(0);
  const [topicsCompleted, setTopicsCompleted] = useState(0);

  // Refs for dropdowns
  const selfRatingDropdownRef = useRef(null);
  const majorDropdownRef = useRef(null);
  const daysDropdownRef = useRef(null);
  const minutesDropdownRef = useRef(null);
  const avatarDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selfRatingDropdownRef.current && !selfRatingDropdownRef.current.contains(event.target)) {
        setShowSelfRatingDropdown(false);
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

  // Load user profile on mount and when user changes
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // First ensure user is loaded
        if (!user) {
          await fetchUser();
        }
        
        // Wait a bit to ensure user is fully loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load profile data from API
        const profileData = await profileApi.getProfile();
        console.log('Loaded profile data:', profileData);
        console.log('Profile stats:', profileData?.stats);
        console.log('Profile mobile field:', profileData?.profile?.mobile);
        
        // Set stats immediately if available
        if (profileData?.stats) {
          console.log('Setting stats from profileData:', profileData.stats);
          console.log('Gems:', profileData.stats.gemsTotal);
          console.log('Modules:', profileData.stats.modulesCompleted);
          console.log('Topics:', profileData.stats.topicsCompleted);
          setGemsCount(profileData.stats.gemsTotal || 0);
          setModulesCompleted(profileData.stats.modulesCompleted ?? 0);
          setTopicsCompleted(profileData.stats.topicsCompleted ?? 0);
        } else {
          console.warn('No stats found in profileData:', profileData);
        }
        
        if (profileData?.profile) {
          const profile = profileData.profile;
          
          // Set all fields from loaded profile data
          setName(profile.name || user?.name || '');
          setUsername(user?.username || '');
          setEmail(profile.email || user?.email || '');
          setMobile(profile.mobile || '');
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
          setRecentTopics(Array.isArray(profile.recentTopics) ? profile.recentTopics : []);
          setSelfRating(profile.selfRating || 'Intermediate');
          setDaysPerWeek(profile.daysPerWeek || 3);
          setMinutesPerSession(profile.minutesPerSession || 40);
          setMobile(profile.mobile || '');
          
          // Set avatar if user has one
          if (profile.avatarUrl) {
            // Try to match avatar URL to one of our avatars
            const avatarIndex = avatars.findIndex(av => av === profile.avatarUrl);
            if (avatarIndex >= 0) {
              setSelectedAvatar(avatars[avatarIndex]);
            } else {
              // If avatarUrl is not in the avatars list, use it directly
              setSelectedAvatar(profile.avatarUrl);
            }
          }
        } else if (user?.profile) {
          // Fallback to user.profile if API doesn't return profile wrapper
          const profile = user.profile;
          setName(user.name || '');
          setUsername(user.username || '');
          setEmail(user.email || '');
          setMobile(profile.mobile || '');
          
          // Set avatar if user has one
          if (user.avatarUrl) {
            const avatarIndex = avatars.findIndex(av => av === user.avatarUrl);
            if (avatarIndex >= 0) {
              setSelectedAvatar(avatars[avatarIndex]);
            } else {
              setSelectedAvatar(user.avatarUrl);
            }
          }
          
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
          
          // Set stats if available (fallback case)
          if (user?.stats) {
            setGemsCount(user.stats.gemsTotal || 0);
            setModulesCompleted(user.stats.modulesCompleted || 0);
            setTopicsCompleted(user.stats.topicsCompleted || 0);
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        // Try to use user data as fallback
        if (user?.profile) {
          const profile = user.profile;
          setName(user.name || '');
          setUsername(user.username || '');
          setEmail(user.email || '');
          setMobile(profile.mobile || '');
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
          setMobile(profile.mobile || '');
          
          // Set stats if available (fallback case)
          if (user?.stats) {
            setGemsCount(user.stats.gemsTotal || 0);
            setModulesCompleted(user.stats.modulesCompleted || 0);
            setTopicsCompleted(user.stats.topicsCompleted || 0);
          }
        } else if (!user) {
          setError('Failed to load profile. Please refresh the page.');
        }
      }
    };
    
    loadProfile();
    loadCertificates();
  }, [user]); // Run when user changes (e.g., after login)
  
  // Sync email and username from user object when it changes (e.g., after email update)
  useEffect(() => {
    if (user?.email && user.email !== email) {
      console.log('Syncing email from user object:', user.email);
      setEmail(user.email);
    }
    if (user?.username && user.username !== username) {
      console.log('Syncing username from user object:', user.username);
      setUsername(user.username);
    }
  }, [user?.email, user?.username]); // Only run when user.email or user.username changes

  // Load certificates
  const loadCertificates = async () => {
    setLoadingCertificates(true);
    try {
      const certs = await profileApi.getCertificates();
      setCertificates(Array.isArray(certs) ? certs : []);
    } catch (error) {
      console.error('Failed to load certificates:', error);
      setCertificates([]);
    } finally {
      setLoadingCertificates(false);
    }
  };

  // Download certificate
  const handleDownloadCertificate = async (certificateId, topic) => {
    try {
      const blob = await profileApi.downloadCertificate(certificateId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate_${topic.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download certificate:', error);
      setError(error.message || 'Failed to download certificate');
    }
  };

  // View certificate in new tab

  const handleViewCertificate = async (certificateId, topic) => {
    try {
      const blob = await profileApi.downloadCertificate(certificateId);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Clean up the URL after a delay to allow the browser to load it
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Failed to view certificate:', error);
      setError(error.message || 'Failed to view certificate');
    }
  };

  const handleAvatarChange = (avatar) => {
    setSelectedAvatar(avatar);
    setShowAvatarDropdown(false);
    // Avatar will be updated when user clicks Save button
  };

  const addTopic = () => {
    // Limit to 1 topic only
    if (topicInput.trim() && recentTopics.length === 0) {
      setRecentTopics([topicInput.trim()]);
      setTopicInput('');
    }
  };

  const removeTopic = (topic) => {
    setRecentTopics(recentTopics.filter(t => t !== topic));
  };

  const handleEditClick = () => {
    // Prevent multiple clicks
    if (isSaving || isLoading) {
      return;
    }
    
    // Store all original values when entering edit mode
      setOriginalValues({
      avatar: user?.avatarUrl || selectedAvatar,
      name: name,
      major: major,
      recentTopics: [...recentTopics],
      selfRating: selfRating,
      daysPerWeek: daysPerWeek,
      minutesPerSession: minutesPerSession,
      mobile: mobile
      // Note: email is not included here as it's handled in Settings section
    });
    setOriginalAvatar(user?.avatarUrl || selectedAvatar);
    setIsEditing(true);
    // Close all dropdowns when entering edit mode
    setShowAvatarDropdown(false);
    setShowSkillDropdown(false);
    setShowStyleDropdown(false);
    setShowMajorDropdown(false);
    setShowDaysDropdown(false);
    setShowMinutesDropdown(false);
    // Reset password fields
    setShowPasswordSection(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    // Don't include email/password in main edit flow
  };
  
  const handleEditSettingsClick = () => {
    // Prevent multiple clicks
    if (isSaving || isLoading) {
      return;
    }
    
    // Store original Settings values when entering edit mode
    setOriginalSettingsValues({
      username: username,
      email: email,
      mobile: mobile
    });
    setIsEditingSettings(true);
    setShowPasswordSection(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };
  
  const handleCancelSettingsEdit = () => {
    // Revert Settings fields to original values when canceling
    if (originalSettingsValues) {
      setUsername(originalSettingsValues.username || '');
      setEmail(originalSettingsValues.email);
      setMobile(originalSettingsValues.mobile);
    }
    setIsEditingSettings(false);
    setShowPasswordSection(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setOriginalSettingsValues(null);
  };
  
  const handleSaveSettings = async () => {
    // Only allow save when in Settings edit mode
    if (!isEditingSettings) {
      return;
    }
    
    // Prevent multiple submissions
    if (isSaving || isLoading) {
      return;
    }
    
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      // Update email if changed
      if (email && email.trim() && email !== user?.email) {
        try {
          const emailResult = await profileApi.updateEmail(email.trim());
          console.log('Email update result:', emailResult);
        } catch (emailErr) {
          console.error('Email update error:', emailErr);
          
          // Check if error is due to email already existing
          const isEmailExists = emailErr.code === 'EMAIL_EXISTS' || 
                               emailErr.status === 409 ||
                               (emailErr.message && (
                                 emailErr.message.toLowerCase().includes('email already') || 
                                 emailErr.message.toLowerCase().includes('already registered') ||
                                 emailErr.message.toLowerCase().includes('email exists')
                               ));
          
          if (isEmailExists) {
            // Show warning toast for email already exists
            toastBus.publish({
              message: 'This email is already registered. Please use a different email address.',
              type: 'warning',
              duration: 5000
            });
            setError('This email is already registered. Please use a different email address.');
          } else {
            setError(emailErr.message || 'Failed to update email');
          }
          setIsSaving(false);
          return;
        }
      } else if (!email || !email.trim()) {
        // Email is required, don't allow empty email
        setError('Email is required');
        setIsSaving(false);
        return;
      }
      
      // Update mobile in profile
      const profileUpdateData = {
        mobile: mobile.trim() || '',
      };
      
      await profileApi.updateProfile(profileUpdateData);
      
      // Update password if provided
      if (showPasswordSection && newPassword) {
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match');
          setIsSaving(false);
          return;
        }
        if (!currentPassword) {
          setError('Current password is required');
          setIsSaving(false);
          return;
        }
        try {
          await profileApi.changePassword(currentPassword, newPassword);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setShowPasswordSection(false);
        } catch (passwordErr) {
          setError(passwordErr.message || 'Failed to change password');
          setIsSaving(false);
          return;
        }
      }
      
      // Refresh user data to get updated email
      // Call fetchUser which will update the authStore and return the updated user
      const updatedUser = await fetchUser();
      
      // Reload profile data to ensure everything is in sync
      const profileData = await profileApi.getProfile();
      
      // Update state with fresh values
      // Email is stored in user object, mobile is in profile
      // If email was updated, use the updatedUser.email (from fetchUser) or the email we just saved
      const emailWasUpdated = email && email.trim() && email !== user?.email;
      
      // Get the new email - prefer updatedUser.email, fallback to the email we just saved
      let newEmail;
      if (emailWasUpdated) {
        // Email was updated, use the one from the server response or the one we saved
        newEmail = updatedUser?.email || email.trim();
      } else {
        // Email wasn't changed, keep current
        newEmail = updatedUser?.email || user?.email || email;
      }
      
      const newMobile = profileData?.profile?.mobile || mobile;
      
      console.log('Updating Settings state after save:', {
        emailWasUpdated,
        updatedUserEmail: updatedUser?.email,
        savedEmail: email.trim(),
        currentUserEmail: user?.email,
        newEmail,
        profileMobile: profileData?.profile?.mobile,
        currentMobile: mobile,
        newMobile
      });
      
      // Update state - force update with the new values
      setEmail(newEmail);
      setMobile(newMobile);
      
      // Also update the user object in authStore to ensure consistency
      // The fetchUser() call above should have already done this, but we'll verify
      const storeUser = getAuthStore().user;
      if (storeUser && storeUser.email !== newEmail) {
        console.log('Email mismatch in store, refreshing...');
        await fetchUser(); // Refresh one more time to ensure consistency
        const refreshedUser = getAuthStore().user;
        if (refreshedUser?.email) {
          setEmail(refreshedUser.email);
        }
      }
      
      setSuccess('Settings updated successfully!');
      setIsEditingSettings(false);
      setOriginalSettingsValues(null);
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsSaving(false);
    } catch (err) {
      setError(err.message || 'Failed to update settings');
      setIsSaving(false);
    }
  };
  
  const handleCancelEdit = () => {
    // Revert all fields to original values when canceling
    if (originalValues) {
      setSelectedAvatar(originalValues.avatar);
      setName(originalValues.name);
      setMajor(originalValues.major);
      setRecentTopics([...originalValues.recentTopics]);
      setSelfRating(originalValues.selfRating);
      setDaysPerWeek(originalValues.daysPerWeek);
      setMinutesPerSession(originalValues.minutesPerSession);
      setMobile(originalValues.mobile);
      // Note: email is not reverted here as it's handled in Settings section
    }
    setIsEditing(false);
    setShowAvatarDropdown(false);
    setShowSelfRatingDropdown(false);
    setShowMajorDropdown(false);
    setShowDaysDropdown(false);
    setShowMinutesDropdown(false);
    setOriginalAvatar(null);
    setOriginalValues(null);
  };

  const handleSave = async () => {
    // Only allow save when in edit mode
    if (!isEditing) {
      return;
    }
    
    // Prevent multiple submissions
    if (isSaving || isLoading) {
      return;
    }
    
    setError('');
    setSuccess('');
    setIsSaving(true);

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

      // Update profile (mobile is handled in Settings section)
      const profileUpdateData = {
        name: name.trim() || user?.name,
        major: majorToSave,
        recentTopics: recentTopics,
        selfRating: selfRating,
        daysPerWeek,
        minutesPerSession,
        // Note: mobile is handled in Settings section, not here
      };
      
      // Include avatarUrl if a new avatar was selected (different from current)
      if (selectedAvatar && selectedAvatar !== user?.avatarUrl) {
        profileUpdateData.avatarUrl = selectedAvatar;
      }
      
      console.log('Saving profile data:', profileUpdateData);
      const updateResult = await profileApi.updateProfile(profileUpdateData);
      console.log('Profile update result:', updateResult);
      
      // Email and password are handled in Settings section, not here
      
      // Refresh user data first
      try {
        await fetchUser();
      } catch (refreshErr) {
        console.warn('Failed to refresh user data:', refreshErr);
      }
      
      // Reload profile data to ensure everything is in sync
      try {
        const profileData = await profileApi.getProfile();
        if (profileData?.profile) {
          const profile = profileData.profile;
          setName(profile.name || user?.name || '');
          setEmail(profile.email || user?.email || '');
          setMobile(profile.mobile || '');
          // Update other fields as needed
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
      } catch (profileErr) {
        console.warn('Failed to reload profile data:', profileErr);
      }
      
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      setOriginalAvatar(null); // Clear original avatar after successful save
      setOriginalValues(null); // Clear original values after successful save
      // Close all dropdowns after saving
      setShowAvatarDropdown(false);
      setShowSkillDropdown(false);
      setShowStyleDropdown(false);
      setShowMajorDropdown(false);
      setShowDaysDropdown(false);
      setShowMinutesDropdown(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
      // Refresh user data to get updated avatar and stats
      await fetchUser();
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

  const selfRatingOptions = ['None', 'Basic', 'Intermediate', 'Advanced'];
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
      <div className="profile-content">
        {/* First Card: Profile Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <div className="profile-title-section">
              <h1 className="profile-title">Profile</h1>
              {isEditing ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="profile-cancel-button"
                    onClick={handleCancelEdit}
                    disabled={isLoading || isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="profile-save-button"
                    onClick={handleSave}
                    disabled={isLoading || isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="profile-save-button"
                  onClick={handleEditClick}
                  disabled={isLoading || isSaving}
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
                src={isEditing ? selectedAvatar : (user?.avatarUrl || selectedAvatar)}
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

          {/* Stats Row: Gems, Modules Completed, Topics Completed */}
          <div className="profile-row">
            <div className="profile-field-group">
              <label className="profile-field-label">Gems</label>
              <div className="profile-stats-display">
                <span className="profile-stats-value">💎 {gemsCount}</span>
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">Modules Completed</label>
              <div className="profile-stats-display">
                <span className="profile-stats-value">📚 {modulesCompleted}</span>
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">Topics Completed</label>
              <div className="profile-stats-display">
                <span className="profile-stats-value">✅ {topicsCompleted}</span>
              </div>
            </div>
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

          {/* Topic and Self-Rating Row */}
          <div className="profile-row">
            <div className="profile-field-group" style={{ flex: 1 }}>
              <label className="profile-field-label">Topic of Interest</label>
              <div style={{ marginTop: '8px' }}>
                {recentTopics.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {recentTopics.map((topic, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        padding: '6px 12px',
                        background: '#f0f4ff',
                        borderRadius: '20px',
                        fontSize: '14px'
                      }}>
                        <span>{topic}</span>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => removeTopic(topic)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#666',
                              cursor: 'pointer',
                              fontSize: '18px',
                              lineHeight: 1,
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#666' }}>No topic added</div>
                )}
                {isEditing && recentTopics.length === 0 && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter topic"
                      value={topicInput}
                      maxLength={50}
                      onChange={(e) => {
                        if (e.target.value.length <= 50) {
                          setTopicInput(e.target.value);
                        }
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTopic();
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #e6e7e8',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="button"
                      onClick={addTopic}
                      disabled={!topicInput.trim()}
                      style={{
                        padding: '8px 16px',
                        background: '#4e81ee',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: topicInput.trim() ? 'pointer' : 'not-allowed',
                        opacity: topicInput.trim() ? 1 : 0.5
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
                {recentTopics.length > 0 && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>You can have 1 topic only</p>
                )}
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">Self-Rating</label>
              <div className="profile-dropdown-wrapper" ref={selfRatingDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      setShowSelfRatingDropdown(!showSelfRatingDropdown);
                      setShowMajorDropdown(false);
                    }
                  }}
                  className="profile-dropdown-button"
                  disabled={!isEditing}
                >
                  <span>{selfRating}</span>
                  {isEditing && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9L12 15L18 9" stroke="#353C49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                {showSelfRatingDropdown && isEditing && (
                  <div className="profile-dropdown-menu">
                    {selfRatingOptions.map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => {
                          setSelfRating(rating);
                          setShowSelfRatingDropdown(false);
                        }}
                        className={`profile-dropdown-item ${selfRating === rating ? 'selected' : ''}`}
                      >
                        {rating}
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
                      setShowSelfRatingDropdown(false);
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

        {/* Second Card: Learning Goals Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <h2 className="profile-section-title">Learning Goals</h2>
            <p className="profile-subtitle">Your learning schedule and goals</p>
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

        {/* Third Card: Settings Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <div className="profile-title-section">
              <div>
                <h2 className="profile-section-title">Settings</h2>
                <p className="profile-subtitle">Manage your account information</p>
              </div>
              {isEditingSettings ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="profile-cancel-button"
                    onClick={handleCancelSettingsEdit}
                    disabled={isLoading || isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="profile-save-button"
                    onClick={handleSaveSettings}
                    disabled={isLoading || isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="profile-save-button"
                  onClick={handleEditSettingsClick}
                  disabled={isLoading || isSaving}
                >
                  Edit Settings
                </button>
              )}
            </div>
          </div>

          {/* Username Field */}
          <div className="profile-field-row">
            <label className="profile-field-label">
              <UserIcon style={{ width: '20px', height: '20px', marginRight: '8px', display: 'inline-block' }} />
              Username
            </label>
            <input
              type="text"
              value={username}
              maxLength={30}
              onChange={(e) => {
                const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                if (value.length <= 30) {
                  setUsername(value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                  handleSaveSettings();
                }
              }}
              className="profile-input"
              disabled={true}
              placeholder="Username (cannot be changed)"
              title="Username cannot be changed after account creation"
            />
          </div>

          {/* Email Field */}
          <div className="profile-field-row">
            <label className="profile-field-label">
              <EmailIcon style={{ width: '20px', height: '20px', marginRight: '8px', display: 'inline-block' }} />
              Email
            </label>
            <input
              type="email"
              value={email}
              maxLength={255}
              onChange={(e) => {
                if (e.target.value.length <= 255) {
                  setEmail(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                  handleSaveSettings();
                }
              }}
              className="profile-input"
              disabled={!isEditingSettings}
              placeholder="Enter your email"
            />
          </div>

          {/* Mobile Field */}
          <div className="profile-field-row">
            <label className="profile-field-label">
              <PhoneIcon style={{ width: '20px', height: '20px', marginRight: '8px', display: 'inline-block' }} />
              Phone Number
            </label>
            <input
              type="tel"
              value={mobile}
              maxLength={20}
              onChange={(e) => {
                if (e.target.value.length <= 20) {
                  setMobile(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                  handleSaveSettings();
                }
              }}
              className="profile-input"
              disabled={!isEditingSettings}
              placeholder="Enter your phone number"
            />
          </div>

          {/* Password Change Section */}
          <div className="profile-field-row">
            <label className="profile-field-label">
              <LockIcon style={{ width: '20px', height: '20px', marginRight: '8px', display: 'inline-block' }} />
              Password
            </label>
            {!showPasswordSection ? (
              <button
                type="button"
                onClick={() => setShowPasswordSection(true)}
                className="profile-change-password-button"
                disabled={!isEditingSettings}
              >
                Change Password
              </button>
            ) : (
              <div className="profile-password-section">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                      handleSaveSettings();
                    }
                  }}
                  className="profile-input"
                  placeholder="Current password"
                  disabled={!isEditingSettings}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                      handleSaveSettings();
                    }
                  }}
                  className="profile-input"
                  placeholder="New password"
                  disabled={!isEditingSettings}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isEditingSettings && !isSaving) {
                      handleSaveSettings();
                    }
                  }}
                  className="profile-input"
                  placeholder="Confirm new password"
                  disabled={!isEditingSettings}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSection(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="profile-cancel-password-button"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fourth Card: Achieved Certificates Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <div>
              <h2 className="profile-section-title">Achieved Certificates</h2>
              <p className="profile-subtitle">Your course completion certificates</p>
            </div>
          </div>

          {loadingCertificates ? (
            <div className="profile-loading">Loading certificates...</div>
          ) : certificates.length === 0 ? (
            <div className="profile-empty-state">
              <p className="profile-empty-text">No certificates yet. Complete a course to earn your first certificate!</p>
            </div>
          ) : (
            <div className="profile-certificates-list">
              {certificates.map((cert) => (
                <div key={cert.certificateId} className="profile-certificate-item">
                  <div className="profile-certificate-item-left">
                    <div className="profile-certificate-icon">🎓</div>
                    <div className="profile-certificate-content">
                      <h3 className="profile-certificate-topic">{cert.topic}</h3>
                      <p className="profile-certificate-date">
                        Issued: {new Date(cert.issuedAt).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="profile-certificate-actions">
                    <button
                      type="button"
                      onClick={() => handleViewCertificate(cert.certificateId, cert.topic)}
                      className="profile-certificate-view"
                      title="View certificate"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCertificate(cert.certificateId, cert.topic)}
                      className="profile-certificate-download"
                      title="Download certificate"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;

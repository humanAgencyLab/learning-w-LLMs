import React, { useState } from 'react';
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
import MainLayout from '../layouts/MainLayout';

function Profile() {
  // logic for avatars
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
  const [selectedAvatar, setSelectedAvatar] = useState(avatars[0]);
  const handleAvatarChange = (avatar) => {
    setSelectedAvatar(avatar);
  };
  // logic for courses
  const [courses, setCourses] = useState([]);
  const [newCourse, setNewCourse] = useState('');
  const addCourse = (e) => {
    if (newCourse.trim !== '') {
      setCourses([...courses, newCourse]);
      setNewCourse('');
    }
    e.preventDefault();
  };
  const removeCourse = (index) => {
    setCourses(courses.filter((_, i) => i !== index));
  };
  //logic for skill level + learning style
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  return (
    <MainLayout>
      <div className="profile-container">
        <h1 className="profile-heading">Profile</h1>
        <h3 className="profile-description">
          Your Personal Learning Dashboard
        </h3>
        <form className="profile-form">
          <div className="input-group">
            <div className="profile-avatar">
              <h2 className="profile-avatar-title"> Choose your avatar!</h2>
              <img
                src={selectedAvatar}
                alt="Seleccted Avatar"
                className="profile-avatar-img"
              />
            </div>
            <div className="avatar-selection">
              {avatars.map((avatar, index) => (
                <img
                  key={index}
                  src={avatar}
                  alt={`Avatar ${index + 1}`}
                  className={`avatar-option ${selectedAvatar === avatar ? 'selected' : ''}`}
                  onClick={() => handleAvatarChange(avatar)}
                />
              ))}
            </div>
          </div>
          <div className="input-group">
            <h2 className="profile-property">Major</h2>
            {/*major choices*/}
            <select>
              <option value="computer-science">Computer Science</option>
              <option value="information-technology">
                Information Technology
              </option>
              <option value="biology">Biology</option>
              <option value="chemistry">Chemistry</option>
              <option value="mathematics">Mathematics</option>
              <option value="physics">Physics</option>
              <option value="nursing">Engineering</option>
              <option value="architecture">Architecture</option>
              <option value="engineering">Engineering</option>
              <option value="business">Business</option>
              <option value="finance">Finance</option>
              <option value="marketing">Marketing</option>
              <option value="arts">Arts</option>
              <option value="Communications">Communications</option>
              <option value="psychology">Psychology</option>
              <option value="sociology">Sociology</option>
              <option value="history">History</option>
              <option value="education">Education</option>
              <option value="performing-arts">Performing Arts</option>
              <option value="music">Music</option>
              <option value="literature">Literature</option>
              <option value="graphic-design">Graphic Design</option>
              <option value="public-administration">
                Public Administration
              </option>
              <option value="political-science">Political Science</option>
              <option value="economics">Economics</option>
              <option value="environmental-science">
                Environmental Science
              </option>
              <option value="philosophy">Philosophy</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="input-group profile-course-container">
            <h2 className="profile-property">Current Courses</h2>
            {courses.length > 0 && (
              <ul className="profile-course-list">
                {courses.map((course, index) => (
                  <li key={index} className="profile-course-item">
                    {course}
                    <button
                      type="button"
                      onClick={() => removeCourse(index)}
                      className="profile-remove-button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="profile-course-input">
              <input
                type="text"
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                placeholder="Add a new course"
                className="profile-input"
              />
              <button
                type="button"
                onClick={addCourse}
                className="profile-add-button"
              >
                Add
              </button>
            </div>
          </div>
          <div className="profile-horizontal-section">
            <div className="input-group half-width">
              <h2 className="profile-property">Skill Level</h2>
              <div className="option-buttons">
                {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(
                  (level) => (
                    <button
                      type="button"
                      key={level}
                      className={`option-button ${selectedSkill === level ? 'selected' : ''}`}
                      onClick={() => setSelectedSkill(level)}
                    >
                      {' '}
                      {level}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="input-group half-width">
              <h2 className="profile-property">Learning Style</h2>
              <div className="option-buttons">
                {['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'].map(
                  (style) => (
                    <button
                      type="button"
                      key={style}
                      className={`option-button ${selectedStyle === style ? 'selected' : ''}`}
                      onClick={() => setSelectedStyle(style)}
                    >
                      {' '}
                      {style}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="input-group weekly-goals">
            <h2 className="profile-property weekly-goals">Weekly Goals</h2>
            <div className="weekly-goal-row">
              <input
                type="number"
                className="profile-input"
                placeholder="3"
                min="0"
                max="7"
              />
              <span>days per week</span>
            </div>
            <div className="weekly-goal-row">
              <input
                type="number"
                className="profile-input"
                placeholder="10"
                min="5"
              />
              <span>minutes per session</span>
            </div>
          </div>
          <button type="submit" className="profile-submit-button">
            Save Changes
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
export default Profile;

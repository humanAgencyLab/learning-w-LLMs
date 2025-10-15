import React, { useState } from 'react';
import './RightProgressPanel.css';

const RightProgressPanel = ({ srlState, onNextAction }) => {
  const { topic, phase, plan, currentModuleId, progress } = srlState || {};
  
  // Mock data for demonstration - replace with actual srlState data
  const mockData = {
    topic: topic || "Python Basic",
    phase: phase || "ASSESSMENT",
    progress: progress || { overall: 65, modules: 3, completed: 2 },
    modules: [
      {
        id: 1,
        title: "Variables & Data Types",
        status: "complete",
        duration: "15 min",
        lessons: 4
      },
      {
        id: 2,
        title: "Control Structures",
        status: "in_progress",
        duration: "25 min",
        lessons: 6,
        currentLesson: 3
      },
      {
        id: 3,
        title: "Functions & Modules",
        status: "locked",
        duration: "30 min",
        lessons: 8
      },
      {
        id: 4,
        title: "Object-Oriented Programming",
        status: "locked",
        duration: "45 min",
        lessons: 12
      }
    ],
    milestones: [
      { id: 1, text: "Complete first module", completed: true },
      { id: 2, text: "Pass assessment quiz", completed: true },
      { id: 3, text: "Build first project", completed: false },
      { id: 4, text: "Complete all modules", completed: false }
    ]
  };

  const [milestones, setMilestones] = useState(mockData.milestones);

  const handleMilestoneClick = (milestoneId) => {
    setMilestones(prev => 
      prev.map(milestone => 
        milestone.id === milestoneId 
          ? { ...milestone, completed: !milestone.completed }
          : milestone
      )
    );
  };

  const handleModuleClick = (module) => {
    if (module.status === 'locked') return;
    console.log('Module clicked:', module);
    // Handle module navigation
  };

  const handleAskQuestion = () => {
    console.log('Ask Question clicked');
    // Handle ask question action
  };

  const getModuleIcon = (status) => {
    switch (status) {
      case 'complete':
        return (
          <div className="module-icon complete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        );
      case 'in_progress':
        return (
          <div className="module-icon in-progress">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21"/>
            </svg>
          </div>
        );
      case 'locked':
      default:
        return (
          <div className="module-icon locked">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <circle cx="12" cy="16" r="1"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        );
    }
  };

  return (
    <div className="right-progress-panel">
      <div className="panel-header">
        <div className="header-content">
          <h2 className="topic-title">{mockData.topic}</h2>
          <div className={`phase-badge ${mockData.phase.toLowerCase()}`}>{mockData.phase}</div>
        </div>
      </div>

      <div className="panel-content">
        {/* Overall Progress */}
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">Overall Progress</span>
            <span className="progress-percentage">{mockData.progress.overall}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${mockData.progress.overall}%` }}
            ></div>
          </div>
        </div>

        {/* Learning Path */}
        <div className="learning-path-section">
          <h3 className="section-title">Learning Path</h3>
          <div className="modules-list">
            {mockData.modules.map((module, index) => (
              <div
                key={module.id}
                className={`module-card ${module.status}`}
                onClick={() => handleModuleClick(module)}
              >
                <div className="module-header">
                  {getModuleIcon(module.status)}
                  <div className="module-info">
                    <h4 className="module-title">{module.title}</h4>
                    <div className="module-meta">
                      <span className="module-duration">{module.duration}</span>
                      <span className="module-lessons">{module.lessons} lessons</span>
                    </div>
                  </div>
                </div>
                {module.status === 'in_progress' && module.currentLesson && (
                  <div className="module-progress">
                    <div className="mini-progress-bar">
                      <div 
                        className="mini-progress-fill"
                        style={{ width: `${(module.currentLesson / module.lessons) * 100}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">Lesson {module.currentLesson} of {module.lessons}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <div className="milestones-section">
          <h3 className="section-title">Milestones</h3>
          <div className="milestones-list">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`milestone-item ${milestone.completed ? 'completed' : ''}`}
                onClick={() => handleMilestoneClick(milestone.id)}
              >
                <div className="milestone-checkbox">
                  {milestone.completed && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <span className="milestone-text">{milestone.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ask Question Button */}
      <div className="panel-footer">
        <button className="ask-question-btn" onClick={handleAskQuestion}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Ask Question
        </button>
      </div>
    </div>
  );
};

export default RightProgressPanel;

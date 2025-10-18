import React from 'react';
import useSessionStore from '../state/sessionStore';
import { HARDCODED_PROFILE } from '../data/userProfile';
import { Button, Card, CardContent, Select, Input, Progress } from '../components/ui';

const StateTest = () => {
  const {
    sessionId,
    learningStyle,
    phase,
    topic,
    chatTitle,
    plan,
    progressPercent,
    points,
    gems,
    hasTrophy,
    isViewOnly,
    nextAction,
    setLearningStyle,
    setPhase,
    setTopic,
    setChatTitle,
    setPlan,
    setProgress,
    setPoints,
    setGems,
    setHasTrophy,
    setViewOnly,
    setNextAction,
    getLearningStyleDisplayName,
    getPhaseDisplayName,
    reset,
  } = useSessionStore();

  const containerStyles = {
    backgroundColor: 'var(--color-bg)',
    minHeight: '100vh',
    color: 'var(--color-text)',
    padding: 'var(--space-6)',
  };

  const gridStyles = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 'var(--space-6)',
    marginBottom: 'var(--space-6)',
  };

  const sectionStyles = {
    marginBottom: 'var(--space-6)',
  };

  return (
    <div style={containerStyles}>
      <h1>State Management Test Page</h1>
      <p>This page demonstrates the centralized state management system.</p>

      <div style={sectionStyles}>
        <h2>User Profile (Hardcoded)</h2>
        <Card>
          <CardContent>
            <p><strong>Name:</strong> {HARDCODED_PROFILE.name}</p>
            <p><strong>Education:</strong> {HARDCODED_PROFILE.education}</p>
            <p><strong>Recent Courses:</strong> {HARDCODED_PROFILE.recentCourses.join(', ')}</p>
            <p><strong>Strengths:</strong> {HARDCODED_PROFILE.strengths.join(', ')}</p>
            <p><strong>Gaps:</strong> {HARDCODED_PROFILE.gaps.join(', ')}</p>
            <p><strong>Goals:</strong> {HARDCODED_PROFILE.goals.join(', ')}</p>
          </CardContent>
        </Card>
      </div>

      <div style={sectionStyles}>
        <h2>Session State Controls</h2>
        <div style={gridStyles}>
          <Card>
            <CardContent>
              <h3>Learning Style</h3>
              <Select
                value={learningStyle}
                onChange={(e) => setLearningStyle(e.target.value)}
                options={[
                  { value: 'studying', label: 'Studying' },
                  { value: 'revision', label: 'Revision' },
                ]}
              />
              <p>Current: <strong>{getLearningStyleDisplayName()}</strong></p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3>Phase</h3>
              <Select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                options={[
                  { value: 'pre', label: 'Pre-Assessment' },
                  { value: 'assessing', label: 'Assessing' },
                  { value: 'learning', label: 'Learning' },
                  { value: 'quizzing', label: 'Quizzing' },
                  { value: 'feedback', label: 'Feedback' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
              <p>Current: <strong>{getPhaseDisplayName()}</strong></p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3>Topic & Title</h3>
              <Input
                label="Topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter topic"
              />
              <Input
                label="Chat Title"
                value={chatTitle}
                onChange={(e) => setChatTitle(e.target.value)}
                placeholder="Enter chat title"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3>Progress & Points</h3>
              <Progress
                value={progressPercent}
                label="Progress"
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button onClick={() => setProgress(Math.max(0, progressPercent - 10))}>
                  -10%
                </Button>
                <Button onClick={() => setProgress(Math.min(100, progressPercent + 10))}>
                  +10%
                </Button>
              </div>
              <p>Points: <strong>{points}</strong></p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button onClick={() => setPoints(Math.max(0, points - 10))}>
                  -10
                </Button>
                <Button onClick={() => setPoints(points + 10)}>
                  +10
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3>Gems & Trophy</h3>
              <p>Gems: <strong>{gems}</strong></p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <Button onClick={() => setGems(Math.max(0, gems - 5))}>
                  -5
                </Button>
                <Button onClick={() => setGems(gems + 5)}>
                  +5
                </Button>
              </div>
              <p>Trophy: <strong>{hasTrophy ? '🏆 Yes' : '❌ No'}</strong></p>
              <Button onClick={() => setHasTrophy(!hasTrophy)}>
                Toggle Trophy
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3>System State</h3>
              <p>Session ID: <strong>{sessionId || 'None'}</strong></p>
              <p>View Only: <strong>{isViewOnly ? 'Yes' : 'No'}</strong></p>
              <Button onClick={() => setViewOnly(!isViewOnly)}>
                Toggle View Only
              </Button>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Button onClick={reset} variant="secondary">
                  Reset All State
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div style={sectionStyles}>
        <h2>Current State Summary</h2>
        <Card>
          <CardContent>
            <pre style={{ 
              backgroundColor: 'var(--color-panel)', 
              padding: 'var(--space-3)', 
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
              fontSize: '12px',
            }}>
              {JSON.stringify({
                sessionId,
                learningStyle,
                phase,
                topic,
                chatTitle,
                progressPercent,
                points,
                gems,
                hasTrophy,
                isViewOnly,
                nextAction,
              }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StateTest;

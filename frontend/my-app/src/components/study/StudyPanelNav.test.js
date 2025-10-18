import React from 'react';
import { render, screen } from '@testing-library/react';
import StudyPanelNav from './StudyPanelNav';

// Mock the session store
jest.mock('../../state/sessionStore', () => ({
  __esModule: true,
  default: () => ({
    topic: 'Python Basics',
    points: 25,
    plan: [
      {
        id: 'module-1',
        title: 'Setup',
        status: 'complete',
        milestones: [
          { text: 'Install python', completed: true },
          { text: 'Basic syntax', completed: true },
          { text: 'Control structure', completed: false }
        ]
      },
      {
        id: 'module-2',
        title: 'Data Structures',
        status: 'locked',
        milestones: [
          { text: 'Lists', completed: false },
          { text: 'Dictionaries', completed: false }
        ]
      }
    ],
    progressPercent: 25,
    currentModuleId: 'module-1'
  })
}));

describe('StudyPanelNav', () => {
  test('calculates gems correctly (Math.floor(points/20))', () => {
    render(<StudyPanelNav />);
    
    // With 25 points, gems should be Math.floor(25/20) = 1
    const gemsElement = screen.getByText('1');
    expect(gemsElement).toBeInTheDocument();
  });

  test('maps module status icons correctly', () => {
    render(<StudyPanelNav />);
    
    // Complete module should not show lock icon
    const completeModule = screen.getByText('Setup');
    expect(completeModule).toBeInTheDocument();
    
    // Locked module should show lock icon (alt text)
    const lockIcon = screen.getByAltText('locked');
    expect(lockIcon).toBeInTheDocument();
  });

  test('has sticky header behavior (class presence)', () => {
    render(<StudyPanelNav />);
    
    // Check that panel-top has sticky positioning
    const panelTop = document.querySelector('.panel-top');
    expect(panelTop).toHaveStyle('position: sticky');
  });

  test('shows topic and points correctly', () => {
    render(<StudyPanelNav />);
    
    expect(screen.getByText('Topic: Python Basics')).toBeInTheDocument();
    expect(screen.getByText('25/100 point')).toBeInTheDocument();
  });

  test('displays progress percentage', () => {
    render(<StudyPanelNav />);
    
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});


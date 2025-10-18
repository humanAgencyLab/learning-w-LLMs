import React from 'react';
import { render, screen } from '@testing-library/react';
import LeftNav from './LeftNav';

// Mock the session store
const mockUseSessionStore = jest.fn();

jest.mock('../../state/sessionStore', () => ({
  __esModule: true,
  default: mockUseSessionStore
}));

// Mock the StudyPanelNav component
jest.mock('../study/StudyPanelNav', () => {
  return function MockStudyPanelNav() {
    return <div data-testid="study-panel-nav">Study Panel Nav</div>;
  };
});

describe('LeftNav', () => {
  beforeEach(() => {
    mockUseSessionStore.mockClear();
  });

  test('conditionally renders StudyPanelNav by phase - shows when not in pre/assessing', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      points: 25,
      gems: 1
    });

    render(<LeftNav />);
    
    expect(screen.getByTestId('study-panel-nav')).toBeInTheDocument();
  });

  test('conditionally renders StudyPanelNav by phase - hides when in pre phase', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'pre',
      topic: '',
      points: 0,
      gems: 0
    });

    render(<LeftNav />);
    
    expect(screen.queryByTestId('study-panel-nav')).not.toBeInTheDocument();
  });

  test('conditionally renders StudyPanelNav by phase - hides when in assessing phase', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'assessing',
      topic: '',
      points: 0,
      gems: 0
    });

    render(<LeftNav />);
    
    expect(screen.queryByTestId('study-panel-nav')).not.toBeInTheDocument();
  });

  test('renders navigation links', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'pre',
      topic: '',
      points: 0,
      gems: 0
    });

    render(<LeftNav />);
    
    expect(screen.getByText('Chat History')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Favourites')).toBeInTheDocument();
    expect(screen.getByText('Quiz')).toBeInTheDocument();
  });

  test('renders profile chip with correct props', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      points: 25,
      gems: 1
    });

    render(<LeftNav />);
    
    // ProfileChip should receive gems from session store
    expect(screen.getByText('Demo User')).toBeInTheDocument();
  });
});


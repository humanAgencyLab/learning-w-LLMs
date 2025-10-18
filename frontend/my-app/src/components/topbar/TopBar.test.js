import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TopBar from './TopBar';

// Mock the session store
const mockUseSessionStore = jest.fn();

jest.mock('../../state/sessionStore', () => ({
  __esModule: true,
  default: mockUseSessionStore
}));

describe('TopBar', () => {
  const mockOnStartNewChat = jest.fn();

  beforeEach(() => {
    mockUseSessionStore.mockClear();
    mockOnStartNewChat.mockClear();
  });

  test('shows title presence by phase - displays title when not in pre/assessing', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      sessionId: 'test-session'
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    expect(screen.getByText(/You are Studying Python Basics/)).toBeInTheDocument();
  });

  test('shows title presence by phase - hides title when in pre phase', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'pre',
      topic: '',
      sessionId: null
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    expect(screen.queryByText(/You are Studying/)).not.toBeInTheDocument();
  });

  test('shows title presence by phase - hides title when in assessing phase', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'assessing',
      topic: '',
      sessionId: 'test-session'
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    expect(screen.queryByText(/You are Studying/)).not.toBeInTheDocument();
  });

  test('Start Chat confirm firing - calls onStartNewChat when no active session', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'pre',
      topic: '',
      sessionId: null
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    const startChatButton = screen.getByText('Start Chat');
    fireEvent.click(startChatButton);
    
    expect(mockOnStartNewChat).toHaveBeenCalledTimes(1);
  });

  test('Start Chat confirm firing - shows confirmation dialog when active session exists', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      sessionId: 'test-session'
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    const startChatButton = screen.getByText('Start Chat');
    fireEvent.click(startChatButton);
    
    // Should show confirmation dialog
    expect(screen.getByText('Start new chat?')).toBeInTheDocument();
    expect(screen.getByText('Current session will be saved.')).toBeInTheDocument();
  });

  test('Start Chat confirm firing - calls onStartNewChat when confirmed', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      sessionId: 'test-session'
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    const startChatButton = screen.getByText('Start Chat');
    fireEvent.click(startChatButton);
    
    // Click confirm button
    const confirmButton = screen.getByText('Start New Chat');
    fireEvent.click(confirmButton);
    
    expect(mockOnStartNewChat).toHaveBeenCalledTimes(1);
  });

  test('Start Chat confirm firing - does not call onStartNewChat when cancelled', () => {
    mockUseSessionStore.mockReturnValue({
      phase: 'learning',
      topic: 'Python Basics',
      sessionId: 'test-session'
    });

    render(<TopBar onStartNewChat={mockOnStartNewChat} />);
    
    const startChatButton = screen.getByText('Start Chat');
    fireEvent.click(startChatButton);
    
    // Click cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(mockOnStartNewChat).not.toHaveBeenCalled();
  });
});


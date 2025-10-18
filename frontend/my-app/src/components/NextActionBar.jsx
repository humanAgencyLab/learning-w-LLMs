import React from 'react';
import { Button } from './ui';
import useSessionStore from '../state/sessionStore';
import './NextActionBar.css';

function NextActionBar() {
  const { nextAction, isViewOnly } = useSessionStore();

  const getActionText = (action) => {
    const actionTexts = {
      'ask': 'Ask a Question',
      'confirm_plan': 'Confirm Learning Plan',
      'teach': 'Continue Learning',
      'teach_continued': 'Continue Reading',
      'mini_exercise': 'Try Exercise',
      'start_quiz': 'Start Quiz',
      'submit_quiz': 'Submit Quiz',
      'review': 'Review Material',
      'next_module': 'Next Module',
      'complete': 'Complete Session'
    };
    return actionTexts[action] || 'Next Step';
  };

  const handleAction = () => {
    // This will be handled by the parent component
    console.log('Next action clicked:', nextAction);
  };

  if (!nextAction || isViewOnly) {
    return null;
  }

  return (
    <div className="next-action-bar">
      <div className="next-action-content">
        <div className="next-action-text">
          <span className="action-label">Ready for the next step?</span>
          <span className="action-description">{getActionText(nextAction)}</span>
        </div>
        <Button 
          variant="primary" 
          onClick={handleAction}
          className="next-action-btn"
        >
          {getActionText(nextAction)}
        </Button>
      </div>
    </div>
  );
}

export default NextActionBar;

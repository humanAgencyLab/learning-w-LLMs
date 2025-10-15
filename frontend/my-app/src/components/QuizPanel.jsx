import React, { useState } from 'react';
import './QuizPanel.css';

const QuizPanel = ({ 
  isOpen, 
  onClose, 
  quizData, 
  onSubmit 
}) => {
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);

  if (!isOpen || !quizData) return null;

  const handleAnswerChange = (questionIndex, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: answer
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const answersArray = quizData.questions.map((_, index) => answers[index] || '');
      const result = await onSubmit(answersArray);
      setResults(result);
      setShowResults(true);
    } catch (error) {
      console.error('Quiz submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAnswers({});
    setShowResults(false);
    setResults(null);
    onClose();
  };

  const handleRetry = () => {
    setAnswers({});
    setShowResults(false);
    setResults(null);
  };

  return (
    <div className="quiz-panel-overlay">
      <div className="quiz-panel">
        <div className="quiz-panel-header">
          <h3>Stage {quizData.stage} Quiz</h3>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="quiz-panel-content">
          {!showResults ? (
            <>
              <div className="quiz-instructions">
                <p>Answer the following questions to test your understanding. You need 80% or higher to pass.</p>
              </div>

              <div className="quiz-questions">
                {quizData.questions.map((question, index) => (
                  <div key={index} className="question-card">
                    <div className="question-header">
                      <span className="question-number">Q{index + 1}</span>
                      <span className="question-type">
                        {question.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
                      </span>
                    </div>
                    
                    <div className="question-text">
                      {question.question}
                    </div>

                    {question.type === 'mcq' ? (
                      <div className="mcq-options">
                        {question.options.map((option, optionIndex) => (
                          <label key={optionIndex} className="mcq-option">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option}
                              checked={answers[index] === option}
                              onChange={(e) => handleAnswerChange(index, e.target.value)}
                            />
                            <span className="option-text">{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="short-answer-input">
                        <textarea
                          value={answers[index] || ''}
                          onChange={(e) => handleAnswerChange(index, e.target.value)}
                          placeholder="Enter your answer here..."
                          rows={3}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="quiz-actions">
                <button 
                  className="submit-btn"
                  onClick={handleSubmit}
                  disabled={isSubmitting || Object.keys(answers).length < quizData.questions.length}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                </button>
              </div>
            </>
          ) : (
            <div className="quiz-results">
              <div className={`results-header ${results.passed ? 'passed' : 'failed'}`}>
                <div className="results-icon">
                  {results.passed ? '🎉' : '❌'}
                </div>
                <div className="results-title">
                  {results.passed ? 'Quiz Passed!' : 'Quiz Failed'}
                </div>
                <div className="results-score">
                  Score: {results.scorePct}%
                </div>
              </div>

              <div className="results-feedback">
                <h4>Feedback:</h4>
                <ul>
                  {results.feedback.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="results-actions">
                {results.passed ? (
                  <button className="promote-btn" onClick={handleClose}>
                    Continue to Next Stage
                  </button>
                ) : (
                  <button className="retry-btn" onClick={handleRetry}>
                    Try Again
                  </button>
                )}
                <button className="close-results-btn" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPanel;





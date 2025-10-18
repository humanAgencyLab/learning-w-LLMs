import React, { useState } from 'react';
import './QuizModal.css';

function QuizModal({ isOpen, onClose, quizData, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !quizData) return null;

  const handleAnswerChange = (questionIndex, selectedAnswer) => {
    setAnswers((prev) => ({
      ...prev,
      [questionIndex]: selectedAnswer,
    }));
  };

  const handleSubmit = async () => {
    const answersArray = Object.entries(answers).map(
      ([questionIndex, selectedAnswer]) => ({
        questionIndex: parseInt(questionIndex),
        selectedAnswer: selectedAnswer,
      }),
    );

    setIsSubmitting(true);
    try {
      await onSubmit(answersArray);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = Object.keys(answers).length === quizData.questions.length;

  return (
    <div className="quiz-modal-overlay">
      <div className="quiz-modal">
        <div className="quiz-header">
          <h2>Module Quiz</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="quiz-content">
          <div className="quiz-progress">
            {Object.keys(answers).length} / {quizData.questions.length}{' '}
            questions answered
          </div>

          {quizData.questions.map((question, index) => (
            <div key={index} className="question-card">
              <div className="question-text">
                {index + 1}. {question.question}
              </div>

              <div className="options">
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="option-label">
                    <input
                      type="radio"
                      name={`question-${index}`}
                      value={optionIndex}
                      checked={answers[index] === optionIndex}
                      onChange={() => handleAnswerChange(index, optionIndex)}
                    />
                    <span className="option-text">
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="quiz-footer">
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!isComplete || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuizModal;

import React, { useEffect, useMemo, useState } from 'react';
import useSessionStore from '../../state/sessionStore';

// QuizOverlay v2.0 - Fixed UI overflow, explanations, and buttons
const QuizOverlay = () => {
  const quizDraft = useSessionStore((state) => state.quizDraft);
  const quizResult = useSessionStore((state) => state.quizResult);
  const plan = useSessionStore((state) => state.plan);
  const activeModuleId = useSessionStore((state) => state.activeModuleId);
  const submitQuiz = useSessionStore((state) => state.submitQuiz);
  const isQuizSubmitting = useSessionStore((state) => state.isQuizSubmitting);
  const clearQuizState = useSessionStore((state) => state.clearQuizState);
  const startQuizFromChat = useSessionStore((state) => state.startQuizFromChat);
  const sendChatMessage = useSessionStore((state) => state.sendChatMessage);
  const resumeSessionFromServer = useSessionStore((state) => state.resumeSessionFromServer);
  const sessionId = useSessionStore((state) => state.sessionId);
  
  // Debug: Log component version on mount
  useEffect(() => {
    console.log('✅ QuizOverlay v2.0 loaded - Fixed UI overflow, explanations, buttons');
  }, []);

  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  const questions = quizDraft || [];
  const isResultView = Boolean(quizResult);
  const isOpen = (questions && questions.length > 0) || isResultView;

  const moduleTitle = useMemo(() => {
    if (!activeModuleId) return 'Module Quiz';
    const module = plan?.find((m) => m.id === activeModuleId);
    return module?.title || 'Module Quiz';
  }, [plan, activeModuleId]);

  // Find next module for "Move to next module" button
  const nextModule = useMemo(() => {
    if (!plan || !activeModuleId) return null;
    const currentIndex = plan.findIndex((m) => m.id === activeModuleId);
    return plan[currentIndex + 1] || null;
  }, [plan, activeModuleId]);

  const answeredCount = useMemo(() => {
    if (!questions.length) return 0;
    return questions.reduce((count, question) => {
      return answers[question.id] !== undefined ? count + 1 : count;
    }, 0);
  }, [questions, answers]);

  if (!isOpen) {
    return null;
  }

  const allAnswered =
    questions.length > 0 &&
    answeredCount === questions.length &&
    Object.values(answers).every((value) => typeof value === 'number');

  const handleSelectOption = (questionId, optionIndex) => {
    if (isQuizSubmitting || isResultView) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  const handleSubmit = async () => {
    if (!questions.length) {
      return;
    }

    if (!allAnswered) {
      setError('Please answer every question before submitting.');
      return;
    }

    setError(null);

    try {
      await submitQuiz(
        questions.map((question) => ({
          id: question.id,
          userIndex: answers[question.id]
        }))
      );
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to submit quiz right now.');
    }
  };

  // Handle close for fail - reset to first milestone and show message
  const handleCloseFail = () => {
    // Show warning first
    setShowCloseWarning(true);
  };

  const confirmCloseFail = async () => {
    setShowCloseWarning(false);
    clearQuizState();
    setAnswers({});
    setError(null);
    
    // Show reset message in chat - backend will handle the reset
    try {
      await sendChatMessage('_reset_module_session_');
    } catch (error) {
      console.error('Failed to reset to first milestone:', error);
    }
  };

  const cancelCloseFail = () => {
    setShowCloseWarning(false);
  };

  // Handle close for pass - just close overlay
  const handleClosePass = () => {
    clearQuizState();
    setAnswers({});
    setError(null);
  };

  // Handle retake quiz
  const handleRetakeQuiz = async () => {
    clearQuizState();
    setAnswers({});
    setError(null);
    
    try {
      // Just start the quiz - milestones stay checked
      await startQuizFromChat(activeModuleId);
    } catch (error) {
      console.error('Failed to retake quiz:', error);
      setError('Failed to start quiz. Please try again.');
    }
  };

  // Handle move to next module
  const handleMoveToNextModule = async () => {
    clearQuizState();
    setAnswers({});
    setError(null);
    
    if (nextModule) {
      try {
        // Refresh session state first to ensure we have the latest activeModuleId
        if (sessionId) {
          await resumeSessionFromServer(sessionId);
        }
        // Send "start" message to trigger first milestone of next module
        await sendChatMessage('start');
      } catch (error) {
        console.error('Failed to move to next module:', error);
        setError('Failed to move to next module. Please try again.');
      }
    }
  };

  // Parse feedback markdown into structured data
  const parseFeedback = (feedbackMarkdown) => {
    if (!feedbackMarkdown) return [];
    
    const feedbackItems = [];
    const lines = feedbackMarkdown.split('\n');
    let currentItem = null;
    let isCollectingExplanation = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines when not collecting explanation
      if (!trimmed && !isCollectingExplanation) {
        continue;
      }
      
      // Start of new incorrect question
      if (trimmed.startsWith('**Incorrect:**')) {
        // Save previous item if exists
        if (currentItem) {
          feedbackItems.push(currentItem);
        }
        currentItem = {
          question: trimmed.replace('**Incorrect:**', '').trim(),
          correctAnswer: '',
          userAnswer: '',
          explanation: ''
        };
        isCollectingExplanation = false;
      } 
      // Correct answer
      else if (trimmed.startsWith('- **Correct answer:**') && currentItem) {
        currentItem.correctAnswer = trimmed.replace('- **Correct answer:**', '').trim();
        isCollectingExplanation = false;
      } 
      // User answer
      else if (trimmed.startsWith('- **Your answer:**') && currentItem) {
        currentItem.userAnswer = trimmed.replace('- **Your answer:**', '').trim();
        isCollectingExplanation = false;
      } 
      // Explanation starts
      else if (trimmed.startsWith('- **Explanation:**') && currentItem) {
        const explanationText = trimmed.replace('- **Explanation:**', '').trim();
        currentItem.explanation = explanationText;
        isCollectingExplanation = true;
      } 
      // Continue collecting explanation
      else if (currentItem && isCollectingExplanation) {
        // Stop if we hit a new question or score summary
        if (trimmed.startsWith('**Incorrect:**') || 
            trimmed.startsWith('**Score:') || 
            trimmed.startsWith('**You passed')) {
          isCollectingExplanation = false;
          // Don't break, let the next iteration handle the new section
          continue;
        }
        
        // Continue adding to explanation
        if (trimmed) {
          // Remove leading dashes or bullets if present
          const cleanLine = trimmed.replace(/^[-•]\s*/, '').trim();
          if (cleanLine) {
            currentItem.explanation += (currentItem.explanation ? ' ' : '') + cleanLine;
          }
        }
      }
    }
    
    // Don't forget the last item
    if (currentItem) {
      feedbackItems.push(currentItem);
    }
    
    return feedbackItems;
  };

  const renderResultView = () => {
    if (!quizResult) return null;

    const { passed, scorePct, feedbackMarkdown } = quizResult;
    const feedbackItems = parseFeedback(feedbackMarkdown);
    const hasFeedback = feedbackItems.length > 0;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Fixed header - status banner */}
        <div
          className={`rounded-2xl border p-5 flex-shrink-0 ${
            passed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          <div className="text-sm uppercase tracking-wide font-semibold">
            {passed ? 'Quiz Passed' : 'Quiz Incomplete'}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold">{scorePct}%</span>
            <span className="text-sm text-current opacity-80">
              Minimum required score: 60%
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-current">
            {passed
              ? "Great work! You're ready to move on to the next module."
              : "Let's review the areas that need more attention, then you can retake this quiz."}
          </p>
        </div>

        {/* Scrollable middle section - feedback */}
        {hasFeedback && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex-1 min-h-0 flex flex-col overflow-hidden my-4">
            <div className="text-sm font-semibold text-slate-800 mb-3 flex-shrink-0">
              Detailed Feedback
            </div>
            <div className="space-y-4 text-sm text-slate-700 leading-6 overflow-y-auto pr-2 flex-1">
              {feedbackItems.map((item, index) => (
                <div key={index} className="border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
                  <div className="font-semibold text-red-700 mb-2">
                    Incorrect: {item.question}
                  </div>
                  <div className="space-y-2 ml-2">
                    <div>
                      <span className="font-medium text-slate-800">Correct answer: </span>
                      <span className="text-green-700">{item.correctAnswer}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-800">Your answer: </span>
                      <span className="text-red-700">{item.userAnswer}</span>
                    </div>
                    {item.explanation && item.explanation.trim() && (
                      <div className="mt-2 pt-2 border-t border-slate-300">
                        <div className="font-medium text-slate-800 mb-1">Explanation:</div>
                        <div className="text-slate-600 leading-relaxed">{item.explanation}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fixed footer - action buttons */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end flex-shrink-0 pt-2">
          {!passed && (
            <>
              <button
                type="button"
                onClick={handleRetakeQuiz}
                className="inline-flex items-center justify-center rounded-xl border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50"
              >
                Retake Quiz
              </button>
              <button
                type="button"
                onClick={handleCloseFail}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                title="If you close the quiz window, your current module progress will be reset. You have to do a fresh start."
              >
                Close
              </button>
            </>
          )}
          {passed && (
            <button
              type="button"
              onClick={handleMoveToNextModule}
              disabled={!nextModule}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                nextModule
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              {nextModule ? 'Move to Next Module' : 'All Modules Complete'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderQuestionnaire = () => {
    if (!questions.length) return null;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Fixed header - instructions */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 flex-shrink-0 mb-4">
          <div className="flex flex-col gap-1 text-sm text-slate-600">
            <span>
              Complete every question below to unlock the next module. You need
              at least 60% to pass.
            </span>
            <span className="font-medium text-slate-800">
              {answeredCount}/{questions.length} questions answered
            </span>
          </div>
        </div>

        {/* Scrollable middle section - questions */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-2 flex-1 min-h-0 mb-4">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex-shrink-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Question {index + 1}
                  </div>
                  <div className="mt-2 text-base font-semibold text-slate-900">
                    {question.text}
                  </div>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                  Multiple Choice
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {question.options.map((option, optionIndex) => {
                  const isSelected = answers[question.id] === optionIndex;
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      onClick={() => handleSelectOption(question.id, optionIndex)}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                          isSelected
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-300 text-slate-500'
                        }`}
                      >
                        {String.fromCharCode(65 + optionIndex)}
                      </span>
                      <span className="leading-6 text-slate-800">{option}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Fixed footer - error and submit button */}
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex-shrink-0 mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || isQuizSubmitting}
            className={`inline-flex items-center justify-center rounded-xl px-5 py-2 text-sm font-semibold shadow-sm transition ${
              !allAnswered || isQuizSubmitting
                ? 'bg-slate-200 text-slate-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isQuizSubmitting ? 'Submitting…' : 'Submit Quiz'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Warning Dialog */}
      {showCloseWarning && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/60 px-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">Reset Module Progress?</h3>
              <p className="mt-2 text-sm text-slate-600">
                If you close the quiz window, your current module progress will be reset. You have to do a fresh start.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelCloseFail}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCloseFail}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Reset & Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto">
      <div className="relative flex w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl my-auto h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Fixed header - title */}
        <div className="flex items-start justify-between gap-4 flex-shrink-0 p-6 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Module Quiz
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {moduleTitle}
            </h2>
            {!isResultView && (
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                This quiz locks in what you just learned. Answer every question
                carefully—if your score is below 60%, we'll revisit the tricky
                milestones together before retrying.
              </p>
            )}
          </div>
          {isResultView && (
            <button
              type="button"
              onClick={quizResult?.passed ? handleClosePass : handleCloseFail}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 flex-shrink-0"
              title={quizResult?.passed ? 'Close' : 'If you close the quiz window, your current module progress will be reset. You have to do a fresh start.'}
            >
              <span className="sr-only">Close</span>
              ×
            </button>
          )}
        </div>

        {/* Scrollable middle section - content */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 pt-4">
          {isResultView ? renderResultView() : renderQuestionnaire()}
        </div>
      </div>
    </div>
    </>
  );
};

export default QuizOverlay;

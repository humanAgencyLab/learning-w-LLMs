import React, { useEffect, useMemo, useState } from 'react';
import Confetti from 'react-confetti';
import useSessionStore from '../../state/sessionStore';
import * as certificateApi from '../../lib/profileApi';

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
  const startRevisionQuiz = useSessionStore((state) => state.startRevisionQuiz);
  const sendChatMessage = useSessionStore((state) => state.sendChatMessage);
  const resumeSessionFromServer = useSessionStore((state) => state.resumeSessionFromServer);
  const sessionId = useSessionStore((state) => state.sessionId);
  const topic = useSessionStore((state) => state.topic);
  
  // Debug: Log component version on mount
  useEffect(() => {
    console.log('✅ QuizOverlay v2.0 loaded - Fixed UI overflow, explanations, buttons');
  }, []);

  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const [certificateGenerated, setCertificateGenerated] = useState(false);

  const questions = quizDraft || [];
  const isResultView = Boolean(quizResult);
  const isOpen = (questions && questions.length > 0) || isResultView;

  const isRevision = useSessionStore((state) => state.meta?.isRevision);
  const revisionTopic = useSessionStore((state) => state.meta?.revisionTopic || state.topic);
  
  const moduleTitle = useMemo(() => {
    if (isRevision) {
      return revisionTopic ? `Revision: ${revisionTopic}` : 'Revision Quiz';
    }
    if (!activeModuleId) return 'Module Quiz';
    const module = plan?.find((m) => m.id === activeModuleId);
    return module?.title || 'Module Quiz';
  }, [plan, activeModuleId, isRevision, revisionTopic]);

  // Check if this is the last module (all modules completed)
  const isLastModule = useMemo(() => {
    if (!plan || plan.length === 0) return false;
    if (!quizResult?.passed) return false;
    
    // Check if all modules are passed
    const allModulesPassed = plan.every(m => m.status === 'passed');
    return allModulesPassed;
  }, [plan, quizResult]);

  // Show confetti when last module is completed
  useEffect(() => {
    if (isLastModule && quizResult?.passed) {
      setShowConfetti(true);
      // Hide confetti after 5 seconds
      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isLastModule, quizResult]);

  // Find next module for "Move to next module" button
  // After passing a quiz, the backend advances activeModuleId to the next module,
  // so if we're in feedback phase with a passed quiz, the nextModule is the current activeModuleId
  const nextModule = useMemo(() => {
    if (!plan || plan.length === 0) return null;
    
    // If quiz passed, the backend has already advanced activeModuleId to the next module
    // So the next module to move to is the current activeModuleId
    if (quizResult?.passed) {
      if (activeModuleId) {
        // Backend advanced to next module - that's the one we want
        const nextModuleObj = plan.find((m) => m.id === activeModuleId);
        if (nextModuleObj) {
          console.log('Next module found (after quiz pass):', {
            nextModuleId: nextModuleObj.id,
            nextModuleTitle: nextModuleObj.title,
            activeModuleId,
            planModules: plan.map(m => ({ id: m.id, title: m.title, status: m.status }))
          });
          return nextModuleObj;
        }
      }
      // Fallback: find the last passed module and get the one after it
      const lastPassedIndex = plan.map((m, i) => ({ module: m, index: i }))
        .filter(({ module }) => module.status === 'passed')
        .map(({ index }) => index)
        .sort((a, b) => b - a)[0]; // Get highest index
      
      if (lastPassedIndex !== undefined && lastPassedIndex < plan.length - 1) {
        const fallbackNext = plan[lastPassedIndex + 1];
        console.log('Next module found (fallback method):', {
          nextModuleId: fallbackNext.id,
          nextModuleTitle: fallbackNext.title,
          lastPassedIndex
        });
        return fallbackNext;
      }
      console.log('No next module - all modules completed');
      return null; // All modules completed
    }
    
    // For non-passed quizzes or during quiz, find next module after current activeModuleId
    if (!activeModuleId) return null;
    const currentIndex = plan.findIndex((m) => m.id === activeModuleId);
    if (currentIndex === -1) return null;
    return plan[currentIndex + 1] || null;
  }, [plan, activeModuleId, quizResult]);

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
    if (isRevision) {
      // For revision quizzes, directly close without warning
      clearQuizState();
      setAnswers({});
      setError(null);
    } else {
      // For study quizzes, show warning first
      setShowCloseWarning(true);
    }
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
      if (isRevision) {
        // For revision quizzes, restart the revision quiz
        await startRevisionQuiz(revisionTopic);
      } else {
        // For study quizzes, just start the quiz - milestones stay checked
        await startQuizFromChat(activeModuleId);
      }
    } catch (error) {
      console.error('Failed to retake quiz:', error);
      setError('Failed to start quiz. Please try again.');
    }
  };

  // Handle redo revision quiz
  const handleRedoRevision = async () => {
    clearQuizState();
    setAnswers({});
    setError(null);
    
    try {
      await startRevisionQuiz(revisionTopic);
    } catch (error) {
      console.error('Failed to restart revision quiz:', error);
      setError('Failed to restart revision quiz. Please try again.');
    }
  };

  // Handle move to next module
  const handleMoveToNextModule = async () => {
    clearQuizState();
    setAnswers({});
    setError(null);
    
    if (nextModule) {
      try {
        console.log('Moving to next module', { 
          nextModuleId: nextModule.id, 
          nextModuleTitle: nextModule.title,
          currentActiveModuleId: activeModuleId 
        });
        
        // Refresh session state first to ensure we have the latest activeModuleId
        if (sessionId) {
          const refreshed = await resumeSessionFromServer(sessionId);
          console.log('Session refreshed before moving to next module', {
            refreshedActiveModuleId: refreshed?.activeModuleId,
            nextModuleId: nextModule.id
          });
        }
        
        // Send "start" message to trigger first milestone of next module
        await sendChatMessage('start');
        console.log('Sent start message for next module');
      } catch (error) {
        console.error('Failed to move to next module:', error);
        setError('Failed to move to next module. Please try again.');
      }
    } else {
      console.warn('No next module available', { plan, activeModuleId, quizResult });
      setError('No next module available. All modules may be completed.');
    }
  };

  // Handle certificate generation
  const handleGenerateCertificate = async () => {
    if (!sessionId || !topic) {
      setError('Missing session information for certificate generation.');
      return;
    }

    setIsGeneratingCertificate(true);
    setError(null);
    setCertificateGenerated(false);

    try {
      const result = await certificateApi.generateCertificate(sessionId, topic);
      
      // Download the certificate automatically
      if (result.certificateId) {
        const blob = await certificateApi.downloadCertificate(result.certificateId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Certificate_${topic.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setCertificateGenerated(true);
      }
    } catch (error) {
      console.error('Failed to generate certificate:', error);
      setError(error.message || 'Failed to generate certificate. Please try again.');
    } finally {
      setIsGeneratingCertificate(false);
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
          className={`rounded-2xl border p-6 flex-shrink-0 ${
            passed
              ? isLastModule
                ? 'border-purple-300 bg-gradient-to-br from-purple-100 via-pink-50 to-purple-100 text-purple-900 shadow-lg'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {isLastModule && passed ? (
            <>
              <div className="text-lg uppercase tracking-wide font-bold mb-3 flex items-center justify-center gap-2">
                <span className="text-3xl">🎉</span>
                <span>{isRevision ? 'Revision Completed!' : 'Course Completed!'}</span>
                <span className="text-3xl">🎉</span>
              </div>
              <div className="mt-3 flex items-baseline justify-center gap-3">
                <span className="text-5xl font-bold">{scorePct}%</span>
                <span className="text-base text-current opacity-80">
                  Final Score
                </span>
              </div>
              <p className="mt-4 text-lg leading-7 text-current font-semibold text-center">
                {isRevision ? (
                  <>🎓 Great work! You've successfully completed the revision quiz for <span className="font-bold text-purple-700">"{topic}"</span>.</>
                ) : (
                  <>🎓 Congratulations! You've successfully completed all modules for <span className="font-bold text-purple-700">"{topic}"</span>.</>
                )}
              </p>
              {!isRevision && (
                <>
                  {certificateGenerated ? (
                    <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg text-center">
                      <p className="text-green-800 font-semibold">
                        ✅ Certificate generated and downloaded! You can also access it from your Profile.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-base leading-6 text-current text-center">
                      Generate your certificate to celebrate this achievement!
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
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
                  ? isRevision
                    ? "Great work! You've successfully completed the revision quiz."
                    : "Great work! You're ready to move on to the next module."
                  : "Let's review the areas that need more attention, then you can retake this quiz."}
              </p>
            </>
          )}
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
                title={
                  isRevision
                    ? 'Close revision quiz. To revise this topic again, say "restart revision" in the chat.'
                    : 'If you close the quiz window, your current module progress will be reset. You have to do a fresh start.'
                }
              >
                Close
              </button>
            </>
          )}
          {passed && !isLastModule && !isRevision && (
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
          {passed && isRevision && (
            <button
              type="button"
              onClick={handleRedoRevision}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Redo Revision
            </button>
          )}
          {passed && isLastModule && !isRevision && (
            <>
              {certificateGenerated ? (
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleGenerateCertificate}
                    disabled={isGeneratingCertificate}
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingCertificate ? 'Generating...' : '📥 Download Again'}
                  </button>
                  <a
                    href="/profile"
                    className="inline-flex items-center justify-center rounded-xl border border-purple-600 bg-white px-6 py-3 text-sm font-semibold text-purple-600 shadow-sm transition hover:bg-purple-50 text-center"
                  >
                    View All Certificates
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateCertificate}
                  disabled={isGeneratingCertificate}
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingCertificate ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </>
                  ) : (
                    '🎓 Generate Certificate'
                  )}
                </button>
              )}
            </>
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
              {isRevision
                ? "Complete every question below to test your knowledge. You need at least 60% to pass."
                : "Complete every question below to unlock the next module. You need at least 60% to pass."}
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
      {/* Confetti for course completion - Above quiz overlay */}
      {showConfetti && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1300, pointerEvents: 'none' }}>
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={300}
            gravity={0.2}
            colors={['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444']}
          />
        </div>
      )}
      
      {/* Warning Dialog - Only for study quizzes */}
      {showCloseWarning && !isRevision && (
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
              {isRevision ? 'Revision Quiz' : 'Module Quiz'}
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {moduleTitle}
            </h2>
            {!isResultView && (
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                {isRevision
                  ? "Complete every question below to test your knowledge. You need at least 60% to pass."
                  : "This quiz locks in what you just learned. Answer every question carefully—if your score is below 60%, we'll revisit the tricky milestones together before retrying."}
              </p>
            )}
          </div>
          {isResultView && (
            <button
              type="button"
              onClick={quizResult?.passed ? handleClosePass : handleCloseFail}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 flex-shrink-0"
              title={
                isRevision
                  ? quizResult?.passed
                    ? 'Close'
                    : 'Close revision quiz. To revise this topic again, say "restart revision" in the chat.'
                  : quizResult?.passed
                  ? 'Close'
                  : 'If you close the quiz window, your current module progress will be reset. You have to do a fresh start.'
              }
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

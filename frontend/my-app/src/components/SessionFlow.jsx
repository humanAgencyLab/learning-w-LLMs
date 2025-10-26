import React, { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { Button, Card, CardContent, Progress, Badge, Input } from './ui';

/**
 * Comprehensive session flow component demonstrating the new store integration
 * Shows assessment → learning → quizzing → feedback → completed flow
 */
const SessionFlow = () => {
  const {
    // State
    sessionId,
    phase,
    mode,
    topic,
    chatTitle,
    plan,
    activeModuleId,
    points,
    gems,
    progressPct,
    isViewOnly,
    messages,
    profile,
    loading,
    error,
    quizDraft,
    
    // Methods
    startNewSession,
    startAssessment,
    answerClarify,
    sendMessage,
    startQuiz,
    submitQuiz,
    clearError,
    
    // Computed values
    currentModule,
    nextModule,
    completedModules,
    progressPercentage,
    canRetryQuiz,
    canContinue,
    showProgress,
    showPlan,
    showQuiz,
    showFeedback,
    showCompletion,
    isDisabled,
    getPhaseDisplayName
  } = useSession();

  const [inputMessage, setInputMessage] = useState('');
  const [quizAnswers, setQuizAnswers] = useState({});
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  // Auto-create session on mount
  useEffect(() => {
    if (!sessionId) {
      startNewSession();
    }
  }, [sessionId, startNewSession]);

  const handleAssessment = async () => {
    const message = inputMessage.trim();
    if (!message) return;
    
    setInputMessage('');
    const response = await startAssessment(message, mode);
    
    // Check if we got clarification questions
    if (response?.clarify && response?.questions) {
      setClarifyQuestions(response.questions);
      setClarifyAnswers({});
    }
  };

  const handleAnswerClarify = async () => {
    const answers = Object.values(clarifyAnswers).join(' ');
    await answerClarify(answers);
    setClarifyQuestions([]);
    setClarifyAnswers({});
  };

  const handleChat = async () => {
    const message = inputMessage.trim();
    if (!message) return;
    
    setInputMessage('');
    await sendMessage(message);
  };

  const handleQuizStart = async () => {
    await startQuiz(activeModuleId);
  };

  const handleQuizSubmit = async () => {
    const answers = Object.entries(quizAnswers).map(([questionId, userIndex]) => ({
      id: questionId,
      userIndex: parseInt(userIndex)
    }));
    
    setQuizAnswers({});
    await submitQuiz(answers);
  };

  const handleRetryQuiz = async () => {
    await startQuiz(activeModuleId);
  };

  const handleContinue = async () => {
    await startQuiz(nextModule?.id);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-red-800 font-medium">Error</h3>
            <p className="text-red-600 mt-1">{error}</p>
            <Button onClick={clearError} className="mt-2">
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{chatTitle || 'Learning Session'}</h1>
              <p className="text-gray-600">
                {topic && `Topic: ${topic}`}
                {phase && ` • Phase: ${getPhaseDisplayName()}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{points}</div>
              <div className="text-sm text-gray-500">Points</div>
            </div>
          </div>
          
          {showProgress && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clarification Form */}
      {phase === 'assessing' && clarifyQuestions.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Please clarify your learning goals</h2>
            <div className="space-y-4">
              {clarifyQuestions.map((question, index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {question}
                  </label>
                  <Input
                    value={clarifyAnswers[index] || ''}
                    onChange={(e) =>
                      setClarifyAnswers(prev => ({
                        ...prev,
                        [index]: e.target.value
                      }))
                    }
                    placeholder="Your answer..."
                    className="w-full"
                  />
                </div>
              ))}
              <Button 
                onClick={handleAnswerClarify} 
                disabled={Object.keys(clarifyAnswers).length !== clarifyQuestions.length}
                className="w-full"
              >
                Continue to Learning Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Study Panel */}
      {showPlan && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Study Plan</h2>
            <div className="space-y-3">
              {plan.map((module, index) => (
                <div
                  key={module.id}
                  className={`p-3 rounded-lg border ${
                    module.id === activeModuleId
                      ? 'border-blue-500 bg-blue-50'
                      : module.status === 'passed'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{module.title}</h3>
                      <p className="text-sm text-gray-600">
                        {module.points} points • {module.difficulty || 'core'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={
                          module.status === 'passed'
                            ? 'success'
                            : module.status === 'in_progress'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {module.status}
                      </Badge>
                      {module.id === activeModuleId && (
                        <Badge variant="info">Current</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiz Interface */}
      {showQuiz && quizDraft && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Quiz: {currentModule?.title}</h2>
            <div className="space-y-4">
              {quizDraft.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3">
                    {index + 1}. {question.text}
                  </h3>
                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label
                        key={optionIndex}
                        className="flex items-center space-x-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={optionIndex}
                          checked={quizAnswers[question.id] === optionIndex.toString()}
                          onChange={(e) =>
                            setQuizAnswers(prev => ({
                              ...prev,
                              [question.id]: e.target.value
                            }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Button onClick={handleQuizSubmit} className="w-full">
                Submit Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Interface */}
      {showFeedback && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Quiz Results</h2>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">
                  {completedModules.length}/{plan.length} Modules Complete
                </div>
                <p className="text-gray-600">
                  {points} points earned • {gems} gems collected
                </p>
              </div>
              
              <div className="flex space-x-4 justify-center">
                {canRetryQuiz && (
                  <Button onClick={handleRetryQuiz} variant="outline">
                    Retry Module
                  </Button>
                )}
                {canContinue && (
                  <Button onClick={handleContinue}>
                    Next Module
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion State */}
      {showCompletion && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-green-600 mb-2">
                Congratulations!
              </h2>
              <p className="text-gray-600 mb-4">
                You've completed all modules and earned {points} points!
              </p>
              <div className="flex justify-center space-x-4">
                <Badge variant="success">{gems} Gems</Badge>
                <Badge variant="info">{completedModules.length} Modules</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Interface */}
      {!showQuiz && !showFeedback && !showCompletion && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">
              {phase === 'assessing' ? 'Assessment' : 'Chat'}
            </h2>
            
            {/* Messages */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-100 ml-8'
                      : 'bg-gray-100 mr-8'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-600 mb-1">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.tokens && (
                    <div className="text-xs text-gray-500 mt-1">
                      {message.tokens} tokens
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex space-x-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  phase === 'assessing'
                    ? 'Describe what you want to learn...'
                    : 'Ask a question or start a quiz...'
                }
                disabled={isDisabled}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    if (phase === 'assessing') {
                      handleAssessment();
                    } else {
                      handleChat();
                    }
                  }
                }}
              />
              <Button
                onClick={phase === 'assessing' ? handleAssessment : handleChat}
                disabled={isDisabled || !inputMessage.trim()}
              >
                {phase === 'assessing' ? 'Assess' : 'Send'}
              </Button>
            </div>

            {/* Quiz Button */}
            {phase === 'learning' && currentModule && (
              <div className="mt-4">
                <Button onClick={handleQuizStart} variant="outline" className="w-full">
                  Start Quiz: {currentModule.title}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardContent>
            <h3 className="font-semibold mb-2">Debug Info</h3>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify({
                sessionId,
                phase,
                mode,
                activeModuleId,
                points,
                gems,
                progressPct,
                isViewOnly,
                messagesCount: messages.length,
                planCount: plan.length,
                completedCount: completedModules.length
              }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SessionFlow;


import React, { useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { Button, Card, CardContent, Progress, Badge } from './ui';

/**
 * Example component showing how to integrate the new session store
 * into existing UI components without redesign
 */
const SessionIntegration = () => {
  const {
    // Core state
    sessionId,
    phase,
    topic,
    plan,
    activeModuleId,
    points,
    gems,
    progressPct,
    isViewOnly,
    messages,
    loading,
    error,
    
    // Methods
    startNewSession,
    startAssessment,
    sendMessage,
    startQuiz,
    submitQuiz,
    
    // Computed values
    currentModule,
    completedModules,
    progressPercentage,
    canChat,
    canStartQuiz,
    isCompleted,
    getPhaseDisplayName
  } = useSession();

  // Auto-initialize session
  useEffect(() => {
    if (!sessionId && !loading) {
      startNewSession();
    }
  }, [sessionId, loading, startNewSession]);

  // Example: Handle composer submit
  const handleComposerSubmit = async (message) => {
    if (phase === 'assessing') {
      await startAssessment(message);
    } else if (canChat) {
      await sendMessage(message);
    }
  };

  // Example: Handle quiz start
  const handleQuizStart = async () => {
    if (canStartQuiz) {
      await startQuiz(activeModuleId);
    }
  };

  // Example: Handle quiz submit
  const handleQuizSubmit = async (answers) => {
    await submitQuiz(answers);
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Badge variant={phase === 'completed' ? 'success' : 'info'}>
                {getPhaseDisplayName()}
              </Badge>
              {topic && <span className="text-sm text-gray-600">{topic}</span>}
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-lg font-bold text-blue-600">{points}</div>
                <div className="text-xs text-gray-500">points</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-yellow-600">{gems}</div>
                <div className="text-xs text-gray-500">gems</div>
              </div>
            </div>
          </div>
          
          {progressPct > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Study Panel Integration */}
      {plan.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="font-semibold mb-3">Study Plan</h3>
            <div className="space-y-2">
              {plan.map((module) => (
                <div
                  key={module.id}
                  className={`p-2 rounded border ${
                    module.id === activeModuleId
                      ? 'border-blue-500 bg-blue-50'
                      : module.status === 'passed'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{module.title}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{module.points}pts</span>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mini-check Display */}
      {messages.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="font-semibold mb-3">Recent Messages</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {messages.slice(-3).map((message, index) => (
                <div
                  key={index}
                  className={`p-2 rounded text-sm ${
                    message.role === 'user'
                      ? 'bg-blue-100'
                      : 'bg-gray-100'
                  }`}
                >
                  <div className="font-medium text-xs text-gray-600 mb-1">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {canStartQuiz && currentModule && (
          <Button onClick={handleQuizStart} variant="outline">
            Quiz: {currentModule.title}
          </Button>
        )}
        
        {isCompleted && (
          <Button disabled className="opacity-50">
            🎉 Completed!
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <Card>
          <CardContent>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="text-red-800 font-medium">Error</div>
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent>
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Processing...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SessionIntegration;

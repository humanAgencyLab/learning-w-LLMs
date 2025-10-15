import React, {useState, useEffect} from 'react';
import MainLayout from '../layouts/MainLayout';
import { sendMessage } from '../lib/api';
import { summarizeSession } from '../lib/summaryApi';
import LeftProfilePanel from '../components/panels/LeftProfilePanel';
import RightStudyPanel from '../components/panels/RightStudyPanel';
import PlanProgressSheet from '../components/sheets/PlanProgressSheet';
import ChatStream from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import { assessStage as newAssessStage, recheckAssessment, startQuiz as newStartQuiz, submitQuiz as newSubmitQuiz, promoteStage } from '../lib/stageApi';
// Legacy structured learning API - keeping for future use
// import { 
//   runPreAssessment, 
//   generateLearningPlan, 
//   updateModuleStatus, 
//   startModuleQuiz 
// } from '../lib/structuredLearningApi';

function ChatInterface() {
  const [messages, setMessages]= useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // const [error, setError] = useState(null); // Legacy - not used in new UI
  // const [summary, setSummary] = useState(''); // Legacy - not used in new UI
  const [summarizing, setSummarizing] = useState(false);
  // const [isStreaming, setIsStreaming] = useState(false); // Legacy - not used
  // const [streamingEnabled, setStreamingEnabled] = useState(false); // Legacy - not used
  // const [abortController, setAbortController] = useState(null); // Legacy - not used
  
  // Core features
  const [currentStage, setCurrentStage] = useState(1);
  const [messageCount, setMessageCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState(null);
  const [toast, setToast] = useState(null);
  
  // Stage tracking features
  const [stageConfidence, setStageConfidence] = useState(0.5);
  const [stageHistory, setStageHistory] = useState([]);
  const [milestones, setMilestones] = useState({});
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  
  // SRL State Management
  const [srlState, setSrlState] = useState({
    topic: null,
    phase: 'assessment',
    plan: [],
    currentModuleId: null,
    progress: { overallPct: 0, modulePct: 0 },
    nextAction: 'ask',
    planLocked: false
  });

  // Category selection for empty state
  const [selectedCategory, setSelectedCategory] = useState('studying');

  // Gamification rewards (from backend response)
  const [sessionRewards, setSessionRewards] = useState(null);

  // Show/hide panels (responsive design)
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Fetch SRL state from backend
  const fetchSRLState = async (sessionId) => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`http://localhost:5001/session/state?sessionId=${sessionId}`);
      if (response.ok) {
        const state = await response.json();
        setSrlState(state);
        console.log('✅ SRL State updated:', state);
      }
    } catch (error) {
      console.error('❌ Error fetching SRL state:', error);
    }
  };

  // Handle next action button clicks
  const handleNextAction = (action) => {
    switch (action) {
      case 'ask':
        // Focus on input field
        const inputElement = document.querySelector('.message-input');
        if (inputElement) {
          inputElement.focus();
        }
        break;
      case 'confirm_plan':
        // Send confirmation message
        if (sessionId) {
          handleNonStreamingSubmit('Sounds good, let\'s start!');
        }
        break;
      case 'start_quiz':
        setQuizModalOpen(true);
        break;
      case 'submit_quiz':
        // This would be handled by quiz submission
        break;
      case 'review':
        // Show review materials
        break;
      default:
        console.log('Next action:', action);
    }
  };

  // Strip state blocks from assistant messages (handle both ```state and ```json)
  const stripStateFromMessage = (message) => {
    return message.replace(/```(?:state|json)\s*[\s\S]*?\s*```/g, '').trim();
  };
  
  // Stage assessment system
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [isAssessing, setIsAssessing] = useState(false);
  const [stageTrackerOpen, setStageTrackerOpen] = useState(window.innerWidth >= 1200); // Show by default on desktop
  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [currentQuizData, setCurrentQuizData] = useState(null);
  const [eligibleForQuiz, setEligibleForQuiz] = useState(false);
  const [learningSignals, setLearningSignals] = useState([]);
  const [shouldReassess, setShouldReassess] = useState(false);


  // Legacy structured learning state (for backwards compatibility)
  const [learningPlan, setLearningPlan] = useState([]);
  const [currentModule, setCurrentModule] = useState(null);
  const [moduleProgress, setModuleProgress] = useState(0);
  const [preAssessmentComplete, setPreAssessmentComplete] = useState(false);
  const [learningGoal, setLearningGoal] = useState('');
  const [priorKnowledge, setPriorKnowledge] = useState('');
  const [learningStyle, setLearningStyle] = useState('');
  const [isPreAssessing, setIsPreAssessing] = useState(false);

  // Toast helper
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Fetch SRL state when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetchSRLState(sessionId);
    }
  }, [sessionId]);

  // Session selection handler
  const handleSessionSelect = (newSessionId) => {
    setSessionId(newSessionId);
    setMessages([]); // Clear current messages
    setSidebarOpen(false);
    // In a real app, you'd load the session's messages here
  };

  // Stage change handler removed - stage is now managed by assessment system

  // Retry last message handler
  const handleRetryLastMessage = async () => {
    if (!lastUserMessage || !sessionId) return;
    
    // Remove the last assistant message
    setMessages(prevMessages => {
      const newMessages = [...prevMessages];
      const lastIndex = newMessages.length - 1;
      if (lastIndex >= 0 && newMessages[lastIndex].sender === 'ai') {
        newMessages.splice(lastIndex, 1);
      }
      return newMessages;
    });

    // Resend the last user message
    await handleNonStreamingSubmit(lastUserMessage);
  };

  // Copy message handler
  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Message copied to clipboard', 'success');
  };

  // Delete message handler (client-side only)
  const handleDeleteMessage = (index) => {
    setMessages(prevMessages => prevMessages.filter((_, i) => i !== index));
    showToast('Message deleted', 'info');
  };

  // Stage tracing handlers (removed duplicate - using new stage assessment system below)

  // Old quiz handlers removed - using new stage assessment system below

  // Stage override removed - stage is now managed by assessment system

  // New stage assessment handlers
  const handleInitialAssessment = async (userMessage) => {
    if (!userMessage.trim()) return;
    
    setIsAssessing(true);
    try {
      const result = await newAssessStage(sessionId, userMessage);
      
      setSessionId(result.sessionId);
      setCurrentStage(result.stage);
      setStageConfidence(result.confidence);
      setMilestones(result.milestones.reduce((acc, milestone, index) => {
        acc[`M${index + 1}`] = 'todo';
        return acc;
      }, {}));
      
      setStageTrackerOpen(true);
      setIsFirstMessage(false);
      
      showToast(`Assessment complete: Stage ${result.stage}`, 'success');
      
      return result;
    } catch (error) {
      console.error('Assessment error:', error);
      showToast('Assessment failed', 'error');
      return null;
    } finally {
      setIsAssessing(false);
    }
  };

  const handleReassess = async () => {
    if (!sessionId) return;
    
    try {
      const result = await recheckAssessment(sessionId);
      
      setCurrentStage(result.stage);
      setStageConfidence(result.confidence);
      setEligibleForQuiz(result.eligibleForQuiz);
      
      showToast('Re-assessment complete', 'success');
    } catch (error) {
      console.error('Re-assessment error:', error);
      showToast('Re-assessment failed', 'error');
    }
  };

  const handleStartQuiz = async (stage) => {
    if (!sessionId) return;
    
    try {
      const result = await newStartQuiz(sessionId, stage);
      
      setCurrentQuizData({
        ...result,
        stage: stage
      });
      setQuizPanelOpen(true);
    } catch (error) {
      console.error('Quiz start error:', error);
      showToast('Failed to start quiz', 'error');
    }
  };

  const handleQuizSubmit = async (answers) => {
    if (!sessionId || !currentQuizData) return;
    
    try {
      const result = await newSubmitQuiz(sessionId, currentQuizData.quizId, answers);
      
      if (result.passed) {
        // If in SRL mode, refresh state
        if (srlState.plan && srlState.plan.length > 0) {
          await fetchSRLState(sessionId);
          showToast('🎉 Module completed! Moving to next module.', 'success');
        } else {
          // Traditional stage promotion
          const promoteResult = await promoteStage(sessionId);
          setCurrentStage(promoteResult.newStage);
          setStageHistory(promoteResult.stageHistory);
          setEligibleForQuiz(false);
          
          showToast(`🎉 Promoted to Stage ${promoteResult.newStage}!`, 'success');
        }
      } else {
        showToast('Quiz failed. Try again!', 'error');
      }
      
      setQuizPanelOpen(false);
      setCurrentQuizData(null);
    } catch (error) {
      console.error('Quiz submit error:', error);
      showToast('Failed to submit quiz', 'error');
    }
  };

  // SRL API Functions

  const submitQuizAnswers = async (sessionId, answers) => {
    try {
      const response = await fetch('http://localhost:5001/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, answers })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit quiz');
      }
      
      const result = await response.json();
      // Refresh SRL state after quiz submission
      await fetchSRLState(sessionId);
      return result;
    } catch (error) {
      console.error('Quiz submission error:', error);
      throw error;
    }
  };


  // Learning intent detection
  const detectLearningIntent = async (message) => {
    try {
      const response = await fetch('http://localhost:5001/detect-learning-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        // Fallback to simple keyword detection if API fails
        const learningKeywords = ['learn', 'teach', 'study', 'understand', 'know about', 'explain', 'help me with'];
        const wantsToLearn = learningKeywords.some(keyword => 
          message.toLowerCase().includes(keyword)
        );
        return {
          wantsToLearn,
          topic: wantsToLearn ? 'General Learning' : null,
          confidence: wantsToLearn ? 0.7 : 0.3
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Learning intent detection error:', error);
      // Fallback to simple keyword detection
      const learningKeywords = ['learn', 'teach', 'study', 'understand', 'know about', 'explain', 'help me with'];
      const wantsToLearn = learningKeywords.some(keyword => 
        message.toLowerCase().includes(keyword)
      );
      return {
        wantsToLearn,
        topic: wantsToLearn ? 'General Learning' : null,
        confidence: wantsToLearn ? 0.7 : 0.3
      };
    }
  };

  // Structured learning handlers (commented out - using SRL system instead)
  // const handlePreAssessment = async (topic, message) => {
  //   setIsPreAssessing(true);
  //   try {
  //     const result = await runPreAssessment(topic, message, sessionId);
  //     setSessionId(result.sessionId);
  //     return result;
  //   } catch (error) {
  //     console.error('Pre-assessment error:', error);
  //     showToast('Pre-assessment failed', 'error');
  //     return null;
  //   } finally {
  //     setIsPreAssessing(false);
  //   }
  // };

  // const handleGenerateLearningPlan = async (sessionId, goal, knowledge, style) => {
  //   try {
  //     const result = await generateLearningPlan(sessionId, goal, knowledge, style);
  //     setLearningPlan(result.learningPlan);
  //     setCurrentModule(result.currentModule);
  //     setModuleProgress(result.moduleProgress);
  //     setPreAssessmentComplete(true);
  //     setLearningGoal(goal);
  //     setPriorKnowledge(knowledge);
  //     setLearningStyle(style);
      
  //     showToast('Learning plan generated!', 'success');
  //     return result;
  //   } catch (error) {
  //     console.error('Learning plan generation error:', error);
  //     showToast('Failed to generate learning plan', 'error');
  //     return null;
  //   }
  // };

  // Legacy function - commented out due to unused import
  // const handleStartModuleQuiz = async (moduleId) => {
  //   if (!sessionId) return;
    
  //   try {
  //     const result = await startModuleQuiz(sessionId, moduleId);
      
  //     setCurrentQuizData({
  //       ...result,
  //       moduleId: moduleId
  //     });
  //     setQuizPanelOpen(true);
  //   } catch (error) {
  //     console.error('Module quiz start error:', error);
  //     showToast('Failed to start module quiz', 'error');
  //   }
  // };

  // Learning signals heuristic
  const analyzeLearningSignals = (userMessage, aiResponse) => {
    const signals = {
      correctness: 0,
      independence: 0,
      terminology: 0
    };

    // Check for correctness indicators
    const correctKeywords = ['correct', 'right', 'yes', 'exactly', 'that\'s right'];
    const hasCorrectKeywords = correctKeywords.some(keyword => 
      aiResponse.toLowerCase().includes(keyword)
    );
    if (hasCorrectKeywords) signals.correctness = 1;

    // Check for independence indicators
    const independentKeywords = ['i think', 'my understanding', 'i believe', 'based on', 'i can see'];
    const hasIndependentKeywords = independentKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );
    if (hasIndependentKeywords) signals.independence = 1;

    // Check for terminology usage
    const technicalTerms = ['algorithm', 'function', 'variable', 'loop', 'condition', 'data structure'];
    const hasTechnicalTerms = technicalTerms.some(term => 
      userMessage.toLowerCase().includes(term)
    );
    if (hasTechnicalTerms) signals.terminology = 1;

    return signals;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inputValue.trim() === "" || isLoading || isAssessing) return;
    
    const userMessage = inputValue.trim();
    setInputValue("");
    // setError(null); // Legacy - not used in new UI
    setLastUserMessage(userMessage); // Store for retry functionality
    
    // Add user message to chat
    setMessages(prevMessages => [...prevMessages, { text: userMessage, sender: 'user' }]);

    // Use SRL system for all interactions
    await handleNonStreamingSubmit(userMessage);
      
      // Fetch updated SRL state after message
      if (sessionId) {
        await fetchSRLState(sessionId);
      }
  }

  // handleStreamingSubmit removed - not used in current implementation

  const handleNonStreamingSubmit = async (userMessage) => {
    setIsLoading(true);
    // setError(null); // Legacy - not used in new UI

    try {
      console.log('📤 Sending message to /chat endpoint');
      const response = await sendMessage({ 
        message: userMessage, 
        stage: currentStage, 
        sessionId: sessionId 
      });
      
      console.log('✅ Received response:', response);
      
      // Update session ID if we got a new one
      if (response.sessionId) {
        setSessionId(response.sessionId);
        console.log('🔄 Updated session ID:', response.sessionId);
      }
      
      // Update message count if provided
      if (response.messageCount !== undefined) {
        setMessageCount(response.messageCount);
      }
      
      // Update stage information if provided
      if (response.stage !== undefined) {
        setCurrentStage(response.stage);
      }
      if (response.stageConfidence !== undefined) {
        setStageConfidence(response.stageConfidence);
      }
      
      // Show assessment toast if assessment was performed
      if (response.assessmentPerformed) {
        showToast(`Assessment complete: Stage ${response.stage}`, 'success');
      }
      
      // Mastery tracking removed - using learning signals heuristic instead

      // Analyze learning signals for re-assessment
      const signals = analyzeLearningSignals(userMessage, response.reply);
      setLearningSignals(prev => [...prev.slice(-4), signals]); // Keep last 5 signals
      
      // Check if we should trigger re-assessment
      const recentSignals = learningSignals.slice(-4);
      const avgCorrectness = recentSignals.reduce((sum, s) => sum + s.correctness, 0) / recentSignals.length;
      const avgIndependence = recentSignals.reduce((sum, s) => sum + s.independence, 0) / recentSignals.length;
      const avgTerminology = recentSignals.reduce((sum, s) => sum + s.terminology, 0) / recentSignals.length;
      
      if (recentSignals.length >= 3 && avgCorrectness >= 0.6 && avgIndependence >= 0.4 && avgTerminology >= 0.4) {
        setShouldReassess(true);
      }
      
      // Add AI response to chat (strip state blocks)
      const cleanReply = stripStateFromMessage(response.reply);
      setMessages(prevMessages => [...prevMessages, { 
        text: cleanReply, 
        sender: 'ai' 
      }]);
      
      // Fetch updated SRL state after each response
      if (response.sessionId) {
        await fetchSRLState(response.sessionId);
      }
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      
      let errorMessage = 'Failed to get response from AI';
      let toastType = 'error';
      
      // Handle different types of errors
      if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. The AI is taking too long to respond. Please try again.';
      } else if (error.message.includes('503')) {
        errorMessage = 'AI service is temporarily unavailable due to high demand. Please try again in a few moments.';
        toastType = 'warning';
      } else if (error.message.includes('502')) {
        errorMessage = 'AI service is temporarily unavailable. Please try again later.';
        toastType = 'warning';
      } else if (error.message.includes('400')) {
        errorMessage = 'Invalid request. Please check your message and try again.';
      } else if (error.message.includes('500')) {
        errorMessage = 'Server error. Please try again.';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
        toastType = 'warning';
      } else {
        errorMessage = error.message || 'An unexpected error occurred. Please try again.';
      }
      
      // setError(errorMessage); // Legacy - not used in new UI
      showToast(errorMessage, toastType);
      
      // Add error message to chat
      setMessages(prevMessages => [...prevMessages, { 
        text: `Error: ${errorMessage}`, 
        sender: 'ai',
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  // Legacy function - commented out due to unused state
  // const onSummarize = async () => {
  //   if (!sessionId) return;
  //   setSummarizing(true);
  //   try {
  //     const { summary } = await summarizeSession(sessionId);
  //     setSummary(summary);
  //   } catch (error) {
  //     console.error('Summary error:', error);
  //     setSummary('Summary failed.');
  //   } finally {
  //     setSummarizing(false);
  //   }
  // };

  const handleSummarizeSession = async () => {
    if (!sessionId) return;
    setSummarizing(true);
    try {
      const { summary } = await summarizeSession(sessionId);
      // setSummary(summary); // Legacy - not used in new UI
      showToast('Session summarized successfully!', 'success');
    } catch (error) {
      console.error('Summary error:', error);
      // setSummary('Summary failed.'); // Legacy - not used in new UI
      showToast('Failed to summarize session', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  // Legacy function - commented out due to unused state
  // const stopStreaming = () => {
  //   if (abortController) {
  //     abortController.abort();
  //     setAbortController(null);
  //     setIsStreaming(false);
      
  //     // Mark the last message as stopped
  //     setMessages(prevMessages => {
  //       const newMessages = [...prevMessages];
  //       const lastMessage = newMessages[newMessages.length - 1];
  //       if (lastMessage && lastMessage.sender === 'ai' && lastMessage.isStreaming) {
  //         lastMessage.text = lastMessage.text + ' (stopped)';
  //         lastMessage.isStopped = true;
  //         delete lastMessage.isStreaming;
  //       }
  //       return newMessages;
  //     });
  //   }
  // };

  // Fetch SRL state on component mount and session change
  useEffect(() => {
    if (sessionId) {
      fetchSRLState(sessionId);
    }
  }, [sessionId]);

  // Map existing state to the new component props
  const modules = srlState?.plan?.modules ?? srlState?.plan ?? [];
  const topic = srlState?.topic ?? '—';
  const overallProgressPct = srlState?.progress?.overallPct ?? 0;

  // Mock completeMilestone function (replace with actual API call)
  const completeMilestone = (sessionId, moduleId, milestoneId) => {
    console.log('Complete milestone:', { sessionId, moduleId, milestoneId });
    // TODO: Implement actual API call to POST /milestone/complete
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-4">
          <div className="flex gap-6">
            {/* LEFT COLUMN */}
            <aside className="hidden md:flex w-[320px] shrink-0">
              <div className="sticky top-4 h-[calc(100vh-2rem)] flex flex-col w-full">
                <div className="shrink-0">
                  <LeftProfilePanel />
                </div>
                <div className="h-4" />
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto pr-1">
                    <RightStudyPanel
                      topic={topic}
                      overallProgressPct={overallProgressPct}
                      modules={modules}
                      onCompleteMilestone={(mid, msid) =>
                        completeMilestone(sessionId, mid, msid)
                      }
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* CENTER */}
            <main className="flex-1 flex flex-col min-w-0">
              <div className="md:hidden mb-3">
                <PlanProgressSheet
                  topic={topic}
                  overallProgressPct={overallProgressPct}
                  modules={modules}
                  onCompleteMilestone={(mid, msid) =>
                    completeMilestone(sessionId, mid, msid)
                  }
                />
              </div>

              <div className="flex-1 min-h-[60vh] rounded-xl border border-border bg-surface shadow-card overflow-hidden">
                <ChatStream 
                  messages={messages} 
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                  inputValue={inputValue}
                  onInputChange={(e) => setInputValue(e.target.value)}
                  onSend={handleSubmit}
                  isLoading={isLoading}
                />
              </div>

              <div className="mt-4">
                <Composer 
                  onSend={handleSubmit}
                  inputValue={inputValue}
                  onInputChange={(e) => setInputValue(e.target.value)}
                  isLoading={isLoading}
                />
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </MainLayout>
  );
}

export default ChatInterface;

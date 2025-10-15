import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { sendMessage } from '../lib/api';
import { summarizeSession } from '../lib/summaryApi';
import LeftProfilePanel from '../components/panels/LeftProfilePanel';
import RightStudyPanel from '../components/panels/RightStudyPanel';
import PlanProgressSheet from '../components/sheets/PlanProgressSheet';
import ChatStream from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('studying');
  const [toast, setToast] = useState(null);
  
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

  // Toast helper
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputValue.trim() === "" || isLoading) return;

    const userMessage = { 
      sender: 'user', 
      text: inputValue, 
      isUser: true,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await sendMessage(inputValue, sessionId);
      const aiMessage = {
        sender: 'ai',
        text: response.message,
        isUser: false,
        timestamp: new Date(),
        showDisclaimer: messages.length === 0 // Show disclaimer on first AI message
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Update SRL state if we get a session ID back
      if (response.sessionId && !sessionId) {
        setSessionId(response.sessionId);
        // Initialize with basic topic if this is the first interaction
        if (!srlState.topic) {
          setSrlState(prev => ({
            ...prev,
            topic: 'Python Basic',
            phase: 'learning',
            plan: [
              {
                id: 1,
                title: 'Variables & Data Types',
                status: 'complete',
                milestones: ['Understand variables', 'Identify data types'],
                completedMilestones: [0],
                xp: 50,
                gems: 5
              },
              {
                id: 2,
                title: 'Control Structures',
                status: 'in_progress',
                milestones: ['If/Else statements', 'For loops', 'While loops'],
                completedMilestones: [0],
                xp: 70,
                gems: 7
              },
              {
                id: 3,
                title: 'Functions & Modules',
                status: 'locked',
                milestones: ['Define functions', 'Import modules'],
                completedMilestones: [],
                xp: 90,
                gems: 9
              }
            ],
            progress: { overallPct: 25 }
          }));
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Mock completeMilestone function
  const completeMilestone = (sessionId, moduleId, milestoneId) => {
    console.log('Complete milestone:', { sessionId, moduleId, milestoneId });
    showToast('Milestone completed!', 'success');
    
    // Update the state to reflect milestone completion
    setSrlState(prev => ({
      ...prev,
      plan: prev.plan.map(module => {
        if (module.id === moduleId) {
          const newCompletedMilestones = [...(module.completedMilestones || []), milestoneId];
          return { ...module, completedMilestones: newCompletedMilestones };
        }
        return module;
      })
    }));
  };

  // Map existing state to the new component props
  const modules = srlState?.plan?.modules ?? srlState?.plan ?? [];
  const topic = srlState?.topic ?? '—';
  const overallProgressPct = srlState?.progress?.overallPct ?? 0;

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
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-white z-50 ${
          toast.type === 'error' ? 'bg-red-500' : 
          toast.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        }`}>
          {toast.message}
        </div>
      )}
    </MainLayout>
  );
}

export default ChatInterface;
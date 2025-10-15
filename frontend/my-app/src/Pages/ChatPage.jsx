import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import LeftProfilePanel from '../components/panels/LeftProfilePanel';
import RightStudyPanel from '../components/panels/RightStudyPanel';
import ChatStream from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import PlanProgressSheet from '../components/sheets/PlanProgressSheet';

export default function ChatPage() {
  // Existing state management (keeping from ChatInterface.jsx)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [srlState, setSrlState] = useState({
    topic: 'Python Basic',
    phase: 'LEARNING',
    plan: [
      {
        id: 1,
        title: 'Python Basics',
        status: 'complete',
        milestones: [
          { id: 1, title: 'Variables & Data Types', done: true, xp: 50, gems: 2, trophyOnComplete: false },
          { id: 2, title: 'Basic Operations', done: true, xp: 30, gems: 1, trophyOnComplete: false },
          { id: 3, title: 'Input/Output', done: true, xp: 40, gems: 2, trophyOnComplete: false },
          { id: 4, title: 'Quiz: Basics', done: true, xp: 100, gems: 5, trophyOnComplete: true }
        ]
      },
      {
        id: 2,
        title: 'Control Structures',
        status: 'in_progress',
        milestones: [
          { id: 5, title: 'If/Else Statements', done: true, xp: 60, gems: 3, trophyOnComplete: false },
          { id: 6, title: 'Loops: For & While', done: true, xp: 70, gems: 4, trophyOnComplete: false },
          { id: 7, title: 'Nested Conditions', done: false, xp: 80, gems: 4, trophyOnComplete: false },
          { id: 8, title: 'Practice Exercises', done: false, xp: 120, gems: 6, trophyOnComplete: false }
        ]
      },
      {
        id: 3,
        title: 'Functions & Modules',
        status: 'locked',
        milestones: [
          { id: 9, title: 'Function Definition', done: false, xp: 90, gems: 5, trophyOnComplete: false },
          { id: 10, title: 'Parameters & Returns', done: false, xp: 100, gems: 5, trophyOnComplete: false },
          { id: 11, title: 'Built-in Functions', done: false, xp: 80, gems: 4, trophyOnComplete: false },
          { id: 12, title: 'Module Import', done: false, xp: 70, gems: 3, trophyOnComplete: false }
        ]
      }
    ],
    progress: { overallPct: 87 }
  });
  const [selectedCategory, setSelectedCategory] = useState('studying');

  // Mock completeMilestone function
  const completeMilestone = (sessionId, moduleId, milestoneId) => {
    console.log('Complete milestone:', { sessionId, moduleId, milestoneId });
    // Update the milestone status
    setSrlState(prev => ({
      ...prev,
      plan: prev.plan.map(module => 
        module.id === moduleId 
          ? {
              ...module,
              milestones: module.milestones.map(milestone =>
                milestone.id === milestoneId 
                  ? { ...milestone, done: true }
                  : milestone
              )
            }
          : module
      )
    }));
  };

  // Mock send function
  const send = (message) => {
    console.log('Send message:', message);
    // Add user message
    setMessages(prev => [...prev, { id: Date.now(), text: message, isUser: true }]);
    setIsLoading(true);
    
    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        text: "Thanks for your question! I'm here to help you learn.", 
        isUser: false 
      }]);
      setIsLoading(false);
    }, 1000);
  };

  const modules = srlState?.plan?.modules ?? srlState?.plan ?? [];
  const topic = srlState?.topic ?? '—';
  const overallProgressPct = srlState?.progress?.overallPct ?? 0;

  return (
    <MainLayout>
      <div className="min-h-screen bg-neutral-50">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-4">
          <div className="grid grid-cols-12 gap-6">
            {/* LEFT COLUMN: Sidebar + Study Panel */}
            <aside className="hidden md:block md:col-span-3">
              <div className="sticky top-4 h-[calc(100vh-2rem)] flex flex-col">
                {/* Nav */}
                <div className="shrink-0">
                  <LeftProfilePanel />
                </div>

                {/* Divider */}
                <div className="h-4" />

                {/* RightStudyPanel lives UNDER the nav */}
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto pr-1"> 
                    <RightStudyPanel
                      topic={topic}
                      overallProgressPct={overallProgressPct}
                      modules={modules}
                      onCompleteMilestone={(modId, msId) =>
                        completeMilestone(sessionId, modId, msId)
                      }
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* CENTER: Chat */}
            <main className="col-span-12 md:col-span-9 flex flex-col">
              {/* Mobile toggle for the study panel */}
              <div className="md:hidden mb-3">
                <PlanProgressSheet
                  topic={topic}
                  overallProgressPct={overallProgressPct}
                  modules={modules}
                  onCompleteMilestone={(modId, msId) =>
                    completeMilestone(sessionId, modId, msId)
                  }
                />
              </div>

              {/* Chat area */}
              <div className="flex-1 min-h-[60vh] rounded-2xl border bg-white">
                <ChatStream 
                  messages={messages} 
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                  inputValue={inputValue}
                  onInputChange={(e) => setInputValue(e.target.value)}
                  onSend={send}
                  isLoading={isLoading}
                />
              </div>

              {/* Composer */}
              <div className="mt-4">
                <Composer 
                  onSend={send}
                  inputValue={inputValue}
                  onInputChange={(e) => setInputValue(e.target.value)}
                  isLoading={isLoading}
                />
              </div>
            </main>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

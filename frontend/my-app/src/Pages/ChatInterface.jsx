import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { sendMessage } from '../lib/api';
import { summarizeSession } from '../lib/summaryApi';

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('studying');
  const [selectedModel, setSelectedModel] = useState('ChatGPT');
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
            progress: { overallPct: 87 }
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

  return (
    <MainLayout>
      <div className="bg-[#f7f8f8] min-h-screen">
        <div className="flex h-screen">
          {/* LEFT SIDEBAR - Exact Figma Design */}
          <div className="bg-white border-r border-[#e6e7e8] w-[252px] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-4">
              <div className="w-10 h-10 bg-[#4e81ee] rounded-lg flex items-center justify-center">
                <span className="text-white text-lg font-bold">S</span>
              </div>
              <p className="font-bold text-lg text-gray-950 tracking-[-0.4px]">
                Study Assist
              </p>
            </div>

            {/* Navigation */}
            <div className="flex flex-col gap-2 px-4">
              <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                  </svg>
                </div>
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  New Chat
                </p>
              </div>

              <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                  </svg>
                </div>
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  Chat History
                </p>
              </div>

              <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                  </svg>
                </div>
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  Settings
                </p>
              </div>

              <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                </div>
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  Performance
                </p>
              </div>

              <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm-5 12l-2.5-1.5L7 15V5h10v10l-2.5 1.5L12 15z"/>
                  </svg>
                </div>
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  Favourites
                </p>
              </div>
            </div>

            {/* Progress Card - Only show when there's a topic */}
            {srlState.topic && (
              <div className="flex-1 flex items-center justify-center px-4">
                <div className="bg-white border border-[#e6e7e8] rounded-2xl w-[212px] p-4 relative overflow-hidden">
                  {/* Background decoration */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="w-full h-full bg-gradient-to-br from-[#4e81ee] to-[#ffb36b] rounded-2xl"></div>
                  </div>
                  
                  <div className="relative z-10 flex flex-col gap-4 items-center">
                    {/* Progress */}
                    <div className="flex flex-col gap-2 w-full">
                      <p className="font-normal text-[13px] text-gray-950 text-center">
                        {srlState.progress.overallPct}%
                      </p>
                      <div className="relative">
                        <div className="bg-[#ecf2fd] h-1 rounded-full w-full"></div>
                        <div 
                          className="absolute bg-[#ffb36b] h-1 rounded-full top-0"
                          style={{ width: `${srlState.progress.overallPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Topic Info */}
                    <div className="flex flex-col gap-1 items-center text-center">
                      <p className="font-bold text-base text-gray-950 tracking-[-0.25px]">
                        {srlState.topic}
                      </p>
                      <p className="font-normal text-[13px] text-gray-950">
                        Level 8/10
                      </p>
                    </div>

                    {/* Trophy Icon */}
                    <div className="w-16 h-16 flex items-center justify-center">
                      <span className="text-6xl">🏆</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Profile */}
            <div className="flex items-center gap-2 p-4">
              <div className="w-10 h-10 rounded-full overflow-hidden">
                <img 
                  alt="" 
                  className="w-full h-full object-cover" 
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face" 
                />
              </div>
              <div className="flex items-center gap-1">
                <p className="font-normal text-base text-gray-950 tracking-[-0.25px]">
                  John Smith
                </p>
                <div className="w-4 h-4">
                  <svg className="w-4 h-4 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 bg-[#f7f8f8] flex flex-col">
            {/* Top Bar */}
            <div className="bg-white flex items-center justify-between px-16 py-4">
              {srlState.topic ? (
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6">
                    <svg className="w-6 h-6 text-[#4e81ee]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z"/>
                    </svg>
                  </div>
                  <p className="font-normal text-base text-[#424855] tracking-[-0.25px]">
                    <span>You are </span>
                    <span className="font-bold">Studying</span>
                    <span> {srlState.topic} 💪</span>
                  </p>
                </div>
              ) : (
                <div></div>
              )}
              
              <button 
                onClick={() => setSrlState(prev => ({ ...prev, topic: 'Python Basic', progress: { overallPct: 87 } }))}
                className="bg-[#4e81ee] flex items-center gap-3 px-5 py-3 rounded-full"
              >
                <p className="font-bold text-base text-white tracking-[-0.25px]">
                  Start Chat
                </p>
                <div className="w-6 h-6">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                  </svg>
                </div>
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-16 py-4">
              {messages.length === 0 ? (
                // PRE-CHAT STATE - Empty State
                <div className="flex flex-col items-center gap-8">
                  {/* Main heading */}
                  <h2 className="font-bold text-[21px] text-gray-950 tracking-[-0.6px]">
                    Ready when you are.
                  </h2>

                  <div className="flex flex-col gap-6 w-[700px]">
                    {/* Input area */}
                    <div className="bg-white border border-[#4e81ee] flex flex-col gap-4 px-4 py-3 rounded-3xl relative">
                      <textarea
                        className="w-full border-none outline-none font-normal text-[18px] text-[#aeb1b6] placeholder:text-[#aeb1b6] tracking-[-0.4px] resize-none bg-transparent"
                        placeholder="Ask anything..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        rows={4}
                      />
                      
                      {/* Model selector and submit button */}
                      <div className="flex gap-2 items-center justify-end">
                        <div className="flex items-center gap-1">
                          <select
                            className="font-normal text-base text-[#424855] tracking-[-0.25px] border-none outline-none bg-transparent cursor-pointer"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                          >
                            <option value="ChatGPT">ChatGPT</option>
                            <option value="Llama">Llama</option>
                            <option value="GPT-4">GPT-4</option>
                          </select>
                          <div className="w-6 h-6">
                            <svg className="w-6 h-6 text-[#aeb1b6]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M7 10l5 5 5-5z"/>
                            </svg>
                          </div>
                        </div>
                        
                        <button
                          onClick={handleSubmit}
                          className="bg-[#4e81ee] flex items-center justify-center p-3 rounded-full"
                          disabled={!inputValue.trim()}
                        >
                          <div className="w-6 h-6">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Category buttons */}
                    <div className="flex gap-4 items-center justify-center">
                      {[
                        { id: 'studying', label: 'Studying', icon: '🎓' },
                        { id: 'explanation', label: 'Explanation', icon: '💡' },
                        { id: 'revision', label: 'Revision', icon: '📚' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`flex items-center gap-3 px-5 py-2.5 rounded-lg transition-colors ${
                            selectedCategory === cat.id 
                              ? 'border border-[#4e81ee] border-solid' 
                              : 'bg-white rounded-lg shadow-[0px_1px_3px_0px_rgba(20,20,31,0.12),0px_0px_0px_1px_rgba(20,20,31,0.12)]'
                          }`}
                        >
                          <div className="w-6 h-6">
                            <span className="text-2xl">{cat.icon}</span>
                          </div>
                          <p className={`font-bold text-[18px] tracking-[-0.4px] ${
                            selectedCategory === cat.id ? 'text-[#4e81ee]' : 'text-[#686d77]'
                          }`}>
                            {cat.label}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // IN-CHAT STATE - Messages
                <div className="flex flex-col gap-8 w-full max-w-4xl">
                  {/* Messages */}
                  <div className="flex flex-col gap-10">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl ${
                          msg.isUser ? 'bg-[#4e81ee] text-white' : 'bg-white border border-[#e6e7e8]'
                        }`}>
                          <p className={`font-normal text-[18px] tracking-[-0.4px] ${
                            msg.isUser ? 'text-white' : 'text-gray-950'
                          }`}>
                            {msg.text}
                          </p>
                          
                          {/* AI message actions */}
                          {!msg.isUser && (
                            <div className="flex items-center gap-4 mt-4">
                              <div className="flex gap-4">
                                <button className="w-6 h-6">
                                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z"/>
                                  </svg>
                                </button>
                                <button className="w-6 h-6">
                                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                                  </svg>
                                </button>
                                <button className="w-6 h-6">
                                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                                  </svg>
                                </button>
                                <button className="w-6 h-6">
                                  <svg className="w-6 h-6 text-gray-950" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M1 4v6h6M23 20v-6h-6"/>
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                                  </svg>
                                </button>
                              </div>
                              <p className="font-normal text-[18px] text-gray-950 tracking-[-0.4px]">
                                AI can make mistakes. Please double-check responses.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-[#e6e7e8] p-4 rounded-2xl">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="bg-white border border-[#4e81ee] flex flex-col gap-4 px-4 py-3 rounded-3xl">
                    <textarea
                      className="w-full border-none outline-none font-normal text-[18px] text-[#aeb1b6] placeholder:text-[#aeb1b6] tracking-[-0.4px] resize-none bg-transparent"
                      placeholder="Ask anything..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      rows={3}
                    />
                    
                    <div className="flex gap-2 items-center justify-end">
                      <div className="flex items-center gap-1">
                        <select
                          className="font-normal text-base text-[#424855] tracking-[-0.25px] border-none outline-none bg-transparent cursor-pointer"
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                        >
                          <option value="ChatGPT">ChatGPT</option>
                          <option value="Llama">Llama</option>
                          <option value="GPT-4">GPT-4</option>
                        </select>
                        <div className="w-6 h-6">
                          <svg className="w-6 h-6 text-[#aeb1b6]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M7 10l5 5 5-5z"/>
                          </svg>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleSubmit}
                        className="bg-[#4e81ee] flex items-center justify-center p-3 rounded-full"
                        disabled={!inputValue.trim() || isLoading}
                      >
                        <div className="w-6 h-6">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
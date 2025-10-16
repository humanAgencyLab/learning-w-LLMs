import React, { useState } from 'react';

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
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
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() === "") return;

    const userMessage = { 
      sender: 'user', 
      text: inputValue, 
      isUser: true,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      const aiMessage = {
        sender: 'ai',
        text: `AI response to: "${inputValue}"`,
        isUser: false,
        timestamp: new Date(),
        showDisclaimer: messages.length === 0
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // Update SRL state if this is the first interaction
      if (!srlState.topic) {
        setSrlState(prev => ({
          ...prev,
          topic: 'Python Basic',
          phase: 'learning',
          progress: { overallPct: 87 }
        }));
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f7f8f8' }}>
      <div className="flex h-screen">
        {/* LEFT SIDEBAR - Exact Figma Design */}
        <div className="bg-white border-r flex flex-col" style={{ width: '252px', borderColor: '#e6e7e8' }}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#4e81ee' }}>
              <span className="text-white text-lg font-bold">S</span>
            </div>
            <p className="font-bold text-lg" style={{ color: '#030712', letterSpacing: '-0.4px' }}>
              Study Assist
            </p>
          </div>

          {/* Navigation */}
          <div className="flex flex-col gap-2 px-4">
            <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="w-6 h-6">
                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                </svg>
              </div>
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                New Chat
              </p>
            </div>

            <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="w-6 h-6">
                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                </svg>
              </div>
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                Chat History
              </p>
            </div>

            <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="w-6 h-6">
                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </div>
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                Settings
              </p>
            </div>

            <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="w-6 h-6">
                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                Performance
              </p>
            </div>

            <div className="flex items-center gap-4 h-10 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div className="w-6 h-6">
                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm-5 12l-2.5-1.5L7 15V5h10v10l-2.5 1.5L12 15z"/>
                </svg>
              </div>
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                Favourites
              </p>
            </div>
          </div>

          {/* Progress Card - Only show when there's a topic */}
          {srlState.topic && (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="bg-white border rounded-2xl p-4 relative overflow-hidden" style={{ width: '212px', borderColor: '#e6e7e8' }}>
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-5">
                  <div className="w-full h-full rounded-2xl" style={{ background: 'linear-gradient(135deg, #4e81ee 0%, #ffb36b 100%)' }}></div>
                </div>
                
                <div className="relative z-10 flex flex-col gap-4 items-center">
                  {/* Progress */}
                  <div className="flex flex-col gap-2 w-full">
                    <p className="font-normal text-center" style={{ fontSize: '13px', color: '#030712' }}>
                      {srlState.progress.overallPct}%
                    </p>
                    <div className="relative">
                      <div className="h-1 rounded-full w-full" style={{ backgroundColor: '#ecf2fd' }}></div>
                      <div 
                        className="absolute h-1 rounded-full top-0"
                        style={{ 
                          width: `${srlState.progress.overallPct}%`,
                          backgroundColor: '#ffb36b'
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Topic Info */}
                  <div className="flex flex-col gap-1 items-center text-center">
                    <p className="font-bold text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                      {srlState.topic}
                    </p>
                    <p className="font-normal" style={{ fontSize: '13px', color: '#030712' }}>
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
              <p className="font-normal text-base" style={{ color: '#030712', letterSpacing: '-0.25px' }}>
                John Smith
              </p>
              <div className="w-4 h-4">
                <svg className="w-4 h-4" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col" style={{ backgroundColor: '#f7f8f8' }}>
          {/* Top Bar */}
          <div className="bg-white flex items-center justify-between px-16 py-4">
            {srlState.topic ? (
              <div className="flex items-center gap-1">
                <div className="w-6 h-6">
                  <svg className="w-6 h-6" style={{ color: '#4e81ee' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z"/>
                  </svg>
                </div>
                <p className="font-normal text-base" style={{ color: '#424855', letterSpacing: '-0.25px' }}>
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
              className="flex items-center gap-3 px-5 py-3 rounded-full"
              style={{ backgroundColor: '#4e81ee' }}
            >
              <p className="font-bold text-base text-white" style={{ letterSpacing: '-0.25px' }}>
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
                <h2 className="font-bold" style={{ fontSize: '21px', color: '#030712', letterSpacing: '-0.6px' }}>
                  Ready when you are.
                </h2>

                <div className="flex flex-col gap-6" style={{ width: '700px' }}>
                  {/* Input area */}
                  <div className="bg-white border flex flex-col gap-4 px-4 py-3 rounded-3xl" style={{ borderColor: '#4e81ee' }}>
                    <textarea
                      className="w-full border-none outline-none font-normal resize-none bg-transparent"
                      style={{ 
                        fontSize: '18px', 
                        color: '#aeb1b6', 
                        letterSpacing: '-0.4px' 
                      }}
                      placeholder="Ask anything..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      rows={4}
                    />
                    
                    {/* Model selector and submit button */}
                    <div className="flex gap-2 items-center justify-end">
                      <div className="flex items-center gap-1">
                        <select
                          className="font-normal border-none outline-none bg-transparent cursor-pointer"
                          style={{ 
                            fontSize: '16px', 
                            color: '#424855', 
                            letterSpacing: '-0.25px' 
                          }}
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                        >
                          <option value="ChatGPT">ChatGPT</option>
                          <option value="Llama">Llama</option>
                          <option value="GPT-4">GPT-4</option>
                        </select>
                        <div className="w-6 h-6">
                          <svg className="w-6 h-6" style={{ color: '#aeb1b6' }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M7 10l5 5 5-5z"/>
                          </svg>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleSubmit}
                        className="flex items-center justify-center p-3 rounded-full"
                        style={{ backgroundColor: '#4e81ee' }}
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
                            ? 'border border-solid' 
                            : 'bg-white rounded-lg shadow-sm'
                        }`}
                        style={{
                          borderColor: selectedCategory === cat.id ? '#4e81ee' : '#e6e7e8',
                          boxShadow: selectedCategory === cat.id ? 'none' : '0px 1px 3px 0px rgba(20,20,31,0.12), 0px 0px 0px 1px rgba(20,20,31,0.12)'
                        }}
                      >
                        <div className="w-6 h-6">
                          <span className="text-2xl">{cat.icon}</span>
                        </div>
                        <p 
                          className="font-bold"
                          style={{ 
                            fontSize: '18px', 
                            letterSpacing: '-0.4px',
                            color: selectedCategory === cat.id ? '#4e81ee' : '#686d77'
                          }}
                        >
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
                        msg.isUser ? 'text-white' : 'bg-white border'
                      }`}
                      style={{
                        backgroundColor: msg.isUser ? '#4e81ee' : '#ffffff',
                        borderColor: msg.isUser ? 'transparent' : '#e6e7e8'
                      }}>
                        <p className={`font-normal ${
                          msg.isUser ? 'text-white' : ''
                        }`}
                        style={{ 
                          fontSize: '18px', 
                          letterSpacing: '-0.4px',
                          color: msg.isUser ? '#ffffff' : '#030712'
                        }}>
                          {msg.text}
                        </p>
                        
                        {/* AI message actions */}
                        {!msg.isUser && (
                          <div className="flex items-center gap-4 mt-4">
                            <div className="flex gap-4">
                              <button className="w-6 h-6">
                                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </button>
                              <button className="w-6 h-6">
                                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                                </svg>
                              </button>
                              <button className="w-6 h-6">
                                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                                </svg>
                              </button>
                              <button className="w-6 h-6">
                                <svg className="w-6 h-6" style={{ color: '#030712' }} fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M1 4v6h6M23 20v-6h-6"/>
                                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                                </svg>
                              </button>
                            </div>
                            <p className="font-normal" style={{ 
                              fontSize: '18px', 
                              color: '#030712', 
                              letterSpacing: '-0.4px' 
                            }}>
                              AI can make mistakes. Please double-check responses.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input area */}
                <div className="bg-white border flex flex-col gap-4 px-4 py-3 rounded-3xl" style={{ borderColor: '#4e81ee' }}>
                  <textarea
                    className="w-full border-none outline-none font-normal resize-none bg-transparent"
                    style={{ 
                      fontSize: '18px', 
                      color: '#aeb1b6', 
                      letterSpacing: '-0.4px' 
                    }}
                    placeholder="Ask anything..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    rows={3}
                  />
                  
                  <div className="flex gap-2 items-center justify-end">
                    <div className="flex items-center gap-1">
                      <select
                        className="font-normal border-none outline-none bg-transparent cursor-pointer"
                        style={{ 
                          fontSize: '16px', 
                          color: '#424855', 
                          letterSpacing: '-0.25px' 
                        }}
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                      >
                        <option value="ChatGPT">ChatGPT</option>
                        <option value="Llama">Llama</option>
                        <option value="GPT-4">GPT-4</option>
                      </select>
                      <div className="w-6 h-6">
                        <svg className="w-6 h-6" style={{ color: '#aeb1b6' }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M7 10l5 5 5-5z"/>
                        </svg>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleSubmit}
                      className="flex items-center justify-center p-3 rounded-full"
                      style={{ backgroundColor: '#4e81ee' }}
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
              </div>
            )}
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
    </div>
  );
}

export default ChatInterface;
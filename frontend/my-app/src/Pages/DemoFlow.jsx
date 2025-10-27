import React, { useState } from 'react';

const DemoFlow = () => {
  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [plan, setPlan] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');

  const steps = [
    {
      title: '1. Create Session',
      description: 'User initiates learning session',
      action: async () => {
        try {
          const res = await fetch('/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'studying' })
          });
          const data = await res.json();
          setSessionId(data.data.id);
          setStep(1);
        } catch (err) {
          console.error('Session creation failed:', err);
        }
      }
    },
    {
      title: '2. Assessment & Plan Generation',
      description: 'AI analyzes goals and creates personalized plan',
      action: async () => {
        try {
          // Create a mock plan for demo
          const mockPlan = {
            topic: 'React Hooks',
            chatTitle: 'Learn React Hooks',
            plan: [
              {
                id: '1',
                title: 'Introduction to useState',
                points: 20,
                targets: ['Understand state management', 'Learn useState API']
              },
              {
                id: '2',
                title: 'Working with useEffect',
                points: 30,
                targets: ['Handle side effects', 'Cleanup functions']
              },
              {
                id: '3',
                title: 'Building Forms with Hooks',
                points: 25,
                targets: ['Form state', 'Validation']
              },
              {
                id: '4',
                title: 'Custom Hooks',
                points: 25,
                targets: ['Creating reusable hooks', 'Extracting logic']
              }
            ]
          };
          
          setPlan(mockPlan);
          setStep(2);
        } catch (err) {
          console.error('Assessment failed:', err);
        }
      }
    },
    {
      title: '3. Learning Interaction',
      description: 'Chat with AI tutor based on personalized plan',
      action: () => {
        // Already at step 2, no action needed
      }
    }
  ];

  const sendChatMessage = async () => {
    if (!inputMsg.trim()) return;
    
    const userMsg = inputMsg;
    setInputMsg('');
    
    // Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    
    // Simulate AI response (for demo)
    setTimeout(() => {
      const aiResponse = `Great question! Let me explain that concept step by step.
      
In React, useState is a hook that lets you add state to functional components. Here's an example:

\`\`\`javascript
const [count, setCount] = useState(0);
\`\`\`

When you call useState(0), it initializes the state to 0 and returns an array where:
- \`count\` is the current state value
- \`setCount\` is a function to update the state

What would you like to know more about?`;
      
      setChatMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    }, 1000);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>📚 Learning Flow Demo</h1>
      <p style={{ color: '#666', marginBottom: '30px', fontSize: '16px' }}>
        Interactive demonstration of the complete learning journey
      </p>

      {/* Progress Steps */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        {steps.map((s, i) => (
          <div
            key={i}
            onClick={s.action}
            style={{
              flex: 1,
              padding: '20px',
              border: step >= i ? '3px solid #007bff' : '3px solid #ddd',
              borderRadius: '10px',
              background: step > i ? '#e8f5e9' : step === i ? '#e3f2fd' : 'white',
              cursor: step === i ? 'pointer' : 'default',
              textAlign: 'center',
              transition: 'all 0.3s'
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>
              {step > i ? '✅' : step === i ? '⏳' : '⭕'}
            </div>
            <strong>{s.title}</strong>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
              {s.description}
            </div>
          </div>
        ))}
      </div>

      {/* Session Info */}
      {sessionId && (
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
          <strong>✅ Session Active:</strong> {sessionId}
        </div>
      )}

      {/* Plan Display */}
      {plan && (
        <div style={{ background: '#fff5e6', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
          <h2 style={{ marginTop: 0 }}>📋 Your Learning Plan</h2>
          <div style={{ fontSize: '18px', marginBottom: '15px' }}>
            <strong>Topic:</strong> {plan.topic}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            {plan.plan.map((module, i) => (
              <div
                key={module.id}
                style={{
                  background: 'white',
                  padding: '15px',
                  borderRadius: '8px',
                  border: '2px solid #007bff'
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>
                  {i + 1}. {module.title}
                </div>
                <div style={{ color: '#666', marginBottom: '10px' }}>
                  {module.points} points
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                  {module.targets.map((target, j) => (
                    <li key={j}>{target}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Interface */}
      {plan && (
        <div style={{ background: 'white', border: '2px solid #ddd', borderRadius: '10px', padding: '20px' }}>
          <h2 style={{ marginTop: 0 }}>💬 Chat with Your Tutor</h2>
          
          <div style={{ 
            height: '400px', 
            overflowY: 'auto', 
            background: '#f9f9f9', 
            padding: '15px', 
            borderRadius: '8px',
            marginBottom: '15px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {chatMessages.length === 0 ? (
              <div style={{ color: '#999', textAlign: 'center', marginTop: '100px' }}>
                Start the conversation by asking a question about React Hooks!
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: msg.role === 'user' ? '#007bff' : '#e9ecef',
                    color: msg.role === 'user' ? 'white' : 'black',
                    maxWidth: '80%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  <strong>{msg.role === 'user' ? 'You' : 'Tutor'}:</strong><br />
                  {msg.content}
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Ask a question about React hooks..."
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '16px',
                border: '2px solid #ddd',
                borderRadius: '8px'
              }}
            />
            <button
              onClick={sendChatMessage}
              disabled={!inputMsg.trim()}
              style={{
                padding: '12px 30px',
                fontSize: '16px',
                background: inputMsg.trim() ? '#28a745' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: inputMsg.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        background: '#f0f0f0', 
        padding: '20px', 
        borderRadius: '10px', 
        marginTop: '30px',
        fontSize: '14px'
      }}>
        <strong>📖 Instructions:</strong>
        <ol style={{ marginTop: '10px', paddingLeft: '20px' }}>
          <li>Click on step 1 to create a new learning session</li>
          <li>Click on step 2 to generate a personalized learning plan</li>
          <li>Click on step 3 to start chatting with the AI tutor</li>
          <li>Ask questions about React hooks to see the AI respond</li>
        </ol>
      </div>
    </div>
  );
};

export default DemoFlow;


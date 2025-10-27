import React, { useState, useEffect } from 'react';

const SimpleTest = () => {
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const createSession = async () => {
    try {
      addLog('Creating session...');
      const res = await fetch('/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'studying' })
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.data.id);
        addLog(`Session created: ${data.data.id}`);
      }
    } catch (err) {
      addLog(`Error: ${err.message}`);
    }
  };

  const runAssessment = async () => {
    if (!sessionId) return;
    
    try {
      addLog('Running assessment...');
      const res = await fetch('/v1/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage: 'I want to learn React hooks for building interactive forms',
          mode: 'studying'
        })
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
      
      if (data.clarify) {
        addLog('Got clarification questions');
      } else if (data.plan) {
        addLog('Assessment complete! Plan generated.');
      } else {
        addLog('Assessment in progress...');
      }
    } catch (err) {
      addLog(`Error: ${err.message}`);
    }
  };

  const sendMessage = async () => {
    if (!message || !sessionId) return;
    
    try {
      addLog(`Sending: ${message}`);
      const res = await fetch('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage: message
        })
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
      addLog('Got response');
      setMessage('');
    } catch (err) {
      addLog(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px' }}>
      <h1>Simple Test (No Store)</h1>
      <div style={{ padding: '10px', background: '#f0f0f0', marginBottom: '20px', borderRadius: '5px' }}>
        <strong>Steps:</strong> 1) Create Session 2) Run Assessment 3) Send Chat Message
      </div>
      
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button 
          onClick={createSession} 
          style={{ 
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          📝 Create Session
        </button>
        
        {sessionId && (
          <button 
            onClick={runAssessment}
            style={{ 
              padding: '10px 20px',
              background: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            🎯 Run Assessment
          </button>
        )}
      </div>
      
      {sessionId && (
        <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f5e9', borderRadius: '5px' }}>
          ✅ Session: {sessionId}
        </div>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type message..."
          style={{ 
            width: '400px', 
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            fontSize: '16px'
          }}
          onKeyPress={(e) => e.key === 'Enter' && sessionId && sendMessage()}
        />
        <button 
          onClick={sendMessage} 
          disabled={!sessionId || !message.trim()} 
          style={{ 
            padding: '10px 20px', 
            marginLeft: '10px',
            background: sessionId && message.trim() ? '#28a745' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: sessionId && message.trim() ? 'pointer' : 'not-allowed',
            fontSize: '16px'
          }}
        >
          {sessionId ? '➤ Send' : '❌ No Session'}
        </button>
      </div>

      {response && (
        <div style={{ marginTop: '20px' }}>
          <h3>Response:</h3>
          <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>{response}</pre>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h3>Logs:</h3>
        <div style={{ background: '#f5f5f5', padding: '10px', height: '200px', overflow: 'auto' }}>
          {logs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      </div>
    </div>
  );
};

export default SimpleTest;


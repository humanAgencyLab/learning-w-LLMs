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
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Simple Test (No Store)</h1>
      <button onClick={createSession} style={{ padding: '10px 20px', marginBottom: '20px' }}>
        Create New Session
      </button>
      {sessionId && <div style={{ marginBottom: '20px' }}>Session: {sessionId}</div>}
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type message..."
          style={{ width: '400px', padding: '8px' }}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage} disabled={!sessionId} style={{ padding: '8px 16px', marginLeft: '10px' }}>
          Send
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


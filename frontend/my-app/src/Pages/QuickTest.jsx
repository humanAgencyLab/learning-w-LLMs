import React, { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';

const QuickTest = () => {
  const { sessionId, phase, topic, plan, messages, loading, error, sendMessage, startAssessment, clearError } = useSession();
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    addLog(`Phase: ${phase}, Session ID: ${sessionId || 'None'}`);
  }, [phase, sessionId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    addLog(`Sending: ${msg}`);
    
    try {
      if (phase === 'pre' || phase === 'assessing') {
        await startAssessment(msg);
        addLog('Assessment completed');
      } else {
        await sendMessage(msg);
        addLog('Message sent');
      }
    } catch (err) {
      addLog(`ERROR: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Quick Test</h1>
      <div style={{ marginBottom: '20px' }}>
        <div>Session ID: {sessionId || 'None'}</div>
        <div>Phase: {phase}</div>
        <div>Topic: {topic || 'None'}</div>
        <div>Plan Modules: {plan?.length || 0}</div>
        <div>Messages: {messages.length}</div>
        <div>Loading: {loading ? 'Yes' : 'No'}</div>
        {error && (
          <div style={{ color: 'red' }}>
            Error: {error}
            <button onClick={clearError}>Clear</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Messages ({messages.length})</h2>
        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '5px' }}>
              <strong>{msg.role}:</strong> {msg.content?.substring(0, 100)}...
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Logs</h2>
        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', backgroundColor: '#f5f5f5' }}>
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </div>

      <div>
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type message..."
          style={{ width: '400px', padding: '8px' }}
        />
        <button onClick={handleSend} disabled={loading} style={{ padding: '8px 16px', marginLeft: '10px' }}>
          {loading ? 'Loading...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default QuickTest;


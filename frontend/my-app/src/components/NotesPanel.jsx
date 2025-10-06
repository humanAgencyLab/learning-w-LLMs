import React, { useState, useEffect, useCallback } from 'react';
import { updateSessionNotes } from '../lib/sessionApi';
import './NotesPanel.css';

function NotesPanel({ sessionId, isOpen, onToggle }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);

  // Debounced save function
  const debouncedSave = useCallback((notesToSave) => {
    const timeoutId = setTimeout(async () => {
      if (!sessionId || !notesToSave.trim()) return;
      
      setSaving(true);
      setError(null);
      try {
        await updateSessionNotes(sessionId, notesToSave);
        setLastSaved(new Date());
      } catch (err) {
        console.error('Failed to save notes:', err);
        setError('Failed to save notes');
      } finally {
        setSaving(false);
      }
    }, 1000); // 1 second delay
    
    return () => clearTimeout(timeoutId);
  }, [sessionId]);

  // Load notes when session changes
  useEffect(() => {
    if (sessionId) {
      // In a real app, you'd load existing notes here
      // For now, we'll start with empty notes
      setNotes('');
      setLastSaved(null);
      setError(null);
    }
  }, [sessionId]);

  // Save notes when they change
  useEffect(() => {
    if (notes.trim() && sessionId) {
      debouncedSave(notes);
    }
  }, [notes, debouncedSave, sessionId]);

  const handleNotesChange = (e) => {
    setNotes(e.target.value);
  };

  const formatLastSaved = (date) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  if (!isOpen) return null;

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h3>Session Notes</h3>
        <button 
          className="close-btn"
          onClick={onToggle}
          aria-label="Close notes panel"
        >
          ×
        </button>
      </div>
      
      <div className="notes-content">
        <div className="notes-status">
          {saving && <span className="saving">Saving...</span>}
          {lastSaved && !saving && (
            <span className="saved">Saved {formatLastSaved(lastSaved)}</span>
          )}
          {error && <span className="error">Save failed</span>}
        </div>
        
        <textarea
          value={notes}
          onChange={handleNotesChange}
          placeholder="Add your notes here... They'll be saved automatically."
          className="notes-textarea"
          disabled={!sessionId}
        />
        
        {!sessionId && (
          <div className="no-session">
            Start a conversation to add notes
          </div>
        )}
      </div>
    </div>
  );
}

export default NotesPanel;


import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as chatApi from '../../lib/instructorChatApi';

function ToolCallSummary({ toolCalls }) {
  if (!toolCalls?.length) return null;
  return (
    <details className="text-[10px] text-gray-400 mt-1">
      <summary className="cursor-pointer">{toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}</summary>
      <ul className="mt-1 space-y-0.5">
        {toolCalls.map((tc, i) => (
          <li key={i} className="font-mono">
            <span className={tc.error ? 'text-rose-500' : 'text-indigo-600'}>
              {tc.name}
            </span>
            {tc.error ? ` — error: ${tc.error}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Message({ role, content, toolCalls }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {content}
        {!isUser && <ToolCallSummary toolCalls={toolCalls} />}
      </div>
    </div>
  );
}

export default function InstructorChatPanel() {
  const params = useParams();
  const courseId = params.courseId || null;
  const studentId = params.studentId || null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [includeSynthetic, setIncludeSynthetic] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Listen for `instructor:openChat` events dispatched by AgentBriefingCard /
  // InsightCards' "Ask follow-up" & "Ask about this" buttons. The detail
  // payload carries a `prefill` string that pre-populates the input so the
  // professor can tweak-and-send rather than invent a prompt from scratch.
  useEffect(() => {
    function onOpen(e) {
      setOpen(true);
      const prefill = e?.detail?.prefill;
      if (typeof prefill === 'string' && prefill.trim()) {
        setInput(prefill);
        // Focus after the panel mounts + input renders.
        window.setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    window.addEventListener('instructor:openChat', onOpen);
    return () => window.removeEventListener('instructor:openChat', onOpen);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await chatApi.getInstructorChatHistory({ courseId });
      setMessages(res?.data?.messages || []);
    } catch (e) {
      setError(e?.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const onSend = async (e) => {
    e?.preventDefault?.();
    if (!input.trim() || sending) return;
    const userText = input.trim();
    setInput('');
    setSending(true);
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    try {
      const res = await chatApi.sendInstructorChatMessage({
        message: userText,
        courseId,
        studentId,
        includeSynthetic,
      });
      const { reply, toolCalls } = res?.data || {};
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply || '(no reply)', toolCalls },
      ]);
    } catch (e) {
      setError(e?.message || 'Failed to send');
      setMessages((prev) => prev.slice(0, -1));
      setInput(userText);
    } finally {
      setSending(false);
    }
  };

  const onClear = async () => {
    if (!window.confirm('Clear this conversation?')) return;
    try {
      await chatApi.clearInstructorChatHistory({ courseId });
      setMessages([]);
    } catch (e) {
      setError(e?.message || 'Failed to clear');
    }
  };

  const scopeLabel = courseId
    ? studentId
      ? 'Course + student scope'
      : 'Course scope'
    : 'All courses';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-3 rounded-full shadow-lg flex items-center gap-2"
        title="Ask the insights assistant"
      >
        <span>Insights Assistant</span>
        <span className="text-[10px] bg-indigo-500 px-2 py-0.5 rounded-full">{scopeLabel}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[95vw] h-[540px] max-h-[85vh] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="font-semibold text-gray-900 text-sm truncate">Insights Assistant</span>
          <span className="text-[10px] text-gray-500 truncate">· {scopeLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-rose-600 px-2 py-0.5"
            title="Clear history"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700 w-6 h-6 rounded flex items-center justify-center"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 text-[11px]">
        <label className="flex items-center gap-1.5 text-gray-600">
          <input
            type="checkbox"
            checked={includeSynthetic}
            onChange={(e) => setIncludeSynthetic(e.target.checked)}
          />
          Include synthetic cohort
        </label>
        <span className="text-gray-400 truncate ml-2">
          {courseId ? `course:${String(courseId).slice(-6)}` : 'all courses'}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {loading && <div className="text-xs text-gray-400">Loading history…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-xs text-gray-500 text-center p-4">
            <p className="text-gray-700 font-medium">Hi — I'm your Insights Assistant.</p>
            <p className="mt-1">
              I only cite numbers from this course's data. Ask me to list strugglers, compare topics, or summarize a student.
            </p>
            <ul className="mt-3 text-left space-y-1 text-gray-500">
              <li>• "Which students are struggling in this course?"</li>
              <li>• "What's the hardest milestone?"</li>
              <li>• "Who is most at risk right now?"</li>
              <li>• "Break down topic difficulty by persona"</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} toolCalls={m.toolCalls} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg text-xs">Thinking…</div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 border-t border-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={onSend} className="p-2 border-t border-gray-200 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about courses or students…"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg disabled:bg-gray-300"
        >
          Send
        </button>
      </form>
    </div>
  );
}

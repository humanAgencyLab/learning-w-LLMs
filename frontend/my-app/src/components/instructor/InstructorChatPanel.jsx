import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as chatApi from '../../lib/instructorChatApi';

function ToolCallSummary({ toolCalls }) {
  if (!toolCalls?.length) return null;
  return (
    <details className="text-[10px] text-ink-300 mt-1">
      <summary className="cursor-pointer">{toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}</summary>
      <ul className="mt-1 space-y-0.5">
        {toolCalls.map((tc, i) => (
          <li key={i} className="font-mono">
            <span className={tc.error ? 'text-risk-critical' : 'text-assistant'}>
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
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-brand-tint text-ink-900'
            : 'bg-surface-chip text-ink-600'
        }`}
      >
        {content}
        {!isUser && <ToolCallSummary toolCalls={toolCalls} />}
      </div>
    </div>
  );
}

// Static pilot suggestions — all answerable by the shipped D5 tools.
const TRY_ASKING = [
  'Which 3 students are most at risk right now?',
  'Which topic has the lowest pass rate?',
  "What's the hardest milestone?",
];

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

  const seedSuggestion = (text) => {
    setInput(text);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-assistant hover:bg-assistant-deep text-white text-sm font-semibold px-4 py-3 rounded-full shadow-assistant flex items-center gap-2 transition-colors"
        title="Ask the insights assistant"
      >
        <span>Insights Assistant</span>
        <span className="text-[10px] bg-assistant-deep px-2 py-0.5 rounded-full">{scopeLabel}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[95vw] h-[540px] max-h-[85vh] bg-surface border border-hairline rounded-2xl shadow-popover flex flex-col animate-popIn">
      {/* Header */}
      <div className="flex items-center gap-2.5 p-4 py-3 border-b border-hairline-soft">
        <span className="w-6 h-6 rounded-lg bg-assistant-tint text-assistant flex items-center justify-center shrink-0">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
        </span>
        <span className="font-bold text-ink-900 text-sm flex-1 truncate">Insights Assistant</span>
        <span className="bg-surface-chip text-ink-500 rounded-md px-2 py-1 text-[10px] font-semibold whitespace-nowrap">{scopeLabel}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-ink-400 hover:text-risk-critical px-1.5 py-0.5 font-medium"
          title="Clear history"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-300 hover:text-ink-900 w-6 h-6 rounded flex items-center justify-center text-lg leading-none"
          aria-label="Close assistant"
        >
          ×
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 border-b border-hairline-soft bg-surface-subtle text-[11px]">
        <label className="flex items-center gap-1.5 text-ink-500">
          <input
            type="checkbox"
            checked={includeSynthetic}
            onChange={(e) => setIncludeSynthetic(e.target.checked)}
          />
          Include synthetic cohort
        </label>
        <span className="text-ink-200 truncate ml-2 font-mono">
          {courseId ? `course:${String(courseId).slice(-6)}` : 'all courses'}
        </span>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 text-sm">
        {loading && <div className="text-xs text-ink-300">Loading history…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-xs text-ink-500 p-1">
            <p className="text-ink-900 font-medium">Hi — I&apos;m your Insights Assistant.</p>
            <p className="mt-1 leading-relaxed">
              I only cite numbers from this course&apos;s data. Ask me to list at-risk students, compare topics, or summarize a student.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} toolCalls={m.toolCalls} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-chip text-ink-400 px-3 py-2 rounded-2xl text-xs">Thinking…</div>
          </div>
        )}

        {/* Try asking — seeds the input; static pilot suggestions */}
        {!loading && !sending && (
          <div>
            <p className="font-mono uppercase text-[9.5px] tracking-wide text-ink-150 font-bold mt-3.5 mb-2">Try asking</p>
            <div className="flex flex-col gap-1.5">
              {TRY_ASKING.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => seedSuggestion(s)}
                  className="bg-surface-subtle border border-hairline rounded-lg px-3 py-2 text-left text-xs text-ink-600 hover:border-brand-tintBorder hover:bg-surface transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-1.5 text-xs text-risk-critical bg-risk-criticalTint border-t border-risk-criticalRule">
          {error}
        </div>
      )}

      {/* Footer input */}
      <form onSubmit={onSend} className="p-3.5 border-t border-hairline-soft flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about courses or students…"
          className="flex-1 bg-surface border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-assistant hover:bg-assistant-deep rounded-lg w-9 h-9 flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0 transition-colors"
          title="Send"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}

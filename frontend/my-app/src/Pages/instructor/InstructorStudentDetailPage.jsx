import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import MessageContent from '../../components/chat/MessageContent';
import RiskTrendCard from '../../components/instructor/RiskTrendCard';

function formatDateTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function Pill({ children, tone = 'gray', title }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone] || tones.gray}`}
    >
      {children}
    </span>
  );
}

function MessagesViewer({ courseId, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [fromEnd, setFromEnd] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!courseId || !sessionId) return;
    setMessages([]);
    setFromEnd(0);
    setHasMore(false);
    setTotalCount(null);
    setError(null);
    (async () => {
      setLoading(true);
      try {
        const res = await instructorApi.getInstructorSessionMessages(courseId, sessionId, { fromEnd: 0, limit: 20 });
        if (!cancelled) {
          setMessages(res.data?.messages || []);
          setHasMore(!!res.data?.hasMore);
          setTotalCount(res.data?.totalCount ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, sessionId]);

  const loadOlder = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const nextFromEnd = fromEnd + 20;
      const res = await instructorApi.getInstructorSessionMessages(courseId, sessionId, { fromEnd: nextFromEnd, limit: 20 });
      const older = res.data?.messages || [];
      setMessages((prev) => [...older, ...prev]);
      setFromEnd(nextFromEnd);
      setHasMore(!!res.data?.hasMore);
      setTotalCount(res.data?.totalCount ?? totalCount);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) return null;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Session messages</p>
          <p className="text-xs text-gray-500 truncate">
            {totalCount != null ? `${totalCount} messages` : 'Messages'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadOlder}
          disabled={loading || !hasMore}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMore ? (loading ? 'Loading…' : 'Load older') : 'Up to date'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      <div className="max-h-[520px] overflow-auto px-4 py-4 bg-gray-50/50">
        {messages.length === 0 && !loading ? (
          <div className="text-center text-sm text-gray-500 py-10">No messages yet.</div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, idx) => (
              <div key={m.id || m._id || `${m.role}-${idx}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${
                  m.role === 'user'
                    ? 'bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900'
                    : 'bg-transparent text-gray-900'
                }`}>
                  {m.role === 'assistant' ? (
                    <MessageContent content={m.content} isLastMessage={idx === messages.length - 1} />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  )}
                  {m.timestamp && (
                    <div className="mt-2 text-[11px] text-gray-400">
                      {formatDateTime(m.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IconCheck() {
  return (
    <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconChevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Group attempts to the highest attemptNo per moduleId. Revision attempts are
// not part of a module, so they always pass through individually.
function lastAttemptPerModule(attempts) {
  const byModule = new Map();
  const revisions = [];
  for (const a of attempts) {
    if (a.isRevision) { revisions.push(a); continue; }
    const key = a.moduleId || '(none)';
    const cur = byModule.get(key);
    if (!cur || (a.attemptNo || 0) > (cur.attemptNo || 0)) byModule.set(key, a);
  }
  const kept = [...byModule.values(), ...revisions];
  kept.sort((x, y) => {
    const tx = x.submittedAt ? new Date(x.submittedAt).getTime() : 0;
    const ty = y.submittedAt ? new Date(y.submittedAt).getTime() : 0;
    return ty - tx;
  });
  return kept;
}

function QuizAttemptCard({ attempt, open, onToggle }) {
  const title = attempt.isRevision
    ? `Revision quiz${attempt.revisionTopic ? ` · ${attempt.revisionTopic}` : ''}`
    : `Module ${attempt.moduleId}`;
  const passed = !!attempt.passed;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-500">Attempt #{attempt.attemptNo}</p>
        </div>
        <Pill tone={passed ? 'green' : 'red'}>{attempt.scorePct}%</Pill>
        <Pill tone="gray">{formatDateTime(attempt.submittedAt)}</Pill>
        <IconChevron open={open} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-4 border-t border-gray-100">
          {(attempt.items || []).length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No question detail recorded for this attempt.</p>
          ) : (
            attempt.items.map((item, qi) => {
              const ans = (attempt.answers || []).find((a) => a.id === item.id);
              const userIndex = ans ? ans.userIndex : null;
              const answered = userIndex != null;
              return (
                <div key={item.id || qi}>
                  <p className="text-sm font-semibold text-gray-900">
                    <span className="text-gray-400 mr-1">{qi + 1}.</span>{item.text}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {(item.options || []).map((opt, oi) => {
                      const isCorrect = oi === item.correctIndex;
                      const isSelected = answered && userIndex === oi;
                      let cls = 'border-gray-200 bg-gray-50 text-gray-700';
                      let icon = <span className="w-3.5 h-3.5 inline-block" />;
                      if (isCorrect) {
                        cls = 'border-green-400 bg-green-50 text-green-800';
                        icon = <IconCheck />;
                      } else if (isSelected) {
                        cls = 'border-red-400 bg-red-50 text-red-800';
                        icon = <IconX />;
                      }
                      return (
                        <div
                          key={oi}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-r border-l-2 text-sm ${cls}`}
                        >
                          <span className="flex-shrink-0">{icon}</span>
                          <span className="flex-1 min-w-0">{opt}</span>
                          {isSelected && (
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">
                              their pick
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!answered && (
                    <div className="mt-1.5">
                      <Pill tone="gray">Not answered</Pill>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function QuizzesViewer({ courseId, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'lastPerModule'
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    if (!courseId || !sessionId) return;
    setAttempts([]);
    setTotalCount(null);
    setError(null);
    setExpanded(new Set());
    (async () => {
      setLoading(true);
      try {
        const res = await instructorApi.getInstructorSessionQuizzes(courseId, sessionId);
        if (!cancelled) {
          setAttempts(res.data?.attempts || []);
          setTotalCount(res.data?.totalCount ?? 0);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, sessionId]);

  const visible = useMemo(
    () => (filterMode === 'lastPerModule' ? lastAttemptPerModule(attempts) : attempts),
    [attempts, filterMode]
  );

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!sessionId) return null;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Quiz attempts</p>
          <p className="text-xs text-gray-500 truncate">
            {totalCount != null ? `${totalCount} submitted` : 'Quizzes'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 flex-shrink-0">
          {[
            { k: 'all', label: 'All attempts' },
            { k: 'lastPerModule', label: 'Last per module' },
          ].map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setFilterMode(opt.k)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMode === opt.k ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      <div className="max-h-[520px] overflow-auto px-4 py-4 bg-gray-50/50">
        {loading && attempts.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">Loading quizzes…</div>
        ) : totalCount === 0 ? (
          <div className="text-center text-sm text-gray-500 py-10">No submitted quizzes for this session yet.</div>
        ) : (
          <div className="space-y-2">
            {visible.map((a) => (
              <QuizAttemptCard
                key={a.id}
                attempt={a}
                open={expanded.has(a.id)}
                onToggle={() => toggle(a.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Tabbed wrapper over the per-session viewers. Chat is the default; the chosen
// tab persists in local state (not the URL).
function SessionViewer({ courseId, sessionId }) {
  const [tab, setTab] = useState('chat'); // 'chat' | 'quizzes'
  if (!sessionId) return null;
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        {[
          { k: 'chat', label: 'Chat' },
          { k: 'quizzes', label: 'Quizzes' },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              tab === t.k ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'chat'
        ? <MessagesViewer courseId={courseId} sessionId={sessionId} />
        : <QuizzesViewer courseId={courseId} sessionId={sessionId} />}
    </div>
  );
}

// notesScope: null = course-wide, string = courseTopicId
// selectedTopicId: the topic whose session is currently open (used to restore topic scope from tab)
function NotesPanel({ courseId, studentId, notesScope, scopeLabel, selectedTopicId, onScopeChange }) {
  const [notes, setNotes] = useState({ tags: [], note: '', updatedAt: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reload notes whenever scope changes
  useEffect(() => {
    let cancelled = false;
    setNotes({ tags: [], note: '', updatedAt: null });
    setError(null);
    (async () => {
      setLoading(true);
      try {
        const res = await instructorApi.getStudentNotes(courseId, studentId, { courseTopicId: notesScope });
        if (!cancelled) {
          setNotes({ tags: res.data?.tags || [], note: res.data?.note || '', updatedAt: res.data?.updatedAt || null });
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, studentId, notesScope]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await instructorApi.upsertStudentNotes(courseId, studentId, {
        courseTopicId: notesScope,
        tags: notes.tags,
        note: notes.note,
      });
      setNotes((prev) => ({ ...prev, updatedAt: res.data?.updatedAt || prev.updatedAt }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isCourseWide = notesScope === null;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Instructor notes</p>
        {/* Scope switcher */}
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => onScopeChange(null)}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              isCourseWide
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Course note
          </button>
          <button
            type="button"
            onClick={() => { if (selectedTopicId) onScopeChange(selectedTopicId); }}
            disabled={!selectedTopicId}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              !isCourseWide
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {scopeLabel ? `Topic note` : 'Topic note'}
          </button>
        </div>
        {scopeLabel && (
          <p className="mt-1 text-[11px] text-gray-400 truncate" title={scopeLabel}>
            {isCourseWide ? `Topic: ${scopeLabel}` : scopeLabel}
          </p>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      <div className={`p-4 space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma separated)</label>
          <input
            value={notes.tags.join(', ')}
            onChange={(e) => {
              const next = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 20);
              setNotes((prev) => ({ ...prev, tags: next }));
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            placeholder="at-risk, needs help, strong"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
          <textarea
            value={notes.note}
            onChange={(e) => setNotes((prev) => ({ ...prev, note: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            placeholder={isCourseWide ? 'Write a course-wide note about this student…' : 'Write a note about this topic session…'}
            maxLength={4000}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            {notes.updatedAt ? `Saved ${formatDateTime(notes.updatedAt)}` : 'Not saved yet'}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InstructorStudentDetailPage() {
  const { courseId, studentId } = useParams();
  const location = useLocation();
  // Optional context when navigated here from the Insights at-risk panel (B2).
  // Absent on direct navigation (e.g. Student Progress → Monitor), so the
  // banner is purely additive for the at-risk flow.
  const incomingAtRiskFlags = location.state?.atRiskFlags || null;
  const [atRiskBannerDismissed, setAtRiskBannerDismissed] = useState(false);
  const [detail, setDetail] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // notesScope: null = course-wide, courseTopicId string = topic-specific
  const [notesScope, setNotesScope] = useState(null);

  // Class Context override (Step 7)
  const [classContext, setClassContext] = useState(null);
  const [savingContext, setSavingContext] = useState(false);
  const [contextToast, setContextToast] = useState('');
  useEffect(() => { setClassContext(detail?.classContext ?? null); }, [detail]);
  const saveClassContext = async (value) => {
    const next = value || null;
    setClassContext(next);
    setSavingContext(true);
    try {
      await instructorApi.updateClassContext(courseId, studentId, next);
      setContextToast(
        next === 'doing_well_in_class' ? 'Saved — doing well in class'
          : next === 'confirmed_at_risk' ? 'Saved — confirmed at-risk'
            : 'Class context cleared',
      );
    } catch (e) {
      setContextToast('Failed to save');
    } finally {
      setSavingContext(false);
      setTimeout(() => setContextToast(''), 2500);
    }
  };

  const riskFlags = detail?.summary?.riskFlags || [];
  const topics = useMemo(() => (detail?.topics || []), [detail]);

  const selectedTopicTitle = useMemo(
    () => topics.find((t) => t.courseTopicId === selectedTopicId)?.topicTitle || null,
    [topics, selectedTopicId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [dRes, cRes] = await Promise.all([
          instructorApi.getStudentDetail(courseId, studentId),
          instructorApi.getCourse(courseId),
        ]);
        if (!cancelled) {
          setDetail(dRes.data);
          setCourseName(cRes.data?.course?.title || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, studentId]);

  // When a topic session is selected, switch notes scope to that topic
  const handleViewSession = (topicId, sessionId) => {
    setSelectedTopicId(topicId);
    setSelectedSessionId(sessionId);
    setNotesScope(topicId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading student…</div>
      </div>
    );
  }

  const student = detail?.student;
  if (!student) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <Link to={`/instructor/courses/${courseId}/students`} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to students
        </Link>
        <div className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
          {error || 'Student not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link to={`/instructor/courses/${courseId}/students`} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {courseName || 'Back to students'}
      </Link>

      {/* B2: context banner when arriving from the Insights at-risk panel.
          Dismissible for the session; never shown on direct navigation. */}
      {incomingAtRiskFlags && incomingAtRiskFlags.length > 0 && !atRiskBannerDismissed && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-rose-800">You opened this student from the at-risk panel.</p>
            {detail?.risk && (
              <p className="text-sm text-rose-800 mt-0.5">
                Risk level: <span className="font-semibold capitalize">{detail.risk.riskLevel}</span> ({detail.risk.riskScore}/100)
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-rose-700">Flags:</span>
              {incomingAtRiskFlags.map((f) => (
                <Pill key={f} tone="red">{String(f).replace(/_/g, ' ').toUpperCase()}</Pill>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAtRiskBannerDismissed(true)}
            className="flex-shrink-0 px-1 text-lg leading-none text-rose-400 hover:text-rose-600"
            title="Dismiss"
            aria-label="Dismiss at-risk banner"
          >
            &times;
          </button>
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{student.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Joined {new Date(student.joinedAt).toLocaleDateString()}
            {student.lastActiveAt && <> · Last active {formatDateTime(student.lastActiveAt)}</>}
          </p>
          {riskFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {riskFlags.map((rf, idx) => (
                <Pill key={idx} tone="red">
                  {rf.type === 'inactive' ? `Inactive ${rf.daysInactive}d` : rf.type}
                </Pill>
              ))}
            </div>
          )}
          {/* Persistence readout (Step 3) — positive signal, Monitor only.
              OUT OF SCOPE: engagement-quality export / bonus grading is post-pilot. */}
          {detail?.risk?.persistence_score != null && (
            <p className="text-xs text-emerald-700 mt-2" title="Of the topics this student had to retry, the share they eventually passed">
              Persistence: {detail.risk.persistence_score}/100 — {detail.risk.persistence_score >= 60 ? 'eventually passes most retries' : 'rarely recovers after a failed attempt'}
            </p>
          )}
          {/* Class context override (Step 7) — instructor's classroom knowledge */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-500">Class context:</label>
            <select
              value={classContext || ''}
              onChange={(e) => saveClassContext(e.target.value || null)}
              disabled={savingContext}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
              title="Encode what you know from class that the platform can't see"
            >
              <option value="">Not set</option>
              <option value="doing_well_in_class">Doing well in class — override at-risk flag</option>
              <option value="confirmed_at_risk">Confirmed at-risk in class — validates platform signal</option>
            </select>
            {contextToast && <span className="text-xs text-green-600">{contextToast}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Pill tone="blue">{detail.summary.completedTopics}/{detail.summary.totalTopics} topics</Pill>
          <Pill tone="gray">{detail.summary.totalPoints} pts</Pill>
          {detail.summary.topicPassRate != null && (
            <Pill
              tone={detail.summary.topicPassRate < 60 ? 'red' : 'green'}
              title="Percentage of this course's topics where the student passed the final quiz"
            >
              {detail.summary.topicPassRate}% topic pass rate
            </Pill>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Topics + sessions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Topics</p>
              <p className="text-xs text-gray-500">Pick a topic to view the latest session messages.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {topics.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500 text-center">No sessions yet.</div>
              ) : (
                topics.map((t) => (
                  <div key={t.courseTopicId} className="px-4 py-3 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.topicTitle}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t.phase} · {t.progressPct}% · Updated {formatDateTime(t.updatedAt)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Modules {t.passedModules}/{t.moduleCount} · Milestones {t.completedMilestones}/{t.totalMilestones}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewSession(t.courseTopicId, t.sessionId)}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        selectedSessionId === t.sessionId ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      View session
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <SessionViewer courseId={courseId} sessionId={selectedSessionId} />
        </div>

        {/* Notes panel + risk trend */}
        <div className="space-y-4">
          <NotesPanel
            courseId={courseId}
            studentId={studentId}
            notesScope={notesScope}
            scopeLabel={selectedTopicTitle}
            selectedTopicId={selectedTopicId}
            onScopeChange={setNotesScope}
          />
          <RiskTrendCard courseId={courseId} studentId={studentId} />
        </div>
      </div>
    </div>
  );
}

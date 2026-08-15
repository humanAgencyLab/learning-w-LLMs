import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import MessageContent from '../../components/chat/MessageContent';
import RiskTrendCard from '../../components/instructor/RiskTrendCard';
import RefusalLogPanel from '../../components/instructor/RefusalLogPanel';
import { flagLabel } from '../../components/instructor/riskLevel';
import useToastStore from '../../state/toastStore';

// PR-7 tier visuals (avatar tint + kicker/score color) and factor-chip styles —
// same palette as the Students table and the shared StudentRow.
const TIER_VISUAL = {
  critical: { label: 'Critical', glyph: '▲', tint: 'bg-risk-criticalTint', text: 'text-risk-critical' },
  high: { label: 'High', glyph: '●', tint: 'bg-risk-highTint', text: 'text-risk-high' },
  watch: { label: 'Watch', glyph: '●', tint: 'bg-risk-watchTint', text: 'text-risk-watch' },
  healthy: { label: 'Healthy', glyph: '●', tint: 'bg-approve-tint', text: 'text-approve' },
};
const FACTOR_STYLES = {
  no_engagement: 'bg-risk-criticalTint text-risk-critical',
  low_pass_rate: 'bg-risk-highTint text-risk-high',
  low_quiz_score: 'bg-amber-50 text-amber-700',
  stuck_topic: 'bg-violet-50 text-violet-700',
};

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
  // 3a: the module TITLE, not the raw slug. This rendered "Module mod_intro_1"
  // for every student because no title was ever sent; the route now joins the
  // session plan. The slug remains the last-resort fallback.
  const moduleLabel = attempt.moduleTitle
    ? `Module ${attempt.moduleIndex ?? ''}${attempt.moduleIndex ? ': ' : ''}${attempt.moduleTitle}`
    : `Module ${attempt.moduleId}`;
  const title = attempt.isRevision
    ? `Revision quiz${attempt.revisionTopic ? ` · ${attempt.revisionTopic}` : ''}`
    : moduleLabel;
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
  const showToast = useToastStore((s) => s.showToast);

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
      showToast('Note saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isCourseWide = notesScope === null;

  return (
    <div className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
      <p className="text-sm font-bold text-ink-900 mb-3">Instructor notes</p>
      {/* Scope switcher — topic notes are REAL (course + topic scoped endpoint);
          the Topic tab is disabled only until a topic session is selected. */}
      <div className="inline-flex bg-surface-chip rounded-lg p-1 gap-0.5 mb-3">
        <button
          type="button"
          onClick={() => onScopeChange(null)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
            isCourseWide ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          Course note
        </button>
        <button
          type="button"
          onClick={() => { if (selectedTopicId) onScopeChange(selectedTopicId); }}
          disabled={!selectedTopicId}
          title={selectedTopicId ? undefined : 'Open a topic session first to write a topic-scoped note'}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
            !isCourseWide ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          Topic note
        </button>
      </div>
      {scopeLabel && (
        <p className="text-[11px] text-ink-300 truncate -mt-1 mb-2" title={scopeLabel}>
          {isCourseWide ? `Topic: ${scopeLabel}` : scopeLabel}
        </p>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 text-sm text-risk-critical bg-risk-criticalTint rounded-lg">
          {error}
        </div>
      )}

      <div className={`space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1">Tags (comma separated)</label>
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
            className="w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            placeholder="at-risk, needs help, strong"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1">Note</label>
          <textarea
            value={notes.note}
            onChange={(e) => setNotes((prev) => ({ ...prev, note: e.target.value }))}
            className="w-full border border-hairline-strong rounded-lg px-3 py-2.5 text-sm text-ink-900 leading-relaxed min-h-24 resize-y focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            placeholder={isCourseWide ? 'Write a course-wide note about this student…' : 'Write a note about this topic session…'}
            maxLength={4000}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-ink-300">
            {notes.updatedAt ? `Saved ${formatDateTime(notes.updatedAt)}` : 'Not saved yet'}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-pressed text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save note'}
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
  const sessionViewerRef = useRef(null);
  const handleViewSession = (topicId, sessionId) => {
    setSelectedTopicId(topicId);
    setSelectedSessionId(sessionId);
    setNotesScope(topicId);
    // The replay now renders full-width BELOW the two-column body — bring it
    // into view so the click has visible feedback on long topic lists.
    window.setTimeout(() => sessionViewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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

  const tier = TIER_VISUAL[detail?.risk?.riskLevel] || TIER_VISUAL.healthy;
  const riskV2 = detail?.risk || null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link
        to={`/instructor/courses/${courseId}/students`}
        title={courseName ? `Back to ${courseName} students` : undefined}
        className="flex items-center gap-1.5 text-brand text-sm font-semibold hover:underline w-fit"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6" /></svg>
        Back to students
      </Link>

      {/* B2: context banner when arriving from the Insights at-risk panel.
          Dismissible for the session; never shown on direct navigation. */}
      {incomingAtRiskFlags && incomingAtRiskFlags.length > 0 && !atRiskBannerDismissed && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-risk-criticalBorder bg-risk-criticalTint px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-risk-critical">You opened this student from the at-risk panel.</p>
            {detail?.risk && (
              <p className="text-sm text-risk-critical mt-0.5">
                Risk level: <span className="font-semibold capitalize">{detail.risk.riskLevel}</span> ({detail.risk.riskScore}/100)
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-risk-critical">Flags:</span>
              {incomingAtRiskFlags.map((f) => (
                <Pill key={f} tone="red">{String(f).replace(/_/g, ' ').toUpperCase()}</Pill>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAtRiskBannerDismissed(true)}
            className="flex-shrink-0 px-1 text-lg leading-none text-risk-criticalAccent hover:text-risk-critical"
            title="Dismiss"
            aria-label="Dismiss at-risk banner"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header — avatar · name/meta/chips · tier + score */}
      <div className="mt-4 flex items-start gap-4 animate-fadeIn">
        <span className={`w-[52px] h-[52px] rounded-full ${tier.tint} ${tier.text} flex items-center justify-center font-bold text-lg flex-shrink-0`}>
          {(student.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('')}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-[25px] font-bold text-ink-900 tracking-tight leading-tight">{student.name}</h1>
          <p className="text-xs text-ink-300 mt-1">
            Joined {new Date(student.joinedAt).toLocaleDateString()}
            {student.lastActiveAt && <> · Last active {formatDateTime(student.lastActiveAt)}</>}
            {' · '}{detail.summary.completedTopics} of {detail.summary.totalTopics} topics · {detail.summary.totalPoints} pts
            {detail.summary.topicPassRate != null && <> · {detail.summary.topicPassRate}% topic pass</>}
          </p>
          <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
            {(riskV2?.flags || []).map((f) => (
              <span key={f} className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${FACTOR_STYLES[f] || 'bg-surface-chip text-ink-500'}`}>
                {flagLabel(f)}
              </span>
            ))}
            {riskFlags.map((rf, idx) => (
              <span key={`legacy-${idx}`} className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-surface-chip text-ink-500">
                {rf.type === 'inactive' ? `Inactive ${rf.daysInactive}d` : rf.type}
              </span>
            ))}
            {riskV2?.persistence_score != null && (
              <span
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-approve-tint text-approve"
                title="Of the topics this student had to retry, the share they eventually passed"
              >
                Persistence {riskV2.persistence_score}/100
              </span>
            )}
          </div>
          {/* Class context override (Risk v2 Step 7) — HIDDEN for the study
              deployment (unused in the protocol; the "Not set" dropdown only
              confused pilots). Flip `false` to re-enable; the state and
              saveClassContext handler stay wired. */}
          {false && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <label className="text-xs text-ink-400">Class context:</label>
            <select
              value={classContext || ''}
              onChange={(e) => saveClassContext(e.target.value || null)}
              disabled={savingContext}
              className="text-xs border border-hairline rounded-lg px-2 py-1 bg-surface disabled:opacity-50"
              title="Encode what you know from class that the platform can't see"
            >
              <option value="">Not set</option>
              <option value="doing_well_in_class">Doing well in class — override at-risk flag</option>
              <option value="confirmed_at_risk">Confirmed at-risk in class — validates platform signal</option>
            </select>
            {contextToast && <span className="text-xs text-approve">{contextToast}</span>}
          </div>
          )}
        </div>
        {riskV2 && (
          <div className="text-right flex-shrink-0">
            <p className={`font-mono uppercase text-[10px] tracking-[.06em] font-bold ${tier.text}`}>
              {tier.glyph} {tier.label}
            </p>
            <p className={`text-[26px] font-bold tabular-nums leading-tight ${tier.text}`}>
              {riskV2.riskScore}<span className="text-xs text-ink-150 font-semibold">/100</span>
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical">
          {error}
        </div>
      )}

      {/* Two-column body: topics + session replay stacked left, sticky
          notes/trend rail right. The replay (SessionViewer) lives INSIDE the
          left column, directly under Topics — it used to render full-width
          below the whole grid, so whenever the right rail was taller than the
          Topics card the grid row stretched and left a large dead gap under
          Topics before the transcript began. */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5 items-start">
        <div className="space-y-5">
        <div className="bg-surface border border-hairline rounded-2xl shadow-card overflow-hidden animate-riseIn">
          <div className="px-5 py-4 border-b border-hairline-soft">
            <p className="text-base font-bold text-ink-900">Topics</p>
            <p className="text-xs text-ink-300 mt-0.5">Open the latest session for any topic</p>
          </div>
          <div className="p-1.5 px-3 pb-3">
            {topics.length === 0 ? (
              <div className="px-4 py-8 text-sm text-ink-400 text-center">No sessions yet.</div>
            ) : (
              topics.map((t) => (
                <div key={t.courseTopicId} className="flex items-center gap-3.5 px-2 py-3 border-t border-hairline-soft first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900 truncate">{t.topicTitle}</p>
                    {/* "Quiz-passed" is load-bearing copy: a module only counts
                        after its quiz is passed (by design — milestones alone
                        never complete a module), so "Milestones 2/4 · Modules
                        0/2" is arithmetically right and must not read as a
                        contradiction. */}
                    <p className="text-[11px] text-ink-200 mt-0.5" title={`Modules quiz-passed ${t.passedModules}/${t.moduleCount} (a module completes only when its quiz is passed) · Milestones ${t.completedMilestones}/${t.totalMilestones}`}>
                      Updated {formatDateTime(t.updatedAt)} · Modules quiz-passed {t.passedModules}/{t.moduleCount} · Milestones {t.completedMilestones}/{t.totalMilestones}
                    </p>
                  </div>
                  <span className="w-24 h-1.5 bg-hairline-softer rounded-full overflow-hidden flex-shrink-0">
                    <span
                      className={`block h-full rounded-full ${t.completed ? 'bg-approve-strong' : (t.progressPct || 0) > 0 ? 'bg-brand' : 'bg-hairline-strong'}`}
                      style={{ width: `${Math.min(t.progressPct || 0, 100)}%` }}
                    />
                  </span>
                  <span className={`w-[74px] text-right text-[11px] font-semibold ${t.completed ? 'text-approve' : (t.progressPct || 0) > 0 ? 'text-brand' : 'text-ink-300'}`}>
                    {t.completed ? 'Complete' : `${t.phase} · ${t.progressPct}%`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleViewSession(t.courseTopicId, t.sessionId)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      selectedSessionId === t.sessionId
                        ? 'border-brand bg-brand-tint text-brand'
                        : 'bg-surface border-hairline-strong text-ink-600 hover:border-brand hover:text-brand'
                    }`}
                  >
                    View session
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Session replay (chat + quiz attempts) — directly beneath Topics */}
        <div className="scroll-mt-6" ref={sessionViewerRef}>
          <SessionViewer courseId={courseId} sessionId={selectedSessionId} />
        </div>
        </div>

        {/* Sticky rail: notes + risk trend (real shipped trend card kept —
            live /risk-trend endpoint exists, so no "coming soon" placeholder). */}
        <aside className="lg:sticky lg:top-6 space-y-4 animate-riseIn">
          <NotesPanel
            courseId={courseId}
            studentId={studentId}
            notesScope={notesScope}
            scopeLabel={selectedTopicTitle}
            selectedTopicId={selectedTopicId}
            onScopeChange={setNotesScope}
          />
          <RiskTrendCard courseId={courseId} studentId={studentId} />
          {/* Renders only when this student has refusals — the one place a
              refusal-only student is visible at all. */}
          <RefusalLogPanel courseId={courseId} studentId={studentId} />
        </aside>
      </div>
    </div>
  );
}

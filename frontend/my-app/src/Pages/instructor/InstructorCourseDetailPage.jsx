import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import HotSignalCard from '../../components/instructor/HotSignalCard';
import TopicRow from '../../components/instructor/desk/TopicRow';
import { SourceIngestControls, BookCoveragePanel } from '../../components/instructor/BookSourcePanel';
import RunSimulationCard from '../../components/instructor/RunSimulationCard';
import useToastStore from '../../state/toastStore';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast('Access code copied');
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="text-brand font-semibold text-xs hover:underline transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function KpiCell({ label, value, sub, title }) {
  return (
    <div className="bg-surface border border-hairline rounded-2xl shadow-card p-4 min-w-0" title={title}>
      <p className="text-xs font-semibold text-ink-400">{label}</p>
      <p className="text-2xl font-bold text-ink-900 tabular-nums leading-none mt-1.5">{value}</p>
      {sub && (
        <p className="text-[10px] font-semibold uppercase tracking-[.02em] text-ink-200 mt-1.5">{sub}</p>
      )}
    </div>
  );
}

// Rotating perceived-progress label shown during the (5-12s) LLM generate/modify
// call. Rendered only while the request is in flight, so its timer resets every
// time a new generation starts. Stages are time-based, not wired to real backend
// progress — they just keep the user oriented during the wait.
function GenerationProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stage =
    elapsed < 2 ? 'Reading syllabus…'
      : elapsed < 6 ? 'Drafting topics…'
        : elapsed < 12 ? 'Validating coverage…'
          : 'Almost done…';
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  return (
    <span>
      {stage} <span className="text-gray-400">({mm}:{ss})</span>
    </span>
  );
}

// Topic groups for the PR-4 Topics card. Every pre-PR-4 per-status action is
// preserved inside TopicRow (primary button + ⋯ menu); Delete is menu-only
// (E-Cd-4). Groups render only when non-empty.
const TOPIC_GROUPS = [
  { status: 'published', label: 'Published' },
  { status: 'approved', label: 'Approved' },
  { status: 'unpublished', label: 'Unpublished' },
  { status: 'draft', label: 'Drafts' },
];

function Spinner({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ChatBubble({ role, content }) {
  const isInstructor = role === 'instructor';
  return (
    <div className={`flex flex-col ${isInstructor ? 'items-end' : 'items-start'}`}>
      <span className={`font-mono uppercase text-[9.5px] tracking-[.05em] font-bold mb-0.5 ${isInstructor ? 'text-brand' : 'text-assistant-deep'}`}>
        {isInstructor ? 'You' : 'Assistant'}
      </span>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm text-ink-900 whitespace-pre-wrap break-words ${
          isInstructor ? 'bg-brand-tint' : 'bg-surface-chip'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

export default function InstructorCourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [instrSaved, setInstrSaved] = useState(false);
  const [simulationActive, setSimulationActive] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  // Holds the pending message while the "replace drafts?" confirmation is open
  // (null = no confirmation pending).
  // ⋯ overflow menu in the header (Copy access code / Delete course — E-Cd-1).
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const showToast = useToastStore((s) => s.showToast);
  const chatEndRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, tRes, chatRes] = await Promise.all([
        instructorApi.getCourse(courseId),
        instructorApi.listTopics(courseId),
        instructorApi.getTopicPlanChat(courseId).catch(() => null),
      ]);
      setCourse(cRes.data?.course);
      setTopics(tRes.data?.topics || []);
      setGlobalInstructions(cRes.data?.course?.globalInstructions || '');
      if (chatRes?.data?.messages) {
        setChatMessages(chatRes.data.messages);
      }
      try {
        const aRes = await instructorApi.getCourseAnalytics(courseId).catch(() => null);
        setAnalytics(aRes?.data ?? null);
      } catch {
        setAnalytics(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  // Land at the top of the page on mount. The chat auto-scroll below previously
  // used scrollIntoView, which scrolls EVERY ancestor scroll container (incl.
  // the page's `h-full overflow-y-auto`), dragging the viewport down on render.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Auto-scroll the chat history to the latest message — scoped to the chat's
  // OWN scroll container (`.chat-history-scroll`) so it never moves the page.
  useEffect(() => {
    const end = chatEndRef.current;
    if (!end) return;
    const container = end.closest('.chat-history-scroll');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [chatMessages]);

  const saveInstructions = async () => {
    setBusy(true);
    setInstrSaved(false);
    try {
      await instructorApi.updateCourse(courseId, { globalInstructions });
      setInstrSaved(true);
      showToast('Saved');
      setTimeout(() => setInstrSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sourceSlotsLeft = Math.max(0, 10 - (course?.sources?.length || 0));

  const onUploadFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    setBusy(true);
    try {
      if (picked.length > sourceSlotsLeft) {
        setError(
          `This course allows at most 10 files. You can add ${sourceSlotsLeft} more (this selection has ${picked.length}).`
        );
        return;
      }
      const roles = picked.map((_, i) => (i === 0 ? 'syllabus' : 'reference'));
      await instructorApi.uploadCourseSources(courseId, picked, roles);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const hasDrafts = topics.some((t) => t.status === 'draft');
  const isModify = hasDrafts || chatMessages.length > 0;

  const onSendChat = () => {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    // Modify is a change set (add/edit/remove exactly what the message asks;
    // untouched drafts are left alone), so the old "replace all drafts?"
    // confirmation dialog is gone with the destructive behavior it guarded.
    doSendChat(message);
  };

  const doSendChat = async (message) => {
    setChatInput('');
    setChatBusy(true);
    setError(null);

    setChatMessages((prev) => [...prev, { role: 'instructor', content: message }]);

    try {
      const res = isModify
        ? await instructorApi.modifyTopicPlan(courseId, message)
        : await instructorApi.generateTopicPlan(courseId, message);

      const assistantMsg = res?.data?.assistantMessage || 'Done.';
      const warnings = res?.data?.warnings;
      const fullMsg = warnings?.length
        ? `${assistantMsg}\n\n${warnings.join('\n')}`
        : assistantMsg;

      setChatMessages((prev) => [...prev, { role: 'assistant', content: fullMsg }]);
      await load();
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message}` }
      ]);
      setError(e.message);
    } finally {
      setChatBusy(false);
    }
  };

  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDeleteCourse = async () => {
    if (!window.confirm('Delete this course? Students will immediately lose access to the course and its topics.')) return;
    setBusy(true);
    setError(null);
    try {
      await instructorApi.deleteCourse(courseId);
      navigate('/instructor/courses');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !course) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading course...</div>
      </div>
    );
  }

  const publishedCount = topics.filter(t => t.status === 'published').length;
  const draftCount = topics.filter(t => t.status === 'draft').length;
  // Functional once at least one topic is published; until then the page is in
  // setup mode (single column, Topics list last where drafts accumulate).
  const isFunctional = publishedCount > 0;

  // Shared Student Progress link — rendered narrow-only above the grid AND
  // wide-only at the top of the right rail (responsive, single definition).
  const studentProgressCard = (analytics && analytics.enrollmentCount > 0) ? (
    <Link
      to={`/instructor/courses/${courseId}/students`}
      className="flex items-center justify-between bg-surface border border-hairline rounded-2xl shadow-card px-5 py-4 hover:border-brand-tintBorder hover:shadow-card-hover transition-all group"
    >
      <div>
        <h3 className="font-bold text-ink-900 group-hover:text-brand transition-colors">Student Progress</h3>
        <p className="text-xs text-ink-400 mt-0.5">View per-student progress, quiz results, and identify at-risk students.</p>
      </div>
      <svg className="w-5 h-5 text-ink-100 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  ) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className={`p-6 mx-auto pb-12 ${isFunctional ? 'max-w-7xl' : 'max-w-4xl'}`}>
      {/* Navigation */}
      <Link to="/instructor/courses" className="flex items-center gap-1.5 text-brand text-sm font-semibold hover:underline w-fit">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6" /></svg>
        All courses
      </Link>

      {/* Header — course-level "draft/active" pill dropped (E-Cd-6); Delete
          course moved behind the ⋯ overflow menu (E-Cd-1). */}
      <div className="mt-3 mb-6 flex items-start justify-between gap-4 flex-wrap animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">{course?.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-2 text-xs text-ink-500">
              Access code
              <span className="font-mono font-semibold text-ink-900 bg-surface-chip border border-hairline px-2 py-0.5 rounded">{course?.accessCode}</span>
            </span>
            <CopyButton text={course?.accessCode || ''} />
            <span className="w-px h-3.5 bg-hairline-strong" />
            <span className="text-xs text-ink-500">
              {topics.length} topic{topics.length === 1 ? '' : 's'} · {publishedCount} published · {analytics?.enrollmentCount ?? 0} enrolled
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/instructor/courses/${courseId}/insights`}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-brand-pressed transition-colors"
          >
            View insights →
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCourseMenuOpen((v) => !v)}
              aria-expanded={courseMenuOpen}
              className="w-9 h-9 rounded-lg border border-hairline-strong bg-surface hover:border-ink-50 text-ink-500 flex items-center justify-center transition-colors"
              title="More actions"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </button>
            {courseMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCourseMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-20 w-48 bg-surface border border-hairline-strong rounded-xl shadow-popover p-1.5 animate-popIn">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(course?.accessCode || '')
                        .then(() => showToast('Access code copied'))
                        .catch(() => {});
                      setCourseMenuOpen(false);
                    }}
                    className="block w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-ink-600 hover:bg-surface-subtle"
                  >
                    Copy access code
                  </button>
                  <div className="h-px bg-hairline-soft my-1" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setCourseMenuOpen(false); onDeleteCourse(); }}
                    className="block w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-risk-critical hover:bg-risk-criticalTint disabled:opacity-50"
                  >
                    Delete course
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical flex items-center gap-2">
          <span>&#9888;</span> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto text-risk-criticalAccent hover:text-risk-critical">&times;</button>
        </div>
      )}

      {/* 5-cell strip: 4 numeric KPIs + Hot Signal (1.5fr). Richer analytics
          (score distribution, funnel, heatmaps, etc.) live on the Insights
          page — this page is authoring-only. */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_1.5fr] gap-3 mb-6 animate-riseIn">
          <KpiCell label="Enrolled" value={analytics.enrollmentCount ?? 0} sub="students" />
          <KpiCell label="Sessions" value={analytics.sessionCount ?? 0} sub="started" />
          <KpiCell
            label="Session completion"
            value={`${analytics.completionRate ?? 0}%`}
            sub="of sessions"
            title="Percentage of this course's student sessions that reached the 'completed' phase (completed sessions ÷ total sessions)"
          />
          <KpiCell label="Topics" value={topics.length} sub={`${publishedCount} published`} />
          <HotSignalCard courseId={courseId} />
        </div>
      )}

      {/* Student Progress — narrow-screen, FUNCTIONAL mode only (setup mode shows
          it inside the single-column stack via the rail wrapper below). */}
      {isFunctional && studentProgressCard && <div className="lg:hidden mb-6">{studentProgressCard}</div>}

      {/* State-dependent layout (D3). Functional (>=1 published topic): two
          columns — Topics (primary) left 1.7fr, sticky setup rail right 1fr
          (E-Cd-5). Setup (0 published): single column, setup tools first,
          Topics list last (drafts accumulate there). Same cards either way —
          only the wrapper classes/order change. */}
      <div className={`grid grid-cols-1 gap-5 items-start ${isFunctional ? 'lg:grid-cols-[1.7fr_1fr]' : ''}`}>
        {/* Topics card — left column when functional; ordered LAST when in setup */}
        <div className={isFunctional ? '' : 'order-2'}>
          {/* NOTE: no overflow-hidden here (deviation from the spec's card
              style) — it would clip the absolutely-positioned ⋯ popover on the
              card's last row, making menu-only Delete unreachable. Nothing
              paints into the corners, so the rounded-2xl renders fine without it. */}
          <section className="bg-surface border border-hairline rounded-2xl shadow-card">
            <div className="flex items-baseline justify-between px-5 py-4 border-b border-hairline-soft">
              <h2 className="text-base font-bold text-ink-900">
                Topics <span className="text-ink-300 font-semibold">{topics.length}</span>
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => action(() => instructorApi.createTopic(courseId, { title: 'New draft topic' }))}
                className="text-sm text-brand font-semibold hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Add topic
              </button>
            </div>
            <div className="p-1.5 px-3 pb-3">
              {topics.length === 0 ? (
                <div className="text-center py-8 m-2 border-2 border-dashed border-hairline rounded-xl">
                  <p className="text-ink-300 text-sm mb-1">No topics yet</p>
                  <p className="text-xs text-ink-300">Use the Topic Plan Chat to generate a plan, or create one manually.</p>
                </div>
              ) : (
                TOPIC_GROUPS.map(({ status, label }) => {
                  const group = topics.filter((t) => t.status === status);
                  if (group.length === 0) return null;
                  return (
                    <div key={status}>
                      <p className="font-mono uppercase text-[10.5px] tracking-[.05em] text-ink-300 font-bold px-3 pt-3 pb-1.5">
                        {label} · {group.length}
                      </p>
                      {group.map((t) => (
                        <TopicRow key={t._id} topic={t} courseId={courseId} busy={busy} onAction={action} />
                      ))}
                    </div>
                  );
                })
              )}
              {draftCount > 0 && publishedCount === 0 && (
                <p className="text-xs text-risk-watch mt-2 mx-2 mb-1 bg-risk-watchTint rounded-lg px-3 py-2">
                  You have {draftCount} draft topic{draftCount > 1 ? 's' : ''}. Approve and publish them so students can see them.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Setup rail — sticky right column when functional (E-Cd-5); ordered
            FIRST when in setup */}
        <aside className={`space-y-5 ${isFunctional ? 'lg:sticky lg:top-6' : 'order-1'}`}>
          {studentProgressCard && <div className={isFunctional ? 'hidden lg:block' : ''}>{studentProgressCard}</div>}

      {/* Sources */}
      <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
        <h2 className="text-base font-bold text-ink-900">Course materials</h2>
        <p className="text-xs text-ink-400 mt-1 mb-3">
          Up to 10 files · {sourceSlotsLeft} slot{sourceSlotsLeft === 1 ? '' : 's'} left. Mark one as syllabus.
        </p>
        {(course?.sources?.length > 0) && (
          <ul className="mb-3 space-y-2">
            {course.sources.map((s) => {
              const total = course.sources.length;
              const effective =
                s.role === 'syllabus' || s.role === 'reference'
                  ? s.role
                  : total <= 1 ? 'syllabus' : 'reference';
              return (
                <li key={s._id} className="flex flex-wrap items-center gap-2 text-sm text-ink-600 border border-hairline-soft rounded-lg px-3 py-2 bg-surface-subtle">
                  <svg className="w-4 h-4 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="flex-1 min-w-[120px] truncate" title={s.originalName}>{s.originalName}</span>
                  <span className="text-xs text-ink-300 tabular-nums">{s.wordCount?.toLocaleString() || 0} words</span>
                  <select
                    value={effective}
                    disabled={busy}
                    onChange={(ev) =>
                      action(() => instructorApi.updateCourseSourceRole(courseId, s._id, ev.target.value))
                    }
                    className="text-xs border border-hairline rounded-md px-2 py-1 bg-surface"
                  >
                    <option value="syllabus">Syllabus (primary)</option>
                    <option value="reference">Reference</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => action(() => instructorApi.deleteCourseSource(courseId, s._id))}
                    className="text-xs text-risk-critical hover:bg-risk-criticalTint font-medium px-2 py-1 rounded-md"
                  >
                    Remove
                  </button>
                  <SourceIngestControls courseId={courseId} source={s} busy={busy} onChanged={load} />
                </li>
              );
            })}
          </ul>
        )}
        <label className={`cursor-pointer block text-center border border-dashed border-hairline-strong bg-surface-subtle text-ink-500 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors hover:border-brand hover:text-brand ${sourceSlotsLeft === 0 || busy ? 'opacity-50 pointer-events-none' : ''}`}>
          Upload files
          <input
            type="file"
            multiple
            onChange={onUploadFiles}
            disabled={busy || sourceSlotsLeft === 0}
            className="hidden"
            accept=".pdf,.epub,.txt,.md,.doc,.docx,application/pdf,application/epub+zip,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </label>
      </section>

      {/* Book coverage — only renders when a source has been ingested as a
          book (feature-flagged server-side; without the flag no source ever
          reaches ingestStatus 'ready', so this section never appears). */}
      {(course?.sources || []).some((s) => s.ingestStatus === 'ready' && s.bookMap) && (
        <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
          <h2 className="text-base font-bold text-ink-900">Book coverage</h2>
          <p className="text-xs text-ink-400 mt-1 mb-3">
            Which chapters each topic covers, from the topics&apos; chapter anchors. Edit anchors here or regenerate the plan.
          </p>
          <BookCoveragePanel courseId={courseId} refreshKey={course?.updatedAt} />
        </section>
      )}

      {/* Plan Chat Panel — the `.chat-history-scroll` class is load-bearing:
          the D4 auto-scroll effect targets it so the chat scrolls internally
          without moving the page. */}
      <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
        <h2 className="text-base font-bold text-ink-900">Topic plan chat</h2>
        <p className="text-xs text-ink-400 mt-1 mb-3">
          {isModify
            ? 'Describe a change and Modify applies just that change to your drafts. Approved/published topics stay.'
            : 'Describe how topics should be structured, then Generate. Approved/published topics stay.'}
        </p>

        {chatMessages.length > 0 && (
          <div className="chat-history-scroll max-h-40 overflow-y-auto flex flex-col gap-2.5 mb-3 border border-hairline-soft rounded-xl p-3 bg-surface-subtle">
            {chatMessages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
            {chatBusy && (
              <div className="flex justify-start">
                <div className="bg-surface-chip rounded-2xl px-3 py-2 text-sm text-ink-400 flex items-center gap-2">
                  <Spinner /> <GenerationProgress />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            className="w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink-900 focus:border-brand focus:ring-2 focus:ring-brand outline-none transition-all"
            placeholder={isModify ? 'e.g. "Add a topic on neural networks"' : 'e.g. "Create 5 topics covering the full syllabus"'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendChat(); } }}
            disabled={chatBusy}
          />
          <button
            type="button"
            disabled={chatBusy || (!chatInput.trim() && !isModify)}
            onClick={onSendChat}
            className="bg-assistant text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-assistant-deep transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {chatBusy && <Spinner />}
            {isModify ? 'Modify draft topics' : 'Generate topics'}
          </button>
        </div>

        <p className="text-xs text-ink-200 mt-2">
          {isModify
            ? 'Modify adds, edits, or removes exactly what you ask. Untouched drafts and approved/published topics are never changed.'
            : 'Generate creates new draft topics from your materials and instructions.'}
        </p>
      </section>

      {/* Global Instructions (E-Cd-2: taller textarea) */}
      <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
        <h2 className="text-base font-bold text-ink-900">AI teaching instructions</h2>
        <p className="text-xs text-ink-400 mt-1 mb-3">How the assistant teaches every topic in this course.</p>
        <textarea
          className="w-full min-h-[172px] resize-y border border-hairline-strong rounded-lg px-3 py-2.5 text-sm text-ink-900 leading-relaxed focus:ring-2 focus:ring-brand focus:border-brand outline-none font-sans transition-all"
          value={globalInstructions}
          onChange={(e) => setGlobalInstructions(e.target.value)}
          placeholder="e.g. Use real-world examples, keep explanations concise, focus on practical application..."
        />
        <div className="flex justify-between items-center mt-3">
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={saveInstructions}
              className="bg-ink-900 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-brand transition-colors disabled:opacity-50"
            >
              Save
            </button>
            {instrSaved && <span className="text-xs text-approve font-medium">Saved</span>}
          </span>
          <span className="text-xs text-ink-200">Applies to all topics</span>
        </div>
        {/* Soft lock: the tutor re-reads instructions on every message, so an
            edit mid-run changes the tutor mid-transcript. The run also stores an
            instructionsSnapshot taken at launch. */}
        {simulationActive && (
          <p className="mt-3 text-xs text-risk-high bg-risk-highTint border border-hairline-soft rounded-lg px-3 py-2">
            A simulation is running; edits will affect it mid-conversation.
          </p>
        )}
      </section>

      {/* Run simulation — directly under the instructions it tests */}
      <RunSimulationCard courseId={courseId} topics={topics} busy={busy} onActiveChange={setSimulationActive} />
        </aside>
      </div>
      </div>
    </div>
  );
}

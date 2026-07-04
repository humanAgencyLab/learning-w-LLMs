import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

/**
 * PR-9 ⌘K command palette — cross-course student search.
 *
 * Open triggers: the sidebar's 'open-command-palette' CustomEvent (PR-1) and
 * the global ⌘K / Ctrl+K shortcut. ESC or a backdrop click closes.
 *
 * Data: on first open, aggregates students across all courses via the EXISTING
 * endpoints (listInstructorCourses + getStudentProgress per course,
 * Promise.allSettled so one failing course doesn't blank the list). Cached in
 * a ref for the session — reopening does not refetch. getStudentProgress has
 * no username field, so matching is on name only (no @handle).
 */

const TIER_VISUAL = {
  critical: { label: 'Critical', tint: 'bg-risk-criticalTint', text: 'text-risk-critical' },
  high: { label: 'High', tint: 'bg-risk-highTint', text: 'text-risk-high' },
  watch: { label: 'Watch', tint: 'bg-risk-watchTint', text: 'text-risk-watch' },
  healthy: { label: 'Healthy', tint: 'bg-approve-tint', text: 'text-approve' },
};
const tierVisual = (level) => TIER_VISUAL[level] || TIER_VISUAL.healthy;

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

const courseShortOf = (title = '') => title.trim().split(/\s+/).slice(0, 2).join(' ') || 'Course';

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const cacheRef = useRef(null); // session cache — filled on first successful open
  const inputRef = useRef(null);

  // Open triggers: sidebar event + ⌘K/Ctrl+K. ESC closes.
  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('open-command-palette', onOpenEvent);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('open-command-palette', onOpenEvent);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // First-open aggregation (cached for the session).
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 30);
    if (cacheRef.current) {
      setStudents(cacheRef.current);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const cRes = await instructorApi.listInstructorCourses();
        const courses = cRes.data?.courses || [];
        const settled = await Promise.allSettled(
          courses.map((c) => instructorApi.getStudentProgress(c._id)),
        );
        if (cancelled) return;
        const rows = [];
        let anyFulfilled = courses.length === 0; // no courses = legitimately empty
        settled.forEach((res, idx) => {
          if (res.status !== 'fulfilled') return;
          anyFulfilled = true;
          const course = courses[idx];
          for (const s of res.value?.data?.students || []) {
            rows.push({
              studentId: s.userId,
              name: s.name,
              riskLevel: s.riskLevel || 'healthy',
              riskScore: s.riskScore ?? 0,
              courseId: course._id,
              courseShort: courseShortOf(course.title),
            });
          }
        });
        rows.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
        // Only cache when the aggregation actually succeeded — caching an
        // all-failed [] would freeze an empty palette for the whole session.
        if (anyFulfilled) cacheRef.current = rows;
        else setLoadError(true);
        setStudents(rows);
      } catch {
        // e.g. listInstructorCourses 401/500 — show an error state instead of
        // a misleading "No students match" and let the next open retry.
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 12);
    return students.filter((s) => (s.name || '').toLowerCase().includes(q)).slice(0, 20);
  }, [students, query]);

  const openStudent = (s) => {
    setOpen(false);
    navigate(`/instructor/courses/${s.courseId}/students/${s.studentId}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-ink-900/30 flex items-start justify-center pt-[12vh] animate-fadeIn"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search students"
    >
      <div
        className="w-[min(560px,92vw)] bg-surface rounded-2xl shadow-popover overflow-hidden animate-popIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hairline-soft p-4">
          <svg className="w-4 h-4 text-ink-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any student across your courses…"
            className="flex-1 bg-transparent border-none outline-none font-sans text-base text-ink-900 placeholder-ink-300"
          />
          <span className="font-mono text-[9.5px] text-ink-200 border border-hairline-strong rounded px-1.5 py-0.5 flex-shrink-0">ESC</span>
        </div>

        {/* Results */}
        <div className="max-h-[46vh] overflow-auto p-1.5">
          {loading ? (
            <p className="p-4 text-sm text-ink-300">Loading students…</p>
          ) : loadError ? (
            <p className="p-4 text-sm text-risk-critical">Couldn&apos;t load students — close and reopen to retry.</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-ink-300">{query ? `No students match “${query}”.` : 'No students found.'}</p>
          ) : (
            results.map((s) => {
              const tier = tierVisual(s.riskLevel);
              return (
                <button
                  key={`${s.courseId}-${s.studentId}`}
                  type="button"
                  onClick={() => openStudent(s)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-surface-hover text-left transition-colors"
                >
                  <span className={`w-8 h-8 rounded-full ${tier.tint} ${tier.text} flex items-center justify-center font-bold text-xs flex-shrink-0`}>
                    {initialsOf(s.name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-ink-900 text-sm truncate">{s.name}</span>
                    <span className="block font-mono text-[10.5px] text-ink-300">{s.courseShort}</span>
                  </span>
                  <span className={`font-mono uppercase text-[10px] font-bold flex-shrink-0 ${tier.text}`}>
                    {tier.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

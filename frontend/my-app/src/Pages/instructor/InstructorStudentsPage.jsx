import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

/**
 * PR-5 Students table (mockup isStudents block): tier tabs + search, tabular
 * rows with avatar / name / topics / risk badge / topic-pass pill / actions,
 * and an expandable per-topic progress grid.
 *
 * NOTE: this page is COURSE-scoped (/instructor/courses/:courseId/students) —
 * there is no cross-course students route — so the subtitle reads "in this
 * course", not the mockup's "across 2 courses". Per-topic progress comes from
 * getStudentProgress's topicProgress[] (already in the initial fetch — no
 * per-expand request needed). The endpoint returns no username, so the
 * mockup's @handle is omitted and search matches on name only.
 */

const PHASE_LABELS = {
  pre: 'Not started',
  assessing: 'Assessing',
  planning: 'Planning',
  learning: 'Learning',
  quizzing: 'Quizzing',
  feedback: 'Feedback',
  completed: 'Complete',
};

// Tier visuals (healthy + class-override aware; risk tiers use the nano-PR tokens).
const TIER_VISUAL = {
  critical: { label: 'Critical', tint: 'bg-risk-criticalTint', text: 'text-risk-critical', badge: 'bg-risk-criticalTint text-risk-critical border-risk-criticalBorder' },
  high: { label: 'High', tint: 'bg-risk-highTint', text: 'text-risk-high', badge: 'bg-risk-highTint text-risk-high border-risk-highBorder' },
  watch: { label: 'Watch', tint: 'bg-risk-watchTint', text: 'text-risk-watch', badge: 'bg-risk-watchTint text-risk-watch border-risk-watchBorder' },
  healthy: { label: 'Healthy', tint: 'bg-approve-tint', text: 'text-approve', badge: 'bg-approve-tint text-approve border-approve-border' },
};
const tierVisual = (level) => TIER_VISUAL[level] || TIER_VISUAL.healthy;

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

const courseShortOf = (title = '') => title.trim().split(/\s+/).slice(0, 2).join(' ');

function topicPassPill(rate) {
  if (rate == null) return null;
  const cls = rate >= 60
    ? 'bg-approve-tint text-approve border-approve-border'
    : rate >= 40
      ? 'bg-risk-watchTint text-risk-watch border-risk-watchBorder'
      : 'bg-risk-criticalTint text-risk-critical border-risk-criticalBorder';
  return (
    <span
      className={`text-[11.5px] font-bold border rounded-lg px-2.5 py-1 whitespace-nowrap tabular-nums ${cls}`}
      title="Percentage of this course's topics where the student passed the final quiz"
    >
      {rate}% topic pass
    </span>
  );
}

function topicBarColor(tp) {
  if (tp.completed) return 'bg-approve-strong';
  if ((tp.progressPct || 0) > 0) return 'bg-brand';
  return 'bg-hairline-strong';
}
function topicLabelColor(tp) {
  if (tp.completed) return 'text-approve';
  if ((tp.progressPct || 0) > 0) return 'text-brand';
  return 'text-ink-300';
}

function StudentTableRow({ student, courseShort, expanded, onToggle, onMonitor }) {
  const isWell = student.classContext === 'doing_well_in_class';
  const tier = tierVisual(student.riskLevel);
  const topicProgress = student.topicProgress || [];

  return (
    <div className="border-t border-hairline-soft first:border-t-0">
      <div className="grid grid-cols-[40px_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3">
        <span className={`w-10 h-10 rounded-full ${isWell ? 'bg-surface-chip text-ink-500' : `${tier.tint} ${tier.text}`} flex items-center justify-center font-bold text-[13px]`}>
          {initialsOf(student.name)}
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-ink-900">{student.name}</span>
            {courseShort && (
              <span className="text-[10.5px] font-semibold text-ink-500 bg-surface-chip rounded px-1.5 py-0.5">{courseShort}</span>
            )}
          </div>
          <p className="text-[11.5px] text-ink-300 mt-0.5">
            Joined {new Date(student.joinedAt).toLocaleDateString()}
            {student.priorKnowledge?.selfRating && <> · Self-rated: {student.priorKnowledge.selfRating}</>}
          </p>
        </div>
        <div className="text-right text-xs text-ink-500 tabular-nums">
          {student.completedTopics} of {student.totalTopics}
          <br />
          <span className="text-ink-200">{student.totalPoints} pts</span>
        </div>
        {isWell ? (
          <span
            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-surface-chip text-ink-400 border border-hairline"
            title="Instructor marked this student as doing well in class — excluded from the at-risk count"
          >
            Class OK
          </span>
        ) : (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border ${tier.badge}`}
            title={`Risk level: ${tier.label} (${student.riskScore}/100). Same definition as the dashboard tile and the Insights panel.`}
          >
            {tier.label}
          </span>
        )}
        <span>{topicPassPill(student.topicPassRate)}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMonitor}
            className="bg-surface border border-hairline-strong rounded-lg px-3.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand hover:text-brand transition-colors"
            title="Monitor student"
          >
            Monitor
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="w-8 h-8 rounded-lg border border-hairline-strong bg-surface text-ink-400 hover:border-ink-50 flex items-center justify-center transition-colors"
            title={expanded ? 'Collapse' : 'Topic progress'}
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pl-[74px] pr-4 pb-4 pt-0.5 animate-fadeIn">
          <p className="font-mono uppercase text-[10.5px] tracking-[.04em] text-ink-300 font-bold mb-2">Topic progress</p>
          {topicProgress.length === 0 ? (
            <p className="text-sm text-ink-300">No topic sessions yet.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-7 gap-y-1">
              {topicProgress.map((tp) => (
                <div key={tp.topicId} className="flex items-center gap-2.5 py-1">
                  <span className="flex-1 text-sm text-ink-600 truncate">{tp.topicTitle}</span>
                  <span className="w-[70px] h-[5px] bg-hairline-softer rounded-full overflow-hidden flex-shrink-0">
                    <span className={`block h-full rounded-full ${topicBarColor(tp)}`} style={{ width: `${Math.min(tp.progressPct || 0, 100)}%` }} />
                  </span>
                  <span className={`w-[64px] text-right text-[10.5px] font-semibold ${topicLabelColor(tp)}`}>
                    {tp.completed ? 'Complete' : PHASE_LABELS[tp.phase] || tp.phase}
                  </span>
                </div>
              ))}
            </div>
          )}
          {student.priorKnowledge && (student.priorKnowledge.relevantExperience || student.priorKnowledge.specificGoals) && (
            <div className="mt-3.5 pt-3 border-t border-hairline-soft">
              <p className="font-mono uppercase text-[10.5px] tracking-[.04em] text-ink-300 font-bold mb-1">Prior knowledge</p>
              {student.priorKnowledge.relevantExperience && (
                <p className="text-xs text-ink-500">Experience: {student.priorKnowledge.relevantExperience}</p>
              )}
              {student.priorKnowledge.specificGoals && (
                <p className="text-xs text-ink-500">Goals: {student.priorKnowledge.specificGoals}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InstructorStudentsPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [tierFilter, setTierFilter] = useState(null); // null = All
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, cRes] = await Promise.all([
          instructorApi.getStudentProgress(courseId),
          instructorApi.getCourse(courseId),
        ]);
        if (!cancelled) {
          setData(sRes.data);
          setCourseName(cRes.data?.course?.title || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  const students = useMemo(() => data?.students || [], [data]);

  const tierCounts = useMemo(() => {
    const c = { critical: 0, high: 0, watch: 0 };
    for (const s of students) {
      if (s.classContext === 'doing_well_in_class') continue;
      if (c[s.riskLevel] != null) c[s.riskLevel] += 1;
    }
    return c;
  }, [students]);
  const needNow = tierCounts.critical + tierCounts.high;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => !tierFilter || (s.riskLevel === tierFilter && s.classContext !== 'doing_well_in_class'))
      .filter((s) => !q || (s.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a.classContext === 'doing_well_in_class' ? -1 : (a.riskScore || 0);
        const bv = b.classContext === 'doing_well_in_class' ? -1 : (b.riskScore || 0);
        return bv - av;
      });
  }, [students, tierFilter, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-ink-300">Loading students...</div>
      </div>
    );
  }

  const tabs = [
    { key: null, label: 'All', count: students.length },
    { key: 'critical', label: 'Critical', count: tierCounts.critical },
    { key: 'high', label: 'High', count: tierCounts.high },
    { key: 'watch', label: 'Watch', count: tierCounts.watch },
  ];
  const courseShort = courseShortOf(courseName);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to={`/instructor/courses/${courseId}`} className="flex items-center gap-1.5 text-brand text-sm font-semibold hover:underline w-fit">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6" /></svg>
        {courseName || 'Back to course'}
      </Link>

      <div className="mt-3 animate-fadeIn">
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Students</h1>
        <p className="text-sm text-ink-500 mt-1.5">
          {students.length} in this course · {needNow} need attention
        </p>
      </div>

      {error && (
        <div className="mt-4 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical">
          {error}
        </div>
      )}

      {/* Tabs + search */}
      <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex bg-surface-chip rounded-lg p-1 gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => setTierFilter(t.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                tierFilter === t.key ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              {t.label} <span className="opacity-60 tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-surface border border-hairline-strong rounded-lg px-3 py-2 min-w-[260px]">
          <svg className="w-[15px] h-[15px] text-ink-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            className="flex-1 bg-transparent border-none outline-none font-sans text-sm text-ink-900 placeholder-ink-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 bg-surface border border-hairline rounded-2xl shadow-card overflow-hidden animate-riseIn">
        {students.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-ink-500 text-sm">No students enrolled yet.</p>
            <p className="text-ink-300 text-xs mt-1">Share the course access code with your students.</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-ink-300 text-sm">No students match your filters.</p>
        ) : (
          visible.map((s) => (
            <StudentTableRow
              key={s.userId}
              student={s}
              courseShort={courseShort}
              expanded={expandedId === s.userId}
              onToggle={() => setExpandedId(expandedId === s.userId ? null : s.userId)}
              onMonitor={() => navigate(`/instructor/courses/${courseId}/students/${s.userId}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

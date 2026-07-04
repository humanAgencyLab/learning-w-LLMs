import React, { useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';
import AgentBriefingCard from '../../components/instructor/AgentBriefingCard';
import CourseCardsGrid from '../../components/instructor/CourseCardsGrid';
import NeedAttentionCard from '../../components/instructor/NeedAttentionCard';
import DashboardWatchlist from '../../components/instructor/DashboardWatchlist';

/**
 * PR-2 dashboard IA (mockup lines 423–577):
 *  1) Header row — title + dynamic subtitle, synthetic-cohort switch
 *  2) Briefing (1.85fr) + Need attention now (1fr)
 *  3) Four KPI figures
 *  4) Watchlist — cross-course at-risk students grouped by tier
 *  5) Your courses grid
 *
 * At-risk rows are aggregated ONCE here (existing per-course at-risk endpoint,
 * Promise.allSettled so one failing course doesn't blank the dashboard) and
 * shared by NeedAttentionCard + DashboardWatchlist. No new backend endpoints.
 */

// Course chip shortcode: first two whitespace-separated tokens of the title
// ("CPS 1231-Mid Semester" → "CPS 1231-Mid").
const courseShortOf = (title = '') => title.trim().split(/\s+/).slice(0, 2).join(' ') || 'Course';

function KpiFigure({ label, value, unit }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl shadow-card p-4">
      <p className="text-xs font-semibold text-ink-400">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="text-[27px] font-bold text-ink-900 tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-xs text-ink-200 font-semibold uppercase">{unit}</span>}
      </div>
    </div>
  );
}

function SyntheticSwitch({ checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer pb-0.5 select-none">
      <span className="text-[12.5px] text-ink-500 font-medium">Include synthetic cohort</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-hairline-strong'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}

export default function InstructorDashboardPage() {
  const [courses, setCourses] = useState([]);
  const [analyticsMap, setAnalyticsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [includeSynthetic, setIncludeSynthetic] = useState(true);
  const [atRiskRows, setAtRiskRows] = useState([]);
  const [atRiskLoading, setAtRiskLoading] = useState(true);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [atRiskFailed, setAtRiskFailed] = useState(false);

  // Cross-course overview — feeds CourseCardsGrid's perCourse tiles.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const oRes = await instructorApi.getInstructorOverview({ includeSynthetic });
        if (!cancelled) {
          setOverview(oRes.data || null);
          setOverviewFailed(false);
        }
      } catch {
        // Must be recorded, not swallowed: overview drives the at-risk effect,
        // the subtitle, and the courses grid — a silent null would leave all
        // three stuck in loading forever.
        if (!cancelled) setOverviewFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [includeSynthetic]);

  // Per-course session analytics — still needed for the aggregate KPI tiles
  // (overview doesn't include session counts or completion rate).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cRes = await instructorApi.listInstructorCourses();
        const courseList = cRes.data?.courses || [];
        if (cancelled) return;
        setCourses(courseList);

        const analyticsEntries = await Promise.all(
          courseList.map(async (c) => {
            try {
              const aRes = await instructorApi.getCourseAnalytics(c._id);
              return [c._id, aRes.data];
            } catch {
              return [c._id, null];
            }
          }),
        );
        if (cancelled) return;
        setAnalyticsMap(Object.fromEntries(analyticsEntries));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cross-course at-risk aggregation — one fetch per course via the EXISTING
  // at-risk endpoint; rows are shared by NeedAttentionCard + DashboardWatchlist.
  useEffect(() => {
    const perCourse = overview?.perCourse || [];
    if (perCourse.length === 0) {
      setAtRiskRows([]);
      // Resolve loading when overview settled (empty course list) OR failed —
      // otherwise a failed overview fetch leaves the whole dashboard in a
      // permanent loading state with no error surfaced.
      setAtRiskLoading(!overview && !overviewFailed);
      return undefined;
    }
    let cancelled = false;
    setAtRiskLoading(true);
    (async () => {
      const settled = await Promise.allSettled(
        perCourse.map((c) => instructorApi.getAtRiskStudents(c.courseId, { includeSynthetic })),
      );
      if (cancelled) return;
      const rows = [];
      settled.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return; // partial failure: skip that course
        const course = perCourse[idx];
        for (const r of res.value?.data || []) {
          if (r.riskLevel === 'healthy') continue;
          rows.push({
            ...r,
            courseId: course.courseId,
            courseTitle: course.title,
            courseShort: courseShortOf(course.title),
          });
        }
      });
      rows.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
      // Total failure ≠ healthy class: if every course's fetch rejected, say so
      // instead of confidently rendering "0 need attention".
      setAtRiskFailed(settled.length > 0 && settled.every((r) => r.status !== 'fulfilled'));
      setAtRiskRows(rows);
      setAtRiskLoading(false);
    })();
    return () => { cancelled = true; };
  }, [overview, overviewFailed, includeSynthetic]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-ink-300">Loading dashboard...</div>
      </div>
    );
  }

  // Aggregate KPIs across courses. Derived here because `overview` doesn't
  // include session counts / completion — those live in getCourseAnalytics.
  const totalStudents = Object.values(analyticsMap).reduce((s, a) => s + (a?.enrollmentCount || 0), 0);
  const totalSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.sessionCount || 0), 0);
  const completedSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.completedSessionCount || 0), 0);
  const avgCompletion = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  const needNowCount = atRiskRows.filter((r) => r.atRisk).length;
  const coursesCount = overview?.perCourse?.length ?? courses.length;
  const dataUnavailable = (overviewFailed && !overview) || atRiskFailed;
  const subtitle = atRiskLoading
    ? 'Loading…'
    : dataUnavailable
      ? 'Some dashboard data is unavailable right now — refresh to retry.'
      : `${totalStudents} student${totalStudents === 1 ? '' : 's'} across ${coursesCount} course${coursesCount === 1 ? '' : 's'} · ${needNowCount} need attention now`;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* 1) Header row */}
      <div className="mb-6 flex items-end justify-between gap-5 flex-wrap animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Instructor Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1.5">{subtitle}</p>
        </div>
        <SyntheticSwitch checked={includeSynthetic} onChange={setIncludeSynthetic} />
      </div>

      {error && (
        <div className="mb-6 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical">
          {error}
        </div>
      )}
      {dataUnavailable && (
        <div className="mb-6 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical">
          {atRiskFailed
            ? "Couldn't load the at-risk lists — the attention counts below may be incomplete. Refresh to retry."
            : "Couldn't load the course overview — refresh to retry."}
        </div>
      )}

      {/* 2) Briefing + Need attention */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-4 mb-4 animate-riseIn">
        <AgentBriefingCard includeSynthetic={includeSynthetic} />
        <NeedAttentionCard rows={atRiskRows} coursesCount={coursesCount} loading={atRiskLoading} />
      </div>

      {/* 3) Four KPI figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6 animate-riseIn">
        <KpiFigure label="Courses" value={coursesCount} />
        <KpiFigure label="Total students" value={totalStudents} />
        <KpiFigure label="Total sessions" value={totalSessions} />
        <KpiFigure label="Session completion" value={`${avgCompletion}%`} unit="avg" />
      </div>

      {/* 4) Watchlist */}
      <section id="dashboard-watchlist" className="mb-6 scroll-mt-6 animate-riseIn">
        <DashboardWatchlist rows={atRiskRows} loading={atRiskLoading} />
      </section>

      {/* 5) Your courses */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold text-ink-900">Your courses</h2>
        <p className="text-xs text-ink-300">
          Click a card to author &middot; the chiplet jumps to that course&apos;s Insights
        </p>
      </div>
      <CourseCardsGrid perCourse={overview?.perCourse || []} loading={!overview && !overviewFailed} />
    </div>
  );
}

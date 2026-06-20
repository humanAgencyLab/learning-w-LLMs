import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * One card per course. Replaces the dashboard's "Your Courses" row list AND
 * the per-course table inside the old OverviewKPIs widget (both pointed at
 * the same courses — pure redundancy).
 *
 * Primary body click → authoring page (`/instructor/courses/:id`).
 * Secondary "Insights →" chiplet → `/instructor/courses/:id/insights`.
 *
 * Tiles chosen to match the locked-in plan: Enrolled · Active · Pass rate ·
 * At-risk. We use the `perCourse` shape already emitted by `getCrossCourseKPIs`
 * so no new endpoint is needed.
 */

function Tile({ label, value, accent }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className={`text-lg font-bold mt-0.5 leading-tight ${accent || 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function passRateAccent(pr) {
  if (pr == null) return 'text-gray-400';
  if (pr >= 70) return 'text-green-700';
  if (pr >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

function statusPill(status) {
  const s = String(status || '').toLowerCase();
  const color =
    s === 'published' || s === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'archived'
      ? 'bg-gray-50 text-gray-500 border-gray-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color} capitalize`}>
      {status || 'draft'}
    </span>
  );
}

export default function CourseCardsGrid({ perCourse = [], loading = false }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
            <div className="h-3 w-1/3 bg-gray-100 rounded mt-2" />
            <div className="flex gap-4 mt-4">
              <div className="flex-1 h-10 bg-gray-100 rounded" />
              <div className="flex-1 h-10 bg-gray-100 rounded" />
              <div className="flex-1 h-10 bg-gray-100 rounded" />
              <div className="flex-1 h-10 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!perCourse?.length) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-8 text-center">
        <p className="text-sm text-gray-700 font-medium">You don&apos;t have any courses yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Create a course from the New course button to start seeing enrollment, progress, and at-risk signals.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {perCourse.map((c) => {
        const authoringHref = `/instructor/courses/${c.courseId}`;
        const insightsHref = `/instructor/courses/${c.courseId}/insights`;

        // The whole card is clickable (keyboard-accessible via button role),
        // but the inner "Insights →" link stops propagation so it navigates
        // to its own target instead of the body.
        const onCardClick = () => navigate(authoringHref);
        const onCardKey = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(authoringHref);
          }
        };

        return (
          <div
            key={c.courseId}
            role="button"
            tabIndex={0}
            onClick={onCardClick}
            onKeyDown={onCardKey}
            className="group bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md transition rounded-xl p-5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-700">
                  {c.title || 'Untitled course'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {statusPill(c.status)}
                  <span className="text-[11px] text-gray-500 truncate">
                    {c.attempts || 0} attempts
                  </span>
                </div>
              </div>
              <Link
                to={insightsHref}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2 py-1 rounded-lg shrink-0"
              >
                Insights →
              </Link>
            </div>

            <div className="flex gap-3 mt-4">
              <Tile label="Enrolled" value={c.enrollmentCount ?? 0} />
              <Tile label="Active" value={c.activeStudentCount ?? 0} />
              <Tile
                label="Pass rate"
                value={c.passRate != null ? `${c.passRate}%` : '—'}
                accent={passRateAccent(c.passRate)}
              />
              <Tile
                label="At-risk"
                value={c.atRiskCount ?? 0}
                accent={c.atRiskCount > 0 ? 'text-rose-700' : 'text-gray-900'}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

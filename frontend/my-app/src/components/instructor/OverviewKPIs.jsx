import React from 'react';
import { Link } from 'react-router-dom';

function KPI({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 min-w-[160px]">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function OverviewKPIs({ overview }) {
  if (!overview) return null;
  const {
    courseCount,
    enrollmentCount,
    totalAttempts,
    avgPassRate,
    atRiskCount,
    perCourse,
  } = overview;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <KPI label="Active courses" value={courseCount} />
        <KPI label="Enrolled students" value={enrollmentCount} />
        <KPI label="Total milestone attempts" value={totalAttempts} />
        <KPI
          label="Avg pass rate"
          value={`${avgPassRate}%`}
          accent={avgPassRate >= 70 ? 'text-green-700' : avgPassRate >= 50 ? 'text-amber-700' : 'text-rose-700'}
        />
        <KPI
          label="At-risk students"
          value={atRiskCount}
          accent={atRiskCount > 0 ? 'text-rose-700' : 'text-gray-900'}
        />
      </div>

      {perCourse?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">Per-course</p>
            <p className="text-xs text-gray-500">Click a row to open Insights</p>
          </div>
          <div className="divide-y divide-gray-100">
            {perCourse.map((c) => (
              <Link
                key={c.courseId}
                to={`/instructor/courses/${c.courseId}/insights`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-sm"
              >
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 truncate block">{c.title}</span>
                  <span className="text-xs text-gray-500">
                    {c.enrollmentCount} enrolled · {c.activeStudentCount} active · {c.status}
                  </span>
                </span>
                <span className="text-xs text-gray-500 text-right shrink-0 w-28">
                  <span className="block">
                    <span className="font-semibold text-gray-800">{c.attempts}</span> attempts
                  </span>
                  <span className="block">
                    <span
                      className={`font-semibold ${
                        c.passRate >= 70 ? 'text-green-700' : c.passRate >= 50 ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      {c.passRate}%
                    </span>{' '}
                    pass
                  </span>
                </span>
                <span className="text-right shrink-0 w-24">
                  {c.atRiskCount > 0 ? (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-rose-100 text-rose-700">
                      {c.atRiskCount} at-risk
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

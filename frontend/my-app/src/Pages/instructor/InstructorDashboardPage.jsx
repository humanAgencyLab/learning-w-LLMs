import React, { useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';
import AgentBriefingCard from '../../components/instructor/AgentBriefingCard';
import CourseCardsGrid from '../../components/instructor/CourseCardsGrid';

/**
 * Phase E dashboard IA:
 *  1) 4 aggregate KPI tiles (Courses · Students · Sessions · Avg Completion)
 *  2) AgentBriefingCard — one narrative paragraph across every course
 *  3) CourseCardsGrid — one card per course (authoring click + Insights chiplet)
 *
 * Removed intentionally:
 *  - OverviewKPIs (per-course table duplicated CourseCardsGrid)
 *  - "Your Courses" list (duplicated the above)
 *  - Static "AI Insights" panel (now fully served by the floating chat +
 *    briefing card + Insights page narrative)
 *
 * The floating InstructorChatPanel stays mounted in InstructorShell and is
 * the single interactive AI affordance. The briefing card's "Ask follow-up"
 * button dispatches a window CustomEvent that the chat panel listens for.
 */

function StatCard({ label, value, icon, color = 'blue', title }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4" title={title}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function InstructorDashboardPage() {
  const [courses, setCourses] = useState([]);
  const [analyticsMap, setAnalyticsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [includeSynthetic, setIncludeSynthetic] = useState(true);

  // Cross-course overview — feeds CourseCardsGrid's perCourse tiles.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const oRes = await instructorApi.getInstructorOverview({ includeSynthetic });
        if (!cancelled) setOverview(oRes.data || null);
      } catch {
        /* non-fatal — briefing card shows its own error state */
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  // Aggregate KPIs across courses. Derived here because `overview` doesn't
  // include session counts / completion — those live in getCourseAnalytics.
  const totalStudents = Object.values(analyticsMap).reduce((s, a) => s + (a?.enrollmentCount || 0), 0);
  const totalSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.sessionCount || 0), 0);
  const completedSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.completedSessionCount || 0), 0);
  const avgCompletion = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instructor Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your courses and student progress. Ask the floating Insights Assistant anything at any time.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0">
          <input
            type="checkbox"
            checked={includeSynthetic}
            onChange={(e) => setIncludeSynthetic(e.target.checked)}
          />
          Include synthetic cohort
        </label>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1) Aggregate KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Courses"
          value={courses.length}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
        />
        <StatCard
          label="Total Students"
          value={totalStudents}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Total Sessions"
          value={totalSessions}
          color="purple"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
        />
        <StatCard
          label="Session completion"
          title="Percentage of student sessions that reached the 'completed' phase (completed sessions ÷ total sessions)"
          value={`${avgCompletion}%`}
          color="amber"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* 2) Narrative briefing */}
      <div className="mb-6">
        <AgentBriefingCard includeSynthetic={includeSynthetic} />
      </div>

      {/* 3) Course cards grid — authoring click + Insights chiplet */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Your Courses</h2>
        <p className="text-xs text-gray-500">
          Click a card to author &middot; the chiplet jumps to that course&apos;s Insights
        </p>
      </div>
      <CourseCardsGrid perCourse={overview?.perCourse || []} loading={!overview} />
    </div>
  );
}

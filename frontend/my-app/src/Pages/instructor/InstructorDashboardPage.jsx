import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

function StatCard({ label, value, icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
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

function CourseRow({ course, analytics }) {
  const stats = analytics?.[course._id];
  return (
    <Link
      to={`/instructor/courses/${course._id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
          {course.title}
        </h4>
        <p className="text-xs text-gray-400 mt-0.5">
          Code: <span className="font-mono font-semibold text-gray-500">{course.accessCode}</span>
        </p>
      </div>
      <div className="flex items-center gap-6 text-xs text-gray-500 flex-shrink-0">
        <span>{stats?.enrollmentCount ?? 0} students</span>
        <span>{stats?.sessionCount ?? 0} sessions</span>
        <span>{stats?.completionRate ?? 0}% complete</span>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function TopicInsightRow({ topic }) {
  const quizPassRate = topic.quizAttempts > 0
    ? Math.round((topic.quizPasses / topic.quizAttempts) * 100)
    : null;
  const isStruggling = quizPassRate !== null && quizPassRate < 60;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${isStruggling ? 'bg-red-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{topic.title}</p>
        <p className="text-xs text-gray-400">
          {topic.startedSessions} started · {topic.completedSessions} completed
        </p>
      </div>
      {quizPassRate !== null && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          isStruggling ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {quizPassRate}% pass
        </span>
      )}
    </div>
  );
}

export default function InstructorDashboardPage() {
  const [courses, setCourses] = useState([]);
  const [analyticsMap, setAnalyticsMap] = useState({});
  const [allTopicStats, setAllTopicStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cRes = await instructorApi.listInstructorCourses();
        const courseList = cRes.data?.courses || [];
        if (cancelled) return;
        setCourses(courseList);

        // Fetch analytics for each course in parallel
        const analyticsEntries = await Promise.all(
          courseList.map(async (c) => {
            try {
              const aRes = await instructorApi.getCourseAnalytics(c._id);
              return [c._id, aRes.data];
            } catch {
              return [c._id, null];
            }
          })
        );
        if (cancelled) return;

        const aMap = Object.fromEntries(analyticsEntries);
        setAnalyticsMap(aMap);

        // Aggregate topic stats across all courses
        const topics = [];
        for (const [, a] of analyticsEntries) {
          if (a?.topics) topics.push(...a.topics);
        }
        setAllTopicStats(topics);
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

  // Aggregate stats
  const totalStudents = Object.values(analyticsMap).reduce((s, a) => s + (a?.enrollmentCount || 0), 0);
  const totalSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.sessionCount || 0), 0);
  const completedSessions = Object.values(analyticsMap).reduce((s, a) => s + (a?.completedSessionCount || 0), 0);
  const avgCompletion = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  // Topics where students are struggling (pass rate < 60%)
  const strugglingTopics = allTopicStats.filter((t) => {
    if (t.quizAttempts === 0) return false;
    return (t.quizPasses / t.quizAttempts) < 0.6;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Instructor Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your courses and student progress.</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
          label="Avg. Completion"
          value={`${avgCompletion}%`}
          color="amber"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Courses list */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Your Courses</h2>
            <Link
              to="/instructor/courses"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all
            </Link>
          </div>
          {courses.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">No courses yet.</p>
              <Link
                to="/instructor/courses"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium mt-1 inline-block"
              >
                Create your first course
              </Link>
            </div>
          ) : (
            <div className="py-1">
              {courses.slice(0, 5).map((c) => (
                <CourseRow key={c._id} course={c} analytics={analyticsMap} />
              ))}
              {courses.length > 5 && (
                <div className="px-4 py-2 text-center">
                  <Link to="/instructor/courses" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    +{courses.length - 5} more courses
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Insights panel */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">AI Insights</h2>
            <p className="text-xs text-gray-400 mt-0.5">AI-powered analysis of student performance</p>
          </div>

          {/* Static topic stats */}
          {strugglingTopics.length > 0 && (
            <div className="py-2 border-b border-gray-100">
              <div className="px-4 py-2">
                <p className="text-xs text-red-600 font-medium">
                  {strugglingTopics.length} topic{strugglingTopics.length > 1 ? 's' : ''} with low quiz pass rates
                </p>
              </div>
              {strugglingTopics.map((t) => (
                <TopicInsightRow key={t.topicId} topic={t} />
              ))}
            </div>
          )}

          {/* AI-generated insights */}
          {aiInsights ? (
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 mb-3">{aiInsights.summary}</p>
              <div className="space-y-2">
                {(aiInsights.insights || []).map((insight, i) => {
                  const colors = {
                    struggling: 'border-red-200 bg-red-50 text-red-800',
                    positive: 'border-green-200 bg-green-50 text-green-800',
                    suggestion: 'border-blue-200 bg-blue-50 text-blue-800',
                  };
                  return (
                    <div key={i} className={`text-xs px-3 py-2 rounded-lg border ${colors[insight.type] || colors.suggestion}`}>
                      {insight.topic && <span className="font-semibold">{insight.topic}: </span>}
                      {insight.text}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : totalSessions === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">No data yet.</p>
              <p className="text-xs text-gray-400 mt-1">Insights appear as students use the platform.</p>
            </div>
          ) : (
            <div className="text-center py-6">
              <button
                type="button"
                disabled={insightsLoading}
                onClick={async () => {
                  setInsightsLoading(true);
                  try {
                    // Use the first course with data for insights
                    const courseWithData = courses.find((c) => analyticsMap[c._id]?.sessionCount > 0);
                    if (courseWithData) {
                      const res = await instructorApi.getCourseInsights(courseWithData._id);
                      setAiInsights(res.data);
                    }
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setInsightsLoading(false);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                {insightsLoading && (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                )}
                {insightsLoading ? 'Analyzing...' : 'Generate AI Insights'}
              </button>
              <p className="text-xs text-gray-400 mt-2">Analyze student performance with AI</p>
            </div>
          )}

          {/* All topics overview */}
          {allTopicStats.length > 0 && (
            <div className="border-t border-gray-100 py-2">
              <div className="px-4 py-2">
                <p className="text-xs text-gray-500 font-medium">All topics</p>
              </div>
              {allTopicStats.slice(0, 5).map((t) => (
                <TopicInsightRow key={t.topicId} topic={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

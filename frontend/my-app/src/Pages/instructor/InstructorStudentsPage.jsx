import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

const PHASE_LABELS = {
  pre: 'Not started',
  assessing: 'Assessing',
  planning: 'Planning',
  learning: 'Learning',
  quizzing: 'Quizzing',
  feedback: 'Feedback',
  completed: 'Completed',
};

function ProgressBar({ pct }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function StudentRow({ student, expanded, onToggle, onMonitor }) {
  const topicPassRate = student.topicPassRate;
  const atRisk = !!student.atRisk;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
          {student.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{student.name}</p>
          <p className="text-xs text-gray-400">
            Joined {new Date(student.joinedAt).toLocaleDateString()}
            {student.priorKnowledge?.selfRating && (
              <> · Self-rated: {student.priorKnowledge.selfRating}</>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 text-xs text-gray-500 flex-shrink-0">
          <span>{student.completedTopics}/{student.totalTopics} topics</span>
          <span>{student.totalPoints} pts</span>
          {atRisk && (
            <span
              className="font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 uppercase tracking-wide text-[10px]"
              title="Flagged at-risk by the same definition used on the dashboard and Insights (low quiz score, low attempt pass rate, or repeated retries)"
            >
              At-risk
            </span>
          )}
          {topicPassRate !== null && topicPassRate !== undefined && (
            <span
              className={`font-semibold px-2 py-0.5 rounded-full ${
                topicPassRate < 60 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}
              title="Percentage of this course's topics where the student passed the final quiz"
            >
              {topicPassRate}% topic pass rate
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMonitor?.();
          }}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          title="Monitor student"
        >
          Monitor
        </button>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
          {student.topicProgress.length === 0 ? (
            <p className="text-sm text-gray-400">No topic sessions yet.</p>
          ) : (
            <div className="space-y-3">
              {student.topicProgress.map((tp) => (
                <div key={tp.topicId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{tp.topicTitle}</p>
                    <ProgressBar pct={tp.progressPct} />
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    tp.completed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tp.completed ? 'Completed' : PHASE_LABELS[tp.phase] || tp.phase}
                  </span>
                  <span className="text-xs text-gray-400 w-10 text-right">{tp.progressPct}%</span>
                </div>
              ))}
            </div>
          )}

          {student.priorKnowledge && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1">Prior Knowledge</p>
              {student.priorKnowledge.relevantExperience && (
                <p className="text-xs text-gray-600">Experience: {student.priorKnowledge.relevantExperience}</p>
              )}
              {student.priorKnowledge.specificGoals && (
                <p className="text-xs text-gray-600">Goals: {student.priorKnowledge.specificGoals}</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading students...</div>
      </div>
    );
  }

  const students = data?.students || [];
  // B9: the at-risk count comes from the canonical per-student `atRisk` flag
  // (computed server-side by getAtRiskStudents) — the same number the dashboard
  // tile and the Insights panel show. The old "struggling = quizPassRate < 60"
  // client-side heuristic is retired so the three surfaces can't disagree.
  const atRiskCount = students.filter((s) => s.atRisk).length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link to={`/instructor/courses/${courseId}`} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {courseName || 'Back to course'}
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Student Progress</h1>
        <p className="text-sm text-gray-500 mt-1">
          {students.length} student{students.length !== 1 ? 's' : ''} enrolled
          {atRiskCount > 0 && (
            <span className="text-red-600 font-medium"> · {atRiskCount} at-risk</span>
          )}
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {students.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 text-sm">No students enrolled yet.</p>
          <p className="text-gray-400 text-xs mt-1">Share the course access code with your students.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Show at-risk students first, then by lowest topic pass rate */}
          {students
            .slice()
            .sort((a, b) => {
              if (!!a.atRisk !== !!b.atRisk) return a.atRisk ? -1 : 1;
              const at = a.topicPassRate == null ? Infinity : a.topicPassRate;
              const bt = b.topicPassRate == null ? Infinity : b.topicPassRate;
              return at - bt;
            })
            .map((s) => (
              <StudentRow
                key={s.userId}
                student={s}
                expanded={expandedId === s.userId}
                onToggle={() => setExpandedId(expandedId === s.userId ? null : s.userId)}
                onMonitor={() => navigate(`/instructor/courses/${courseId}/students/${s.userId}`)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

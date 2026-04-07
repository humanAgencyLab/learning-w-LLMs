import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as courseApi from '../../lib/courseApi';
import useSessionStore from '../../state/sessionStore';

const DIFFICULTY_COLORS = {
  intro: 'bg-green-100 text-green-700',
  core: 'bg-blue-100 text-blue-700',
  apply: 'bg-purple-100 text-purple-700',
};

function TopicCard({ topic, onStart, starting }) {
  const modules = topic.modules || [];
  const milestoneCount = modules.reduce((s, m) => s + (m.milestones?.length || 0), 0);
  const totalPoints = modules.reduce((s, m) => s + (m.points || 0), 0);
  const difficulties = [...new Set(modules.map(m => m.difficulty).filter(Boolean))];

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-base">{topic.title}</h3>
            {topic.objective && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{topic.objective}</p>
            )}
          </div>
          <button
            type="button"
            disabled={!!starting}
            onClick={() => onStart(topic._id)}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 inline-flex items-center gap-2"
          >
            {starting === topic._id ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Starting...
              </>
            ) : 'Start learning'}
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            {modules.length} module{modules.length !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            {milestoneCount} milestones
          </span>
          {totalPoints > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              {totalPoints} pts
            </span>
          )}
          {difficulties.map(d => (
            <span key={d} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[d] || 'bg-gray-100 text-gray-600'}`}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StudentCourseTopicsPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const startCourseTopicSession = useSessionStore((s) => s.startCourseTopicSession);
  const [topics, setTopics] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchTopics = async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await courseApi.listPublishedTopics(courseId);
        const list = (res.data?.topics || []).filter((t) => t?.status === 'published');
        if (!cancelled) setTopics(list);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    fetchTopics();

    // If instructor unpublishes while student is on the page, refresh on focus/visibility.
    const onFocus = () => fetchTopics({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchTopics({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [courseId]);

  const start = async (topicId) => {
    setStarting(topicId);
    setError(null);
    try {
      await startCourseTopicSession(courseId, topicId);
      navigate('/chat', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <Link to="/courses" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        My courses
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-6">Course Topics</h1>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>&#9888;</span> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-gray-400">Loading topics...</div>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          <p className="text-gray-500 text-sm">No topics available yet.</p>
          <p className="text-gray-400 text-xs mt-1">Your instructor hasn't published any topics for this course.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topics.map((t) => (
            <TopicCard key={t._id} topic={t} onStart={start} starting={starting} />
          ))}
        </div>
      )}
    </div>
  );
}

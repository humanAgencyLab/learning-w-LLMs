import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as courseApi from '../../lib/courseApi';
import useSessionStore from '../../state/sessionStore';

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
    (async () => {
      setLoading(true);
      try {
        const res = await courseApi.listPublishedTopics(courseId);
        if (!cancelled) setTopics(res.data?.topics || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
      <Link to="/courses" className="text-sm text-blue-600 hover:underline">← My courses</Link>
      <h1 className="text-xl font-bold mt-2 mb-4">Published topics</h1>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="space-y-3">
          {topics.map((t) => (
            <li key={t._id} className="flex items-center justify-between border rounded p-3 bg-white">
              <div>
                <p className="font-medium">{t.title}</p>
                {t.objective && <p className="text-sm text-gray-600">{t.objective}</p>}
              </div>
              <button
                type="button"
                disabled={!!starting}
                onClick={() => start(t._id)}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm shrink-0"
              >
                {starting === t._id ? 'Starting…' : 'Start'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

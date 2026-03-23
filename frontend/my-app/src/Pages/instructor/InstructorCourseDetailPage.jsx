import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

export default function InstructorCourseDetailPage() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, tRes] = await Promise.all([
        instructorApi.getCourse(courseId),
        instructorApi.listTopics(courseId),
      ]);
      setCourse(cRes.data?.course);
      setTopics(tRes.data?.topics || []);
      setGlobalInstructions(cRes.data?.course?.globalInstructions || '');
      try {
        const aRes = await instructorApi.getCourseAnalytics(courseId);
        setAnalytics(aRes.data);
      } catch {
        setAnalytics(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [courseId]);

  const saveInstructions = async () => {
    setBusy(true);
    try {
      await instructorApi.updateCourse(courseId, { globalInstructions });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await instructorApi.uploadCourseSource(courseId, file);
      e.target.value = '';
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      await instructorApi.generateTopics(courseId);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !course) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full">
      <div className="mb-4">
        <Link to="/instructor/courses" className="text-sm text-blue-600 hover:underline">← Courses</Link>
      </div>
      <h1 className="text-xl font-bold mb-1">{course?.title}</h1>
      <p className="text-sm text-gray-500 mb-4">Access code: <strong>{course?.accessCode}</strong></p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      <section className="mb-6 border rounded p-4 bg-white">
        <h2 className="font-semibold mb-2">Global instructions (for AI)</h2>
        <textarea
          className="w-full border rounded p-2 text-sm min-h-[100px]"
          value={globalInstructions}
          onChange={(e) => setGlobalInstructions(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={saveInstructions}
          className="mt-2 bg-gray-800 text-white px-3 py-1 rounded text-sm"
        >
          Save instructions
        </button>
      </section>

      <section className="mb-6 border rounded p-4 bg-white">
        <h2 className="font-semibold mb-2">Sources</h2>
        <input type="file" onChange={onUpload} disabled={busy} />
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="ml-4 bg-purple-600 text-white px-3 py-1 rounded text-sm"
        >
          Generate topic drafts
        </button>
        <ul className="mt-2 text-sm text-gray-600">
          {(course?.sources || []).map((s) => (
            <li key={s._id}>{s.originalName} · {s.wordCount || 0} words</li>
          ))}
        </ul>
      </section>

      {analytics && (
        <section className="mb-6 border rounded p-4 bg-white">
          <h2 className="font-semibold mb-2">Analytics</h2>
          <p className="text-sm">Active enrollments: {analytics.enrollmentCount}</p>
          <p className="text-sm">Sessions started: {analytics.sessionCount}</p>
          <p className="text-sm">Completion rate: {analytics.completionRate}%</p>
        </section>
      )}

      <section className="border rounded p-4 bg-white">
        <h2 className="font-semibold mb-3">Topics</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => action(() => instructorApi.createTopic(courseId, { title: 'New draft topic' }))}
          className="mb-3 bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          Add draft topic
        </button>
        <ul className="space-y-3">
          {topics.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center gap-2 border-b pb-2">
              <Link className="text-blue-700 font-medium" to={`/instructor/courses/${courseId}/topics/${t._id}`}>
                {t.title}
              </Link>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{t.status}</span>
              {t.status === 'draft' && (
                <>
                  <button type="button" className="text-xs text-green-700" disabled={busy} onClick={() => action(() => instructorApi.approveTopic(courseId, t._id))}>Approve</button>
                  <button type="button" className="text-xs text-red-600" disabled={busy} onClick={() => action(() => instructorApi.deleteTopic(courseId, t._id))}>Delete</button>
                </>
              )}
              {t.status === 'approved' && (
                <button type="button" className="text-xs text-green-700" disabled={busy} onClick={() => action(() => instructorApi.publishTopic(courseId, t._id))}>Publish</button>
              )}
              {t.status === 'published' && (
                <button type="button" className="text-xs text-orange-700" disabled={busy} onClick={() => action(() => instructorApi.unpublishTopic(courseId, t._id))}>Unpublish</button>
              )}
              {t.status === 'unpublished' && (
                <button type="button" className="text-xs text-green-700" disabled={busy} onClick={() => action(() => instructorApi.publishTopic(courseId, t._id))}>Publish again</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

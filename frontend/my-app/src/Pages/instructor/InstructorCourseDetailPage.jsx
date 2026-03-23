import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  approved: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  published: 'bg-green-50 text-green-700 border-green-200',
  unpublished: 'bg-red-50 text-red-600 border-red-200',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 min-w-[120px]">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function TopicCard({ topic, courseId, busy, onAction }) {
  const status = topic.status;
  const moduleCount = topic.modules?.length || 0;
  const milestoneCount = (topic.modules || []).reduce((s, m) => s + (m.milestones?.length || 0), 0);

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 flex items-start gap-4 hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Link
            className="font-medium text-gray-900 hover:text-blue-700 truncate transition-colors"
            to={`/instructor/courses/${courseId}/topics/${topic._id}`}
          >
            {topic.title}
          </Link>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
            {status}
          </span>
        </div>
        {topic.objective && (
          <p className="text-sm text-gray-500 line-clamp-1">{topic.objective}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {moduleCount} module{moduleCount !== 1 ? 's' : ''} · {milestoneCount} milestones
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {status === 'draft' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(() => instructorApi.approveTopic(courseId, topic._id))}
              className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(() => instructorApi.deleteTopic(courseId, topic._id))}
              className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
        {status === 'approved' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(() => instructorApi.publishTopic(courseId, topic._id))}
            className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            Publish
          </button>
        )}
        {status === 'published' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(() => instructorApi.unpublishTopic(courseId, topic._id))}
            className="text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            Unpublish
          </button>
        )}
        {status === 'unpublished' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(() => instructorApi.publishTopic(courseId, topic._id))}
            className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            Re-publish
          </button>
        )}
        <Link
          to={`/instructor/courses/${courseId}/topics/${topic._id}`}
          className="text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

export default function InstructorCourseDetailPage() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [instrSaved, setInstrSaved] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
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
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const saveInstructions = async () => {
    setBusy(true);
    setInstrSaved(false);
    try {
      await instructorApi.updateCourse(courseId, { globalInstructions });
      setInstrSaved(true);
      setTimeout(() => setInstrSaved(false), 2000);
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
    setGenerating(true);
    try {
      await instructorApi.generateTopics(courseId);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
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
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading course...</div>
      </div>
    );
  }

  const publishedCount = topics.filter(t => t.status === 'published').length;
  const draftCount = topics.filter(t => t.status === 'draft').length;

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full pb-12">
      {/* Navigation */}
      <Link to="/instructor/courses" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        All courses
      </Link>

      {/* Header */}
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{course?.title}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm text-gray-500">
            Access code: <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{course?.accessCode}</span>
          </span>
          <CopyButton text={course?.accessCode || ''} />
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${course?.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {course?.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>&#9888;</span> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Analytics */}
      {analytics && (
        <div className="flex gap-3 mb-6 flex-wrap">
          <StatCard label="Enrolled" value={analytics.enrollmentCount ?? 0} />
          <StatCard label="Sessions" value={analytics.sessionCount ?? 0} />
          <StatCard label="Completion" value={`${analytics.completionRate ?? 0}%`} />
          <StatCard label="Topics" value={topics.length} sub={`${publishedCount} published`} />
        </div>
      )}

      {/* Student progress link */}
      {analytics && analytics.enrollmentCount > 0 && (
        <Link
          to={`/instructor/courses/${courseId}/students`}
          className="mb-6 flex items-center justify-between border border-gray-200 rounded-xl bg-white px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div>
            <h3 className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Student Progress</h3>
            <p className="text-xs text-gray-500 mt-0.5">View per-student progress, quiz results, and identify struggling students.</p>
          </div>
          <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Global Instructions */}
      <section className="mb-6 border border-gray-200 rounded-xl bg-white p-5">
        <h2 className="font-semibold text-gray-800 mb-2">AI Teaching Instructions</h2>
        <p className="text-xs text-gray-500 mb-3">Guide how the AI teaches your students. These instructions apply to all topics in this course.</p>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm min-h-[100px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-y"
          value={globalInstructions}
          onChange={(e) => setGlobalInstructions(e.target.value)}
          placeholder="e.g. Use real-world examples, keep explanations concise, focus on practical application..."
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            disabled={busy}
            onClick={saveInstructions}
            className="bg-gray-800 hover:bg-gray-900 disabled:bg-gray-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
          {instrSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
        </div>
      </section>

      {/* Sources & Generation */}
      <section className="mb-6 border border-gray-200 rounded-xl bg-white p-5">
        <h2 className="font-semibold text-gray-800 mb-2">Course Materials</h2>
        <p className="text-xs text-gray-500 mb-3">Upload materials and generate topic structures from them.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-sm px-4 py-1.5 rounded-lg transition-colors">
            Upload file
            <input type="file" onChange={onUpload} disabled={busy} className="hidden" />
          </label>
          <button
            type="button"
            disabled={generating || busy}
            onClick={onGenerate}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            {generating && (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            )}
            {generating ? 'Generating...' : 'Generate topic drafts'}
          </button>
        </div>
        {(course?.sources?.length > 0) && (
          <ul className="mt-3 space-y-1">
            {course.sources.map((s) => (
              <li key={s._id} className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span>{s.originalName}</span>
                <span className="text-xs text-gray-400">{s.wordCount?.toLocaleString() || 0} words</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Topics */}
      <section className="border border-gray-200 rounded-xl bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Topics ({topics.length})</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => action(() => instructorApi.createTopic(courseId, { title: 'New draft topic' }))}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add topic
          </button>
        </div>
        {topics.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-400 text-sm mb-1">No topics yet</p>
            <p className="text-xs text-gray-400">Upload materials and generate topics, or create one manually.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((t) => (
              <TopicCard key={t._id} topic={t} courseId={courseId} busy={busy} onAction={action} />
            ))}
          </div>
        )}
        {draftCount > 0 && publishedCount === 0 && (
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg px-3 py-2">
            You have {draftCount} draft topic{draftCount > 1 ? 's' : ''}. Approve and publish them so students can see them.
          </p>
        )}
      </section>
    </div>
  );
}

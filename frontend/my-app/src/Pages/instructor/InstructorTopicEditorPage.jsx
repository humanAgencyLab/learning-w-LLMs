import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

export default function InstructorTopicEditorPage() {
  const { courseId, topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [modulesJson, setModulesJson] = useState('[]');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await instructorApi.getTopic(courseId, topicId);
      const t = res.data?.topic;
      setTopic(t);
      setTitle(t?.title || '');
      setObjective(t?.objective || '');
      setModulesJson(JSON.stringify(t?.modules || [], null, 2));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [courseId, topicId]);

  const save = async () => {
    setError(null);
    try {
      const modules = JSON.parse(modulesJson);
      await instructorApi.updateTopic(courseId, topicId, { title, objective, modules });
      await load();
    } catch (e) {
      setError(e.message || 'Invalid JSON or save failed');
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full">
      <Link to={`/instructor/courses/${courseId}`} className="text-sm text-blue-600 hover:underline">← Back to course</Link>
      <h1 className="text-xl font-bold mt-2 mb-4">Edit topic</h1>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <label className="block text-sm font-medium mb-1">Title</label>
      <input className="w-full border rounded px-3 py-2 mb-3" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm font-medium mb-1">Objective</label>
      <textarea className="w-full border rounded px-3 py-2 mb-3 min-h-[60px]" value={objective} onChange={(e) => setObjective(e.target.value)} />
      <label className="block text-sm font-medium mb-1">Modules (JSON)</label>
      <textarea
        className="w-full border rounded p-2 font-mono text-xs min-h-[320px]"
        value={modulesJson}
        onChange={(e) => setModulesJson(e.target.value)}
      />
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Each module needs moduleId, title, description, difficulty (intro|core|apply), points, milestones: [&#123; text &#125;] (2–8 each).
      </p>
      <button type="button" onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
        Save
      </button>
      <p className="text-sm text-gray-600 mt-4">Status: <strong>{topic?.status}</strong></p>
    </div>
  );
}

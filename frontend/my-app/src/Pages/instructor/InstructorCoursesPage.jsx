import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await instructorApi.listInstructorCourses();
      setCourses(res.data?.courses || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await instructorApi.createCourse({ title: title.trim() });
      setTitle('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <h1 className="text-xl font-bold mb-4">Your courses</h1>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          placeholder="New course title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
          Create
        </button>
      </form>
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => (
            <li key={c._id}>
              <Link className="text-blue-700 hover:underline" to={`/instructor/courses/${c._id}`}>
                {c.title}
              </Link>
              <span className="text-gray-400 text-sm ml-2">({c.status}) · code {c.accessCode}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

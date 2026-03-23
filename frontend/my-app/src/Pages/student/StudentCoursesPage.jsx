import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as courseApi from '../../lib/courseApi';

export default function StudentCoursesPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await courseApi.listMyCourses();
      setEnrollments(res.data?.enrollments || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await courseApi.joinCourse({ accessCode: code.trim() });
      setCode('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <h1 className="text-xl font-bold mb-4">My courses</h1>
      <form onSubmit={join} className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm uppercase"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm">
          Join
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {enrollments.map((en) => {
            const c = en.courseId;
            const id = typeof c === 'object' && c?._id ? c._id : c;
            const title = typeof c === 'object' && c?.title ? c.title : 'Course';
            return (
              <li key={en._id}>
                <Link className="text-blue-700 hover:underline" to={`/courses/${id}/topics`}>
                  {title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

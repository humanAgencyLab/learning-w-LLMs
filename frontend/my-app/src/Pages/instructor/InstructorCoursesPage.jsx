import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

/**
 * PR-6 Courses list (mockup isCourses block). Course meta (enrollment +
 * at-risk chip) comes from getInstructorOverview's perCourse — the SAME
 * canonical Critical+High count the Dashboard uses (computed server-side by
 * getAtRiskStudents; class-context overrides excluded). One aggregate fetch;
 * no per-course at-risk requests.
 *
 * NOTE: no aggregate endpoint returns a published-topic count per course, so
 * the meta line's third segment shows the pass rate instead of the mockup's
 * "{published} published".
 */
export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [overviewMap, setOverviewMap] = useState({});
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await instructorApi.listInstructorCourses();
      setCourses(res.data?.courses || []);
      // Non-fatal enrichment: enrollment + canonical at-risk counts per course.
      try {
        const oRes = await instructorApi.getInstructorOverview({ includeSynthetic: true });
        const map = {};
        for (const c of oRes.data?.perCourse || []) map[c.courseId] = c;
        setOverviewMap(map);
      } catch {
        setOverviewMap({});
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await instructorApi.createCourse({ title: title.trim() });
      setTitle('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight animate-fadeIn">Your courses</h1>
        <p className="text-sm text-ink-500 mt-1.5">Create a course, then add a syllabus to generate topics.</p>

        {error && (
          <div className="mt-4 px-4 py-2.5 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical flex items-center gap-2">
            <span>&#9888;</span> {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto text-risk-criticalAccent hover:text-risk-critical">&times;</button>
          </div>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate} className="flex gap-3 mt-5 animate-riseIn">
          <input
            className="flex-1 bg-surface border border-hairline-strong rounded-xl px-4 py-3 font-sans text-sm text-ink-900 placeholder-ink-300 focus:border-brand focus:ring-2 focus:ring-brand outline-none transition-all"
            placeholder="New course name, e.g. CPS 1231 — Fall"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="bg-brand text-white rounded-xl px-6 font-bold text-sm hover:bg-brand-pressed disabled:opacity-50 transition-colors shrink-0"
          >
            {creating ? 'Creating...' : 'Create course'}
          </button>
        </form>

        {/* Course list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse text-ink-300">Loading courses...</div>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 mt-5 border-2 border-dashed border-hairline rounded-2xl">
            <p className="text-ink-500 text-sm">No courses yet.</p>
            <p className="text-ink-300 text-xs mt-1">Create your first course to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-5 animate-riseIn">
            {courses.map((c) => {
              const ov = overviewMap[c._id] || {};
              const attention = ov.atRiskCount || 0;
              return (
                <Link
                  key={c._id}
                  to={`/instructor/courses/${c._id}`}
                  className="flex items-center gap-4 bg-surface border border-hairline rounded-2xl shadow-card p-5 hover:border-brand-tintBorder hover:shadow-card-hover transition-all"
                >
                  <span className="w-11 h-11 rounded-xl bg-brand-tint text-brand flex items-center justify-center flex-shrink-0">
                    <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6.5C10.5 5 8 4.6 4 4.6V19c4 0 5.6.4 8 2 2.4-1.6 4-2 8-2V4.6c-4 0-5.5.4-8 1.9Z" />
                      <path d="M12 6.5V21" />
                    </svg>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-ink-900 text-base truncate">{c.title}</span>
                    <span className="block text-xs text-ink-300 mt-0.5">
                      Code <span className="font-mono text-ink-500">{c.accessCode}</span>
                      {ov.enrollmentCount != null && <> · {ov.enrollmentCount} enrolled</>}
                      {/* attempts guard: backend returns passRate 0 (not null)
                          for courses with no attempts — hide the misleading 0% */}
                      {ov.passRate != null && ov.attempts > 0 && <> · {ov.passRate}% pass rate</>}
                    </span>
                  </span>
                  {attention > 0 && (
                    <span className="text-xs font-bold text-risk-critical bg-risk-criticalTint border border-risk-criticalBorder rounded-md px-2.5 py-1 whitespace-nowrap">
                      {attention} need attention
                    </span>
                  )}
                  <span className="text-ink-100 text-lg">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

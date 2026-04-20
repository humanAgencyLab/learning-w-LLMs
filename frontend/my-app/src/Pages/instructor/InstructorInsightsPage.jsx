import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import CourseTreeView from '../../components/instructor/CourseTreeView';
import MilestoneBarDrilldown from '../../components/instructor/charts/MilestoneBarDrilldown';
import TopicStudentHeatmap from '../../components/instructor/charts/TopicStudentHeatmap';

function SectionCard({ title, children, right }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function AtRiskPanel({ rows }) {
  if (!rows) return null;
  const atRisk = rows.filter((r) => r.atRisk);
  if (atRisk.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No students currently flagged as at-risk in this course.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {atRisk.map((r) => (
        <div
          key={r.studentId}
          className="flex items-center gap-3 p-3 border border-rose-200 bg-rose-50/40 rounded-lg"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{r.name || r.username}</span>
              {r.isSynthetic && (
                <span
                  className="text-[9px] uppercase px-1 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200"
                  title={r.personaTag || 'Synthetic student'}
                >
                  syn
                </span>
              )}
              <span className="text-xs text-gray-500">@{r.username}</span>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {r.attempts} attempts · {r.passRate}% pass · {r.attemptsPerMilestone} per milestone
              {r.autoAdvanced > 0 && ` · ${r.autoAdvanced} auto-advance`}
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {r.flags.map((f) => (
                <span
                  key={f}
                  className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200"
                >
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InstructorInsightsPage() {
  const { courseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [atRisk, setAtRisk] = useState([]);
  const [heatmap, setHeatmap] = useState({ topics: [], students: [] });
  const [courseTitle, setCourseTitle] = useState('');
  const [includeSynthetic, setIncludeSynthetic] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [courseRes, treeRes, msRes, arRes, hmRes] = await Promise.all([
        instructorApi.getCourse(courseId),
        instructorApi.getCourseTree(courseId, { includeSynthetic }),
        instructorApi.getMilestoneStats(courseId, { includeSynthetic }),
        instructorApi.getAtRiskStudents(courseId, { includeSynthetic }),
        instructorApi.getTopicStudentHeatmap(courseId, { includeSynthetic }),
      ]);
      setCourseTitle(courseRes?.data?.course?.title || courseRes?.data?.title || '');
      setTree(treeRes?.data || null);
      setMilestones(msRes?.data || []);
      setAtRisk(arRes?.data || []);
      setHeatmap(hmRes?.data || { topics: [], students: [] });
    } catch (e) {
      setError(e?.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [courseId, includeSynthetic]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Link to="/instructor/dashboard" className="hover:text-blue-700">Dashboard</Link>
            <span>/</span>
            <Link to={`/instructor/courses/${courseId}`} className="hover:text-blue-700">Course</Link>
            <span>/</span>
            <span>Insights</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {courseTitle ? `${courseTitle} — Insights` : 'Course Insights'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={includeSynthetic}
              onChange={(e) => setIncludeSynthetic(e.target.checked)}
            />
            Include synthetic cohort
          </label>
          <Link
            to={`/instructor/courses/${courseId}`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Edit course
          </Link>
          <Link
            to={`/instructor/courses/${courseId}/students`}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Students
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading insights…</div>
      ) : (
        <>
          <SectionCard title="Course structure with attempt rollups">
            <CourseTreeView tree={tree} />
          </SectionCard>

          <SectionCard title="Milestone difficulty">
            <MilestoneBarDrilldown milestones={milestones} />
          </SectionCard>

          <SectionCard title="Topic × student heatmap">
            <TopicStudentHeatmap topics={heatmap.topics} students={heatmap.students} />
          </SectionCard>

          <SectionCard title="Students flagged as at-risk">
            <AtRiskPanel rows={atRisk} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import CourseTreeView from '../../components/instructor/CourseTreeView';
import MilestoneBarDrilldown from '../../components/instructor/charts/MilestoneBarDrilldown';
import TopicStudentHeatmap from '../../components/instructor/charts/TopicStudentHeatmap';
import InsightCards from '../../components/instructor/InsightCards';
import PerformanceKPIStrip from '../../components/instructor/performance/PerformanceKPIStrip';
import ScoreDistributionChart from '../../components/instructor/performance/ScoreDistributionChart';
import CompletionFunnel from '../../components/instructor/performance/CompletionFunnel';
import QuizByTopicTable from '../../components/instructor/performance/QuizByTopicTable';

/**
 * Phase F Insights page:
 *
 *   Header
 *   → PerformanceKPIStrip (6 dense numeric tiles, density-first scan)
 *   → InsightCards (3–5 narrative cards, each linking to a chart below)
 *   → ScoreDistributionChart (shape of the class — where students land)
 *   → CompletionFunnel (where students drop off)
 *   → CourseTreeView (structure + rollups)
 *   → MilestoneBarDrilldown (hardest milestones; tile 6 scrolls here)
 *   → QuizByTopicTable (which quizzes are hard)
 *   → TopicStudentHeatmap (per-student topic-level shape)
 *   → AtRiskPanel (students needing intervention)
 *
 * Deliberately dropped vs. backend payload: weekly engagement, time-to-complete,
 * and module-difficulty table — those describe pattern, not struggle signal.
 *
 * `chartRefs` stays wired to the InsightCards vocabulary
 * ('tree' | 'milestones' | 'heatmap' | 'atRisk') so each narrative card can
 * still scroll-to-and-flash a specific chart. The new KPI strip reuses that
 * same milestonesRef for its "Hardest module" tile.
 */

function SectionCard({ title, eyebrow, children, right, innerRef }) {
  return (
    <section
      ref={innerRef}
      className="bg-white border border-gray-200 rounded-xl p-5 scroll-mt-6"
    >
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold mb-0.5">
              {eyebrow}
            </p>
          )}
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function AtRiskPanel({ rows, courseId }) {
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
        <Link
          key={r.studentId}
          to={`/instructor/courses/${courseId}/students/${r.studentId}`}
          state={{ atRiskFlags: r.flags, fromInsights: true }}
          className="flex items-center gap-3 p-3 border border-rose-200 bg-rose-50/40 rounded-lg cursor-pointer hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              {/* Quiz numbers only — all from the same submitted, non-revision
                  attempt set so avg and pass rate are always consistent. (Was
                  mixing the quiz avg with the milestone pass rate.) */}
              {r.quizAttemptCount > 0
                ? `${r.quizScore != null ? `${r.quizScore}% quiz avg · ` : ''}${r.quizPassRate}% quiz pass · ${r.quizAttemptCount} quiz attempt${r.quizAttemptCount === 1 ? '' : 's'}`
                : 'No quiz data'}
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
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
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
  const [performance, setPerformance] = useState(null);
  const [performanceAvailable, setPerformanceAvailable] = useState(true);
  const [courseTitle, setCourseTitle] = useState('');
  const [includeSynthetic, setIncludeSynthetic] = useState(true);

  // Refs into each chart section so InsightCards can scroll to them. The
  // keys match `instructorBriefingAgent.CHART_REFS` — when that vocabulary
  // changes both sides must stay in sync. The KPI strip's hardest-module
  // tile piggybacks on `milestonesRef` because that's where the drill-down
  // visualization lives.
  const treeRef = useRef(null);
  const milestonesRef = useRef(null);
  const heatmapRef = useRef(null);
  const atRiskRef = useRef(null);
  const chartRefs = useMemo(
    () => ({ tree: treeRef, milestones: milestonesRef, heatmap: heatmapRef, atRisk: atRiskRef }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Performance summary is fetched alongside the other four calls so
      // the whole page renders in one tick. Wrapped in .catch — if the
      // perf endpoint itself errors, the four original charts still work.
      const [courseRes, treeRes, msRes, arRes, hmRes, perfRes] = await Promise.all([
        instructorApi.getCourse(courseId),
        instructorApi.getCourseTree(courseId, { includeSynthetic }),
        instructorApi.getMilestoneStats(courseId, { includeSynthetic }),
        instructorApi.getAtRiskStudents(courseId, { includeSynthetic }),
        instructorApi.getTopicStudentHeatmap(courseId, { includeSynthetic }),
        instructorApi.getCoursePerformanceSummary(courseId).catch((e) => {
          // Non-fatal — KPI strip renders a polite one-liner.
          console.warn('[insights] performance summary unavailable:', e?.message);
          return null;
        }),
      ]);
      setCourseTitle(courseRes?.data?.course?.title || courseRes?.data?.title || '');
      setTree(treeRes?.data || null);
      setMilestones(msRes?.data || []);
      setAtRisk(arRes?.data || []);
      setHeatmap(hmRes?.data || { topics: [], students: [] });
      const perfPayload = perfRes?.data || null;
      setPerformance(perfPayload);
      setPerformanceAvailable(Boolean(perfPayload));
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

      {/* 1) Density-first numeric strip. Hardest-module tile scrolls + flashes
          the milestone drilldown section below. */}
      <PerformanceKPIStrip
        loading={loading}
        performance={performance}
        hardestModuleRef={milestonesRef}
      />

      {!performanceAvailable && !loading && (
        <div className="text-xs text-gray-500 -mt-3">
          Performance data unavailable right now — the charts below still render.
        </div>
      )}

      {/* 2) Narrative cards frame the charts. "View chart" scrolls to the
          matching SectionCard below, with a brief highlight flash. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">What stands out</h2>
          <p className="text-xs text-gray-500">
            Agent-generated &mdash; every claim is grounded in this course&apos;s data.
          </p>
        </div>
        <InsightCards
          courseId={courseId}
          chartRefs={chartRefs}
          includeSynthetic={includeSynthetic}
        />
      </section>

      {loading ? (
        <div className="text-sm text-gray-500">Loading charts…</div>
      ) : (
        <>
          {performance && (
            <SectionCard
              eyebrow="Where the class lands"
              title="Score distribution"
            >
              <ScoreDistributionChart scoreDistribution={performance.scoreDistribution} />
            </SectionCard>
          )}

          {performance && (
            <SectionCard
              eyebrow="Where students drop off"
              title="Completion funnel"
            >
              <CompletionFunnel
                funnel={performance.funnel}
                enrollmentCount={performance.enrollmentCount}
              />
            </SectionCard>
          )}

          <SectionCard innerRef={treeRef} title="Course structure with attempt rollups">
            <CourseTreeView
              tree={tree}
              moduleDifficulty={performance?.moduleDifficulty || []}
            />
          </SectionCard>

          <SectionCard innerRef={milestonesRef} title="Milestone difficulty">
            <MilestoneBarDrilldown milestones={milestones} />
          </SectionCard>

          {performance && (
            <SectionCard
              eyebrow="Quizzes that aren't clicking yet"
              title="Quiz difficulty by topic"
            >
              <QuizByTopicTable quizByTopic={performance.quizByTopic} />
            </SectionCard>
          )}

          <SectionCard innerRef={heatmapRef} title="Topic × student heatmap">
            <TopicStudentHeatmap topics={heatmap.topics} students={heatmap.students} />
          </SectionCard>

          <SectionCard innerRef={atRiskRef} title="Students flagged as at-risk">
            <AtRiskPanel rows={atRisk} courseId={courseId} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

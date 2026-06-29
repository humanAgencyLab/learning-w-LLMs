import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import CourseTreeView from '../../components/instructor/CourseTreeView';
import MilestoneBarDrilldown from '../../components/instructor/charts/MilestoneBarDrilldown';
import TopicStudentHeatmap from '../../components/instructor/charts/TopicStudentHeatmap';
import InsightCards from '../../components/instructor/InsightCards';
import ScoreDistributionChart from '../../components/instructor/performance/ScoreDistributionChart';
import CompletionFunnel from '../../components/instructor/performance/CompletionFunnel';
import QuizByTopicTable from '../../components/instructor/performance/QuizByTopicTable';
import RiskDistributionChart from '../../components/instructor/RiskDistributionChart';
import CollapsibleSection from '../../components/instructor/CollapsibleSection';
import TopHardestTopics from '../../components/instructor/TopHardestTopics';
import { riskMeta, flagLabel, driverPhrase, FLAG_CHIPS, CLASS_OVERRIDE_BORDER } from '../../components/instructor/riskLevel';

/**
 * Insights page IA v2 (Proposal A) — task-organized:
 *   [Compact KPIs] [Hot Signal narrative]
 *   == What should I cover in lecture? ==   (TopHardestTopics)
 *   == Who should I reach before class? ==  (compact risk chart + at-risk panel)
 *   == Course Health ==  (collapsed; sub-expanders for the reference charts)
 */

function KpiTile({ label, value, title }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4" title={title}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function relativeDays(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

function FilterChips({ levelFilter, setLevelFilter, flagFilters, setFlagFilters }) {
  const toggleFlag = (key) =>
    setFlagFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const active = !!levelFilter || flagFilters.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <button
        type="button"
        onClick={() => setLevelFilter(null)}
        className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${levelFilter === null ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
      >
        All
      </button>
      {['critical', 'high', 'watch'].map((lvl) => {
        const m = riskMeta(lvl);
        const on = levelFilter === lvl;
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => setLevelFilter(on ? null : lvl)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${on ? m.chip : m.chipIdle}`}
          >
            {m.label}{on ? ' ×' : ''}
          </button>
        );
      })}
      <span className="w-px h-4 bg-gray-200 mx-1" />
      {FLAG_CHIPS.map((f) => {
        const on = flagFilters.includes(f.key);
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => toggleFlag(f.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            {f.label}{on ? ' ×' : ''}
          </button>
        );
      })}
      {active && (
        <button type="button" onClick={() => { setLevelFilter(null); setFlagFilters([]); }} className="text-[11px] text-blue-600 hover:text-blue-800 ml-1">
          Clear filters
        </button>
      )}
    </div>
  );
}

function RiskRow({ r, courseId, publishedN }) {
  const meta = riskMeta(r.riskLevel);
  const isWell = r.classContext === 'doing_well_in_class';
  const isConfirmed = r.classContext === 'confirmed_at_risk';
  const borderCls = isWell ? CLASS_OVERRIDE_BORDER : (isConfirmed ? meta.leftBorderHeavy : meta.leftBorder);
  const noEng = (r.flags || []).includes('no_engagement');
  const driver = driverPhrase(r.dominantDriver);
  const quizzed = r.attemptedQuizTopics ?? 0;
  const touched = r.attemptedPublished ?? 0;
  const pubN = r.publishedN ?? publishedN ?? 0;

  return (
    <Link
      key={r.studentId}
      to={`/instructor/courses/${courseId}/students/${r.studentId}`}
      state={{ atRiskFlags: r.flags, fromInsights: true }}
      className={`flex items-center gap-3 p-3 border border-gray-200 ${borderCls} bg-white rounded-lg cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{r.name || r.username}</span>
          {r.isSynthetic && (
            <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200" title={r.personaTag || 'Synthetic student'}>syn</span>
          )}
          <span className="text-xs text-gray-500">@{r.username}</span>
        </div>
        <div className="text-xs text-gray-600 mt-0.5">
          {noEng && r.joinedAt ? `Joined ${relativeDays(r.joinedAt)} · ` : ''}
          {quizzed} of {pubN} quizzed · {touched} touched
          {r.avgQuizScore != null ? ` · avg ${r.avgQuizScore}%` : ' · no quiz data'}
        </div>
        {driver && <div className="text-xs text-gray-500 mt-0.5">mostly: {driver}</div>}
        <div className="flex gap-1 mt-1 flex-wrap items-center">
          {(r.flags || []).map((f) => (
            <span key={f} className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${meta.pill}`}>{flagLabel(f)}</span>
          ))}
          {r.persistence_score != null && r.persistence_score >= 60 && (
            <span
              className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200"
              title="This student retries and eventually passes — grinding, not quitting"
            >
              Persists — passes on retry
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
        {isWell && (
          <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-gray-200 text-gray-600 border border-gray-300" title="Instructor marked this student as doing well in class">Class override</span>
        )}
        {isConfirmed && (
          <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300" title="Instructor confirmed this student is at-risk in class">Confirmed in class</span>
        )}
        <span className={`text-sm font-bold px-2 py-0.5 rounded border ${isWell ? 'bg-gray-100 text-gray-500 border-gray-200' : meta.pill}`}>{r.riskScore}/100</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{isWell ? 'Class OK' : meta.label}</span>
      </div>
      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default function InstructorInsightsPage() {
  const { courseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [riskRows, setRiskRows] = useState([]);
  const [riskTopics, setRiskTopics] = useState([]);
  const [heatmap, setHeatmap] = useState({ topics: [], students: [] });
  const [performance, setPerformance] = useState(null);
  const [performanceAvailable, setPerformanceAvailable] = useState(true);
  const [analytics, setAnalytics] = useState(null); // session-completion KPI
  const [courseTitle, setCourseTitle] = useState('');
  const [includeSynthetic, setIncludeSynthetic] = useState(true);

  // Risk panel/chart filter state.
  const [levelFilter, setLevelFilter] = useState(null);
  const [flagFilters, setFlagFilters] = useState([]);
  const [topicFilter, setTopicFilter] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [distData, setDistData] = useState(null);
  const [distLoading, setDistLoading] = useState(false);

  // Course Health expand state (controlled so "View all topic data" can open it).
  const [courseHealthOpen, setCourseHealthOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const heatmapRef = useRef(null);
  const whoToReachRef = useRef(null);
  const courseHealthRef = useRef(null);
  // InsightCards keeps its "View chart" deep-links (component unchanged). In the
  // new IA the at-risk card scrolls to Section 2; tree/milestones/heatmap cards
  // scroll to the (collapsed) Course Health section where those charts now live.
  const chartRefs = useMemo(
    () => ({ atRisk: whoToReachRef, tree: courseHealthRef, milestones: courseHealthRef, heatmap: courseHealthRef }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [courseRes, treeRes, msRes, riskRes, hmRes, perfRes, analyticsRes] = await Promise.all([
        instructorApi.getCourse(courseId),
        instructorApi.getCourseTree(courseId, { includeSynthetic }),
        instructorApi.getMilestoneStats(courseId, { includeSynthetic }),
        instructorApi.getRiskDistribution(courseId, { includeSynthetic }),
        instructorApi.getTopicStudentHeatmap(courseId, { includeSynthetic }),
        instructorApi.getCoursePerformanceSummary(courseId).catch((e) => {
          console.warn('[insights] performance summary unavailable:', e?.message);
          return null;
        }),
        instructorApi.getCourseAnalytics(courseId).catch(() => null),
      ]);
      setCourseTitle(courseRes?.data?.course?.title || courseRes?.data?.title || '');
      setTree(treeRes?.data || null);
      setMilestones(msRes?.data || []);
      setRiskRows(riskRes?.data?.rows || []);
      setRiskTopics(riskRes?.data?.topics || []);
      setHeatmap(hmRes?.data || { topics: [], students: [] });
      const perfPayload = perfRes?.data || null;
      setPerformance(perfPayload);
      setPerformanceAvailable(Boolean(perfPayload));
      setAnalytics(analyticsRes?.data || null);
    } catch (e) {
      setError(e?.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [courseId, includeSynthetic]);

  useEffect(() => { load(); }, [load]);

  // Re-score against a topic / snapshot subset when those filters change.
  useEffect(() => {
    if (!topicFilter && !snapshot) { setDistData(null); return undefined; }
    let cancelled = false;
    setDistLoading(true);
    instructorApi.getRiskDistribution(courseId, { includeSynthetic, topicId: topicFilter, upToTopic: snapshot })
      .then((res) => { if (!cancelled) setDistData(res?.data || null); })
      .catch(() => { if (!cancelled) setDistData(null); })
      .finally(() => { if (!cancelled) setDistLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, includeSynthetic, topicFilter, snapshot]);

  const publishedN = riskTopics.length;
  const enrolledCount = performance?.enrollmentCount ?? heatmap.students.length;
  const baseRows = (topicFilter || snapshot) && distData ? (distData.rows || []) : riskRows;
  const atRiskCount = baseRows.filter((r) => r.riskLevel !== 'healthy').length;
  const filtersActive = !!levelFilter || flagFilters.length > 0;
  const panelRows = baseRows
    .filter((r) => r.riskLevel !== 'healthy')
    .filter((r) => !levelFilter || r.riskLevel === levelFilter)
    .filter((r) => flagFilters.length === 0 || flagFilters.some((f) => (r.flags || []).includes(f)))
    .sort((a, b) => b.riskScore - a.riskScore);

  // Headline at-risk (Critical + High), matches the dashboard tile.
  const headlineAtRisk = riskRows.filter((r) => r.atRisk).length;
  const sessionCompletion = analytics && analytics.sessionCount > 0
    ? Math.round((analytics.completedSessionCount / analytics.sessionCount) * 100)
    : null;

  const openHeatmapDeepLink = () => {
    setCourseHealthOpen(true);
    setHeatmapOpen(true);
    setTimeout(() => heatmapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

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
          <h1 className="text-2xl font-bold text-gray-900">{courseTitle ? `${courseTitle} — Insights` : 'Course Insights'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={includeSynthetic} onChange={(e) => setIncludeSynthetic(e.target.checked)} />
            Include synthetic cohort
          </label>
          <Link to={`/instructor/courses/${courseId}`} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Edit course</Link>
          <Link to={`/instructor/courses/${courseId}/students`} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Students</Link>
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">{error}</div>}

      {/* Compact KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total students" value={enrolledCount} />
        <KpiTile
          label="Session completion"
          value={sessionCompletion == null ? '—' : `${sessionCompletion}%`}
          title="Percentage of student sessions that reached the 'completed' phase"
        />
        <KpiTile
          label="At-risk"
          value={headlineAtRisk}
          title="Students at highest urgency: Critical or High risk. Watch-tier students appear in the panel below, not in this count."
        />
      </div>

      {/* Hot Signal narrative (unchanged) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">What stands out</h2>
          <p className="text-xs text-gray-500">Agent-generated &mdash; every claim is grounded in this course&apos;s data.</p>
        </div>
        <InsightCards courseId={courseId} chartRefs={chartRefs} includeSynthetic={includeSynthetic} />
      </section>

      {loading ? (
        <div className="text-sm text-gray-500">Loading insights…</div>
      ) : (
        <>
          {/* ===== What should I cover in lecture? ===== */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">What should I cover in lecture?</h2>
            <TopHardestTopics
              heatmap={heatmap}
              moduleDifficulty={performance?.moduleDifficulty || []}
              enrolledCount={enrolledCount}
              onViewAllTopicData={openHeatmapDeepLink}
            />
          </section>

          {/* ===== Who should I reach before class? ===== */}
          <section className="space-y-3 scroll-mt-6" ref={whoToReachRef}>
            <h2 className="text-lg font-bold text-gray-900">Who should I reach before class?</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <RiskDistributionChart
                compact
                rows={baseRows}
                topics={riskTopics}
                publishedN={publishedN}
                topicFilter={topicFilter}
                snapshot={snapshot}
                activeLevel={levelFilter}
                onSelectLevel={(lvl) => setLevelFilter((prev) => (prev === lvl ? null : lvl))}
                loading={distLoading}
              />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <FilterChips
                levelFilter={levelFilter}
                setLevelFilter={setLevelFilter}
                flagFilters={flagFilters}
                setFlagFilters={setFlagFilters}
              />
              <p className="text-xs text-gray-500 mb-3">
                {filtersActive
                  ? `Showing ${panelRows.length} of ${atRiskCount} at-risk students`
                  : `Showing ${atRiskCount} at-risk students (Critical + High + Watch)`}
                {(topicFilter || snapshot) && <span className="text-indigo-600"> · re-scored for the current chart filter</span>}
              </p>
              {panelRows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {atRiskCount === 0 ? 'No students currently flagged as at-risk in this course.' : 'No students match the current filters.'}
                </p>
              ) : (
                <div className={`space-y-2 ${distLoading ? 'opacity-50 transition-opacity' : ''}`}>
                  {panelRows.map((r) => (
                    <RiskRow key={r.studentId} r={r} courseId={courseId} publishedN={publishedN} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ===== Course Health (collapsed) ===== */}
          <CollapsibleSection
            title="Course Health"
            subtitle="reference charts"
            open={courseHealthOpen}
            onToggle={setCourseHealthOpen}
            innerRef={courseHealthRef}
          >
            <div className="space-y-3">
              <CollapsibleSection title="Score distribution">
                {performance
                  ? <ScoreDistributionChart scoreDistribution={performance.scoreDistribution} />
                  : <p className="text-sm text-gray-500">Performance data unavailable.</p>}
              </CollapsibleSection>

              <CollapsibleSection title="Completion funnel">
                {performance
                  ? <CompletionFunnel funnel={performance.funnel} enrollmentCount={performance.enrollmentCount} />
                  : <p className="text-sm text-gray-500">Performance data unavailable.</p>}
              </CollapsibleSection>

              <CollapsibleSection title="Course structure">
                <CourseTreeView tree={tree} moduleDifficulty={performance?.moduleDifficulty || []} />
              </CollapsibleSection>

              <CollapsibleSection
                title="Topic × student heatmap"
                open={heatmapOpen}
                onToggle={setHeatmapOpen}
                innerRef={heatmapRef}
              >
                {/* Topic + snapshot filters live here (moved from the inline chart).
                    Changing them re-scores the "Who should I reach" chart + panel above. */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-xs text-gray-500">Re-score risk by:</span>
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    value={topicFilter || ''}
                    onChange={(e) => { const v = e.target.value || null; setTopicFilter(v); if (v) setSnapshot(null); }}
                    title="Score the class against a single topic"
                  >
                    <option value="">All published topics</option>
                    {riskTopics.map((t) => (
                      <option key={t.topicId} value={t.topicId}>{t.title}</option>
                    ))}
                  </select>
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
                    value={snapshot || ''}
                    onChange={(e) => setSnapshot(e.target.value ? parseInt(e.target.value, 10) : null)}
                    disabled={!!topicFilter}
                    title="See the class as it was after only the first N topics"
                  >
                    <option value="">Current</option>
                    {Array.from({ length: publishedN }, (_, i) => i + 1).map((k) => (
                      <option key={k} value={k}>Up to topic {k}</option>
                    ))}
                  </select>
                  {(topicFilter || snapshot) && (
                    <button type="button" className="text-[11px] text-blue-600 hover:text-blue-800" onClick={() => { setTopicFilter(null); setSnapshot(null); }}>
                      Reset
                    </button>
                  )}
                </div>
                <TopicStudentHeatmap topics={heatmap.topics} students={heatmap.students} />
              </CollapsibleSection>

              <CollapsibleSection title="Quiz difficulty by topic">
                {performance
                  ? <QuizByTopicTable quizByTopic={performance.quizByTopic} />
                  : <p className="text-sm text-gray-500">Performance data unavailable.</p>}
              </CollapsibleSection>

              <CollapsibleSection title="Milestone difficulty">
                <MilestoneBarDrilldown milestones={milestones} />
              </CollapsibleSection>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

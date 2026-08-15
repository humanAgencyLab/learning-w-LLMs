import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';
import CourseTreeView from '../../components/instructor/CourseTreeView';
import MilestoneBarDrilldown from '../../components/instructor/charts/MilestoneBarDrilldown';
import TopicStudentHeatmap from '../../components/instructor/charts/TopicStudentHeatmap';
import InsightCards from '../../components/instructor/InsightCards';
import ScoreDistributionChart from '../../components/instructor/performance/ScoreDistributionChart';
import CompletionFunnel from '../../components/instructor/performance/CompletionFunnel';
import QuizByTopicTable from '../../components/instructor/performance/QuizByTopicTable';
import PerformanceKPIStrip from '../../components/instructor/performance/PerformanceKPIStrip';
import RiskDistributionChart from '../../components/instructor/RiskDistributionChart';
import CollapsibleSection from '../../components/instructor/CollapsibleSection';
import TopHardestTopics from '../../components/instructor/TopHardestTopics';
import StudentRow, { TIER_META } from '../../components/instructor/StudentRow';
import { FLAG_CHIPS } from '../../components/instructor/riskLevel';

/**
 * Insights page (PR-3, mockup isReport block):
 *   Header (kicker · title · deck · synthetic chip + actions)
 *   5-cell KPI strip
 *   == What stands out ==            (agent findings, 2-col cards)
 *   == What should I cover? ==       (TopHardestTopics — kept from the IA redesign)
 *   == Who should I reach? ==        (risk chart 320px | tier+reason axes + grouped list)
 *   == Course health ==              (collapsible: score dist · funnel · structure · heatmap · difficulty)
 */

// Sub-card inside Course health — matches the mockup's bordered inner panels.
// `collapsible` renders the title as a toggle and starts CLOSED: the Course
// structure tree is a wall of rows, and auto-expanding it whenever Course
// health opens buried the charts around it.
function HealthCard({ title, subtitle, innerRef, collapsible = false, children }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div ref={innerRef} className="border border-hairline-soft rounded-xl p-4 scroll-mt-6">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
          aria-expanded={open}
        >
          <span className="text-[13px] font-bold text-ink-900">{title}</span>
          <span className={`text-ink-300 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        </button>
      ) : (
        <p className="text-[13px] font-bold text-ink-900">{title}</p>
      )}
      {subtitle && <p className="text-[11.5px] text-ink-300 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && open && <div className="mb-3" />}
      {open && children}
    </div>
  );
}

export default function InstructorInsightsPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
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
  // Read-only here (the Dashboard owns the toggle; Insights reflects the
  // default study configuration). Kept as state so the fetch plumbing is
  // ready for a shared store later.
  const [includeSynthetic] = useState(true);

  // Risk list filter state.
  const [levelFilter, setLevelFilter] = useState(null); // null = All
  const [flagFilters, setFlagFilters] = useState([]);   // multi-select reasons
  const [topicFilter, setTopicFilter] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [distData, setDistData] = useState(null);
  const [distLoading, setDistLoading] = useState(false);

  // Course health expand state (controlled so deep-links can open it).
  const [courseHealthOpen, setCourseHealthOpen] = useState(false);
  const heatmapRef = useRef(null);
  const whoToReachRef = useRef(null);
  const courseHealthRef = useRef(null);
  // InsightCards "View chart" deep-links: at-risk → Who should I reach; the
  // reference charts live inside (collapsed) Course health.
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
    if (!topicFilter && !snapshot) {
      // Also clear the loading flag: if Reset lands while a re-score request
      // is in flight, that request's .finally is cancelled and would leave
      // distLoading stuck true (chart + list permanently dimmed).
      setDistData(null);
      setDistLoading(false);
      return undefined;
    }
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

  // Tier + reason axis counts (over the current chart scope, pre-filter).
  const tierCounts = useMemo(() => {
    const c = { critical: 0, high: 0, watch: 0 };
    for (const r of baseRows) if (c[r.riskLevel] != null) c[r.riskLevel] += 1;
    return c;
  }, [baseRows]);
  const reasonCounts = useMemo(() => {
    const c = {};
    for (const f of FLAG_CHIPS) c[f.key] = 0;
    for (const r of baseRows) {
      if (r.riskLevel === 'healthy') continue;
      for (const f of r.flags || []) if (c[f] != null) c[f] += 1;
    }
    return c;
  }, [baseRows]);

  const filteredRows = baseRows
    .filter((r) => r.riskLevel !== 'healthy')
    .filter((r) => !levelFilter || r.riskLevel === levelFilter)
    .filter((r) => flagFilters.length === 0 || flagFilters.some((f) => (r.flags || []).includes(f)))
    .sort((a, b) => b.riskScore - a.riskScore);
  const groupsToShow = TIER_META
    .map((tier) => ({ tier, items: filteredRows.filter((r) => r.riskLevel === tier.key) }))
    .filter((g) => g.items.length > 0);

  // Headline "attention needed" (Critical + High), same definition as the
  // dashboard tile / Need attention card (E-X-1).
  const headlineAtRisk = riskRows.filter((r) => r.atRisk).length;
  const sessionCompletion = analytics && analytics.sessionCount > 0
    ? Math.round((analytics.completedSessionCount / analytics.sessionCount) * 100)
    : null;

  const toggleFlag = (key) =>
    setFlagFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const openStudent = (r) =>
    navigate(`/instructor/courses/${courseId}/students/${r.studentId}`, {
      state: { atRiskFlags: r.flags, fromInsights: true },
    });

  const openHeatmapDeepLink = () => {
    setCourseHealthOpen(true);
    setTimeout(() => heatmapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const tierTabs = [
    { key: null, label: 'All', count: tierCounts.critical + tierCounts.high + tierCounts.watch },
    ...TIER_META.map((t) => ({ key: t.key, label: t.label, count: tierCounts[t.key] })),
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fadeIn">
        <div>
          <p className="font-mono uppercase text-brand tracking-[.1em] text-[10.5px] font-semibold">Insights</p>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight mt-1.5">
            {courseTitle || 'Course Insights'}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            What stands out, who to reach, and course health — grounded in this course&apos;s data.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-500 bg-brand-tint border border-brand-tintBorder rounded-lg px-3 py-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-brand" />
            {includeSynthetic ? 'Includes synthetic cohort' : 'Real students only'}
          </span>
          <Link
            to={`/instructor/courses/${courseId}`}
            className="bg-surface border border-hairline-strong rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:border-brand hover:text-brand transition-colors"
          >
            Edit course
          </Link>
          <Link
            to={`/instructor/courses/${courseId}/students`}
            className="bg-surface border border-hairline-strong rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:border-brand hover:text-brand transition-colors"
          >
            Students
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-risk-criticalTint border border-risk-criticalBorder rounded-lg text-sm text-risk-critical">{error}</div>
      )}

      {/* ===== 5-cell KPI strip ===== */}
      <div className="animate-riseIn">
        <PerformanceKPIStrip
          loading={loading}
          performance={performance}
          sessionCompletion={sessionCompletion}
          attentionCount={headlineAtRisk}
          enrolledCount={enrolledCount}
        />
        {!performanceAvailable && !loading && (
          <p className="text-xs text-ink-300 mt-2">Performance data unavailable right now — the sections below still render.</p>
        )}
      </div>

      {/* ===== What stands out ===== */}
      <section className="animate-riseIn">
        <div className="flex items-center gap-2.5 mb-3.5">
          <h2 className="text-base font-bold text-ink-900">What stands out</h2>
          <span className="font-mono uppercase text-[10px] tracking-wide text-ink-200">grounded in this course&apos;s data</span>
        </div>
        <InsightCards courseId={courseId} chartRefs={chartRefs} includeSynthetic={includeSynthetic} />
      </section>

      {loading ? (
        <div className="text-sm text-ink-400">Loading insights…</div>
      ) : (
        <>
          {/* ===== What should I cover in lecture? (kept from the IA redesign) ===== */}
          <section className="space-y-3 animate-riseIn">
            <h2 className="text-base font-bold text-ink-900">What should I cover in lecture?</h2>
            <TopHardestTopics
              heatmap={heatmap}
              moduleDifficulty={performance?.moduleDifficulty || []}
              enrolledCount={enrolledCount}
              onViewAllTopicData={openHeatmapDeepLink}
            />
          </section>

          {/* ===== Who should I reach? ===== */}
          <section className="scroll-mt-6 animate-riseIn" ref={whoToReachRef}>
            <h2 className="text-base font-bold text-ink-900">Who should I reach?</h2>
            <p className="text-sm text-ink-500 mt-0.5 mb-4">
              Class composition by risk · click a bar to filter the list
              {(topicFilter || snapshot) && <span className="text-assistant"> · re-scored for the current chart filter</span>}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
              {/* Left — distribution chart */}
              <div className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
                <RiskDistributionChart
                  compact
                  rows={baseRows}
                  topics={riskTopics}
                  publishedN={publishedN}
                  topicFilter={topicFilter}
                  snapshot={snapshot}
                  activeLevel={levelFilter}
                  // Healthy students aren't listed (the list is at-risk only),
                  // so a Healthy-bar click must not set an un-clearable filter
                  // that no tier tab represents.
                  onSelectLevel={(lvl) => {
                    if (lvl === 'healthy') return;
                    setLevelFilter((prev) => (prev === lvl ? null : lvl));
                  }}
                  loading={distLoading}
                />
              </div>

              {/* Right — axes + grouped list */}
              <div>
                <div className="flex flex-wrap gap-6 mb-2">
                  <div>
                    <p className="font-mono uppercase text-[10px] tracking-wide text-ink-200 font-semibold mb-1.5">By tier</p>
                    <div className="inline-flex bg-surface-chip rounded-lg p-1 gap-0.5">
                      {tierTabs.map((t) => (
                        <button
                          key={t.key || 'all'}
                          type="button"
                          onClick={() => setLevelFilter(t.key)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                            levelFilter === t.key ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
                          }`}
                        >
                          {t.label} <span className="opacity-60 tabular-nums">{t.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-mono uppercase text-[10px] tracking-wide text-ink-200 font-semibold mb-1.5">By reason</p>
                    <div className="flex flex-wrap gap-2">
                      {FLAG_CHIPS.map((f) => {
                        const on = flagFilters.includes(f.key);
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => toggleFlag(f.key)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                              on
                                ? 'bg-brand-tint text-brand border-brand-tintBorder'
                                : 'bg-surface-chip text-ink-500 border-transparent hover:bg-surface-hover'
                            }`}
                          >
                            {f.label} <span className="opacity-55 tabular-nums">{reasonCounts[f.key] ?? 0}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className={distLoading ? 'opacity-50 transition-opacity' : ''}>
                  {groupsToShow.length === 0 ? (
                    <p className="p-6 text-center text-ink-300 text-sm">No students match these filters.</p>
                  ) : (
                    groupsToShow.map(({ tier, items }) => (
                      <div key={tier.key} className="mt-3.5">
                        <div className="flex items-center gap-2.5 px-1 py-1.5">
                          <span className={`text-[11px] ${tier.text}`}>{tier.glyph}</span>
                          <span className="text-[11px] tracking-wide uppercase text-ink-900 font-bold">{tier.label}</span>
                          <span className={`text-[11px] font-bold tabular-nums ${tier.text}`}>{items.length}</span>
                          <span className="h-px flex-1 bg-hairline-soft" />
                          <span className="text-xs text-ink-300">{tier.note}</span>
                        </div>
                        {items.map((r) => (
                          <StudentRow key={r.studentId} r={r} onOpen={() => openStudent(r)} />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ===== Course health (collapsed) ===== */}
          <CollapsibleSection
            title="Course health"
            subtitle="Score distribution · Completion funnel · Structure · Heatmap · Difficulty"
            open={courseHealthOpen}
            onToggle={setCourseHealthOpen}
            innerRef={courseHealthRef}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HealthCard
                  title="Score distribution"
                  subtitle={`${enrolledCount} student${enrolledCount === 1 ? '' : 's'} represented`}
                >
                  {performance
                    ? <ScoreDistributionChart scoreDistribution={performance.scoreDistribution} />
                    : <p className="text-sm text-ink-400">Performance data unavailable.</p>}
                </HealthCard>

                <HealthCard
                  title="Completion funnel"
                  subtitle={`${enrolledCount} enrolled · published topics only`}
                >
                  {performance
                    ? <CompletionFunnel funnel={performance.funnel} enrollmentCount={performance.enrollmentCount} />
                    : <p className="text-sm text-ink-400">Performance data unavailable.</p>}
                </HealthCard>
              </div>

              <HealthCard title="Course structure" collapsible>
                <CourseTreeView tree={tree} moduleDifficulty={performance?.moduleDifficulty || []} />
              </HealthCard>

              <HealthCard title="Topic × student heatmap" innerRef={heatmapRef}>
                {/* Topic + snapshot filters — changing them re-scores the
                    "Who should I reach?" chart + list above. */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-xs text-ink-400">Re-score risk by:</span>
                  <select
                    className="text-xs border border-hairline rounded-lg px-2 py-1 bg-surface"
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
                    className="text-xs border border-hairline rounded-lg px-2 py-1 bg-surface disabled:opacity-50"
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
                    <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => { setTopicFilter(null); setSnapshot(null); }}>
                      Reset
                    </button>
                  )}
                </div>
                <TopicStudentHeatmap topics={heatmap.topics} students={heatmap.students} />
              </HealthCard>

              <HealthCard title="Quiz difficulty by topic">
                {performance
                  ? <QuizByTopicTable quizByTopic={performance.quizByTopic} />
                  : <p className="text-sm text-ink-400">Performance data unavailable.</p>}
              </HealthCard>

              <HealthCard title="Milestone difficulty">
                <MilestoneBarDrilldown milestones={milestones} />
              </HealthCard>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

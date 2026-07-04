import React from 'react';

/**
 * PR-3 Insights KPI strip — five tiles (mockup reportKpis):
 *   1. Total students
 *   2. Session completion
 *   3. First-attempt pass (mean across topics with attempts)
 *   4. Avg attempts to pass (mean across topics with a pass)
 *   5. Attention needed (Critical + High — SAME definition as the Dashboard's
 *      "Need attention now" card, per E-X-1: one risk definition everywhere)
 *
 * Value color stays ink-900 except Attention needed, which goes risk-critical
 * when > 0.
 */

function fmtPct(value, { empty = '—' } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return `${Math.round(value)}%`;
}

function fmtDecimal(value, digits = 1, { empty = '—' } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return value.toFixed(digits);
}

function Tile({ label, value, unit, accent = 'text-ink-900', title }) {
  return (
    <div className="bg-surface border border-hairline rounded-2xl shadow-card p-4 min-w-0" title={title}>
      <p className="text-[11px] font-semibold text-ink-400">{label}</p>
      <p className={`text-[25px] font-bold tracking-tight tabular-nums mt-1.5 leading-tight ${accent}`}>{value}</p>
      {unit && (
        <p className="text-[10px] font-semibold uppercase tracking-[.02em] text-ink-200 mt-1">{unit}</p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface border border-hairline rounded-2xl shadow-card p-4 animate-pulse">
          <div className="h-3 w-2/3 bg-surface-chip rounded" />
          <div className="h-6 w-1/2 bg-surface-chip rounded mt-3" />
          <div className="h-3 w-1/3 bg-surface-chip rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.loading
 * @param {object|null} props.performance – payload from getCoursePerformanceSummary
 * @param {number|null} props.sessionCompletion – completed/total sessions %, page-computed
 * @param {number} props.attentionCount – Critical + High headline count (atRisk flag)
 */
export default function PerformanceKPIStrip({
  loading = false,
  performance = null,
  sessionCompletion = null,
  attentionCount = 0,
  enrolledCount = null,
}) {
  if (loading) return <Skeleton />;

  // Prefer the page's fallback-aware count (heatmap-derived when the perf
  // summary API is down) so a failed perf fetch doesn't assert "0 students".
  const enrollmentCount = enrolledCount ?? performance?.enrollmentCount ?? 0;
  const quizByTopic = Array.isArray(performance?.quizByTopic) ? performance.quizByTopic : [];

  const faScores = quizByTopic
    .map((q) => q.firstAttemptPassRate)
    .filter((v) => v != null && !Number.isNaN(v));
  const meanFirstAttemptPass =
    faScores.length ? faScores.reduce((s, v) => s + v, 0) / faScores.length : null;

  const atpScores = quizByTopic
    .map((q) => q.avgAttemptsToPass)
    .filter((v) => v != null && !Number.isNaN(v));
  const meanAttemptsToPass =
    atpScores.length ? atpScores.reduce((s, v) => s + v, 0) / atpScores.length : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <Tile label="Total students" value={enrollmentCount} unit="enrolled" />
      <Tile
        label="Session completion"
        value={sessionCompletion == null ? '—' : `${sessionCompletion}%`}
        unit="of sessions"
        title="Percentage of student sessions that reached the 'completed' phase"
      />
      <Tile
        label="First-attempt pass"
        value={fmtPct(meanFirstAttemptPass)}
        unit={faScores.length ? `across ${faScores.length} topic${faScores.length === 1 ? '' : 's'}` : 'no quiz data'}
      />
      <Tile
        label="Avg attempts to pass"
        value={fmtDecimal(meanAttemptsToPass, 1)}
        unit={atpScores.length ? 'per passed topic' : 'no pass data'}
      />
      <Tile
        label="Attention needed"
        value={attentionCount}
        unit="critical + high"
        accent={attentionCount > 0 ? 'text-risk-critical' : 'text-ink-900'}
        title="Students at highest urgency: Critical or High risk — same definition as the Dashboard's Need attention now."
      />
    </div>
  );
}

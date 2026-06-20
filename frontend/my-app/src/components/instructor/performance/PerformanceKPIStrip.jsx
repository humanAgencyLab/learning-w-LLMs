import React from 'react';

/**
 * Phase F top-of-page density strip on the Insights page.
 *
 * Phase E removed the `CoursePerformanceSummary` block entirely and the page
 * became narrative-heavy — a professor had to *read* three cards before any
 * number appeared. This strip puts six hard numbers above the fold.
 *
 * Source fields come from `getCoursePerformanceSummary(courseId)`. We only
 * use a narrow slice of that payload here:
 *   1. enrollmentCount
 *   2. funnel.fullyComplete / enrollmentCount
 *   3. funnel.inProgress
 *   4. mean of non-null quizByTopic[].firstAttemptPassRate
 *   5. mean of non-null quizByTopic[].avgAttemptsToPass
 *   6. moduleDifficulty row with the min passRate (we don't render the full
 *      module-difficulty table — the existing MilestoneBarDrilldown covers
 *      that shape — we only use this single derived number).
 *
 * When the hardest-module tile is clicked it scrolls to the milestone
 * drilldown chart and flashes it, same affordance as InsightCards.
 */

function fmtPct(value, { empty = '—' } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return `${Math.round(value)}%`;
}

function fmtDecimal(value, digits = 1, { empty = '—' } = {}) {
  if (value == null || Number.isNaN(value)) return empty;
  return value.toFixed(digits);
}

function truncate(str, n) {
  if (typeof str !== 'string') return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// 70/50 thresholds match the rest of the instructor UI — same accent logic
// used by CourseCardsGrid and the upcoming QuizByTopicTable.
function passAccent(pct) {
  if (pct == null) return 'text-gray-400';
  if (pct >= 70) return 'text-emerald-700';
  if (pct >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

function Tile({ label, value, accent = 'text-gray-900', sub, onClick, title, valueWrap = false }) {
  const clickable = typeof onClick === 'function';
  const Element = clickable ? 'button' : 'div';
  // For long string values (e.g. the hardest-module title) we want to wrap
  // to two lines and shrink the type slightly rather than silently truncate
  // the name into "Midterm Pr…".
  const valueClass = valueWrap
    ? `text-base font-bold mt-1 leading-snug line-clamp-2 break-words ${accent}`
    : `text-2xl font-bold mt-1 leading-tight truncate ${accent}`;
  return (
    <Element
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={[
        'bg-white border border-gray-200 rounded-xl p-4 text-left min-w-0 flex-1',
        clickable ? 'hover:border-indigo-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition' : '',
      ].join(' ')}
    >
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">{label}</p>
      <p className={valueClass}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-1 truncate">{sub}</p>}
    </Element>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
        >
          <div className="h-3 w-2/3 bg-gray-200 rounded" />
          <div className="h-6 w-1/2 bg-gray-100 rounded mt-3" />
          <div className="h-3 w-1/3 bg-gray-100 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

function flashElement(el) {
  if (!el) return;
  el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'transition');
  window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2');
  }, 1400);
}

/**
 * @param {object} props
 * @param {boolean} props.loading
 * @param {object|null} props.performance – full payload from
 *                                          getCoursePerformanceSummary
 * @param {React.RefObject} props.hardestModuleRef – ref pointing at the
 *                                          milestone drilldown section so
 *                                          tile 6 can scroll to it.
 */
export default function PerformanceKPIStrip({ loading = false, performance = null, hardestModuleRef }) {
  if (loading) return <Skeleton />;

  if (!performance) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-4 text-sm text-gray-600">
        Performance data unavailable right now — the charts below still render.
      </div>
    );
  }

  const enrollmentCount = performance.enrollmentCount ?? 0;
  const funnel = performance.funnel || {};
  const quizByTopic = Array.isArray(performance.quizByTopic) ? performance.quizByTopic : [];
  const moduleDifficulty = Array.isArray(performance.moduleDifficulty) ? performance.moduleDifficulty : [];

  // Tile 2: fully-complete %
  const fullyCompletePct =
    enrollmentCount > 0 ? (funnel.fullyComplete || 0) / enrollmentCount * 100 : null;

  // Tile 4: mean first-attempt pass rate across topics that actually have
  // attempts (null entries mean nobody has attempted that topic yet — skip
  // them or the average lies).
  const faScores = quizByTopic
    .map((q) => q.firstAttemptPassRate)
    .filter((v) => v != null && !Number.isNaN(v));
  const meanFirstAttemptPass =
    faScores.length ? faScores.reduce((s, v) => s + v, 0) / faScores.length : null;

  // Tile 5: mean attempts-to-pass across topics where at least one student
  // eventually passed.
  const atpScores = quizByTopic
    .map((q) => q.avgAttemptsToPass)
    .filter((v) => v != null && !Number.isNaN(v));
  const meanAttemptsToPass =
    atpScores.length ? atpScores.reduce((s, v) => s + v, 0) / atpScores.length : null;

  // Tile 6: hardest module — lowest non-null passRate across moduleDifficulty.
  let hardestModule = null;
  for (const m of moduleDifficulty) {
    if (m.passRate == null) continue;
    if (!hardestModule || m.passRate < hardestModule.passRate) hardestModule = m;
  }

  const onHardestClick = () => {
    const el = hardestModuleRef?.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => flashElement(el), 350);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Tile label="Enrolled" value={enrollmentCount} />
      <Tile
        label="Fully complete"
        value={fmtPct(fullyCompletePct)}
        accent={passAccent(fullyCompletePct)}
        sub={
          enrollmentCount > 0
            ? `${funnel.fullyComplete || 0} of ${enrollmentCount}`
            : 'no enrollments yet'
        }
      />
      <Tile
        label="In progress"
        value={funnel.inProgress ?? 0}
        sub={
          enrollmentCount > 0
            ? `${funnel.partiallyComplete || 0} partly done`
            : undefined
        }
      />
      <Tile
        label="First-attempt pass"
        value={fmtPct(meanFirstAttemptPass)}
        accent={passAccent(meanFirstAttemptPass)}
        sub={faScores.length ? `across ${faScores.length} topic${faScores.length === 1 ? '' : 's'}` : 'no quiz data yet'}
      />
      <Tile
        label="Avg attempts to pass"
        value={fmtDecimal(meanAttemptsToPass, 1)}
        sub={atpScores.length ? `across ${atpScores.length} topic${atpScores.length === 1 ? '' : 's'}` : 'no pass data yet'}
      />
      <Tile
        label="Hardest module"
        value={hardestModule ? (hardestModule.moduleTitle || 'Untitled') : '—'}
        valueWrap
        accent={hardestModule ? 'text-rose-700' : 'text-gray-400'}
        sub={
          hardestModule
            ? `${Math.round(hardestModule.passRate)}% pass · tap to view`
            : 'not enough attempts yet'
        }
        onClick={hardestModule ? onHardestClick : undefined}
        title={hardestModule ? `Jump to milestone drilldown for ${hardestModule.moduleTitle}` : undefined}
      />
    </div>
  );
}

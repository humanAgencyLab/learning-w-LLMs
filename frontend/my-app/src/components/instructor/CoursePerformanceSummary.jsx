import React, { useState } from 'react';
import BarChart from '../performance/BarChart';

function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const hours = ms / 3600000;
  if (hours < 72) return `${Math.round(hours * 10) / 10} h`;
  const days = ms / 86400000;
  return `${Math.round(days * 10) / 10} d`;
}

function scoreSourceCaption(scoreSource) {
  switch (scoreSource) {
    case 'quizScorePctMean':
      return 'Per student: average of submitted quiz score % (non-revision attempts). Buckets are 0–100 scale. Students with no submitted attempts are scored 0.';
    case 'sessionPointsSumNormalized':
      return 'Per student: latest session points per topic summed and scaled vs total module points on published topics (no quiz scores found). Students with no submitted attempts are scored 0.';
    case 'mixed':
      return 'Mixed: some students use average quiz %, others use normalized points (no submitted scores with scorePct). Same 0–100 buckets. Students with no submitted attempts are scored 0.';
    default:
      return 'No enrolled students.';
  }
}

function Section({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-gray-50/80 hover:bg-gray-50 transition-colors"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 py-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

export default function CoursePerformanceSummary({ performanceSummary, loading, error }) {
  if (loading) {
    return (
      <div className="mb-6 border border-gray-200 rounded-xl bg-white p-8 flex items-center justify-center text-sm text-gray-500">
        Loading performance summary…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 border border-red-200 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        Performance summary could not be loaded: {error}
      </div>
    );
  }

  if (!performanceSummary) {
    return null;
  }

  const p = performanceSummary;
  const funnelData = [
    { label: 'Not started', count: p.funnel?.notStarted ?? 0 },
    { label: 'In progress', count: p.funnel?.inProgress ?? 0 },
    { label: 'Partial', count: p.funnel?.partiallyComplete ?? 0 },
    { label: 'Complete', count: p.funnel?.fullyComplete ?? 0 },
  ];

  const scoreBuckets = (p.scoreDistribution?.buckets || []).map((b) => ({
    label: b.label,
    count: b.count ?? 0,
  }));

  const weeklyData = (p.weeklyEngagement || []).map((d) => ({
    label: d.label,
    count: d.sessionCount ?? 0,
  }));

  const quizRows = [...(p.quizByTopic || [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const moduleRows = [...(p.moduleDifficulty || [])].sort((a, b) => {
    const ar = a.passRate ?? 101;
    const br = b.passRate ?? 101;
    if (ar !== br) return ar - br;
    return (a.topicTitle || '').localeCompare(b.topicTitle || '');
  });

  const timeRows = [...(p.timeToCompleteByTopic || [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">Performance summary</h2>
        <p className="text-xs text-gray-500">
          Funnel uses <span className="font-medium text-gray-700">{p.funnelTopicScope || 'published'}</span> topics
          {p.publishedTopicCount != null ? ` (${p.publishedTopicCount} topic${p.publishedTopicCount === 1 ? '' : 's'})` : ''}.
        </p>
      </div>

      <Section
        title="Score distribution"
        subtitle={scoreSourceCaption(p.scoreDistribution?.scoreSource)}
        defaultOpen
      >
        {p.enrollmentCount === 0 ? (
          <p className="text-sm text-gray-500">No enrolled students yet.</p>
        ) : (
          <>
            <BarChart data={scoreBuckets} width={520} height={220} mode="count" color="#4f46e5" />
            <p className="text-xs text-gray-500 mt-2">
              Students included: {p.scoreDistribution?.studentsIncluded ?? 0}.
              {(p.scoreDistribution?.scoreSource === 'sessionPointsSumNormalized' ||
                p.scoreDistribution?.scoreSource === 'mixed') && (
                <>
                  {' '}
                  Normalization cap (published module points sum):{' '}
                  {p.scoreDistribution?.maxCoursePointsUsedForNormalization ?? 0}.
                </>
              )}
            </p>
          </>
        )}
      </Section>

      <Section title="Progress funnel" subtitle="Counts of enrolled students by completion on published topics.">
        {p.publishedTopicCount === 0 ? (
          <p className="text-sm text-gray-500">No published topics — funnel is empty.</p>
        ) : p.enrollmentCount === 0 ? (
          <p className="text-sm text-gray-500">No enrolled students yet.</p>
        ) : (
          <BarChart data={funnelData} width={520} height={220} mode="count" color="#059669" />
        )}
      </Section>

      <Section title="Quiz analytics by topic" subtitle="Non-revision submitted attempts, merged across sessions per student.">
        {quizRows.length === 0 ? (
          <p className="text-sm text-gray-500">No topics.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">Topic</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Avg attempts to pass</th>
                  <th className="py-2 pr-4 font-medium text-right">1st attempt pass %</th>
                  <th className="py-2 pr-4 font-medium text-right">Never passed %</th>
                  <th className="py-2 pr-0 font-medium text-right">With attempts</th>
                </tr>
              </thead>
              <tbody>
                {quizRows.map((row) => (
                  <tr key={row.topicId} className="border-b border-gray-100 text-gray-800">
                    <td className="py-2 pr-4 font-medium text-gray-900">{row.title}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{row.status}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.avgAttemptsToPass != null ? row.avgAttemptsToPass : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.firstAttemptPassRate != null ? `${row.firstAttemptPassRate}%` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.neverPassedRate != null ? `${row.neverPassedRate}%` : '—'}
                    </td>
                    <td className="py-2 pr-0 text-right tabular-nums">{row.studentsWithAttempts ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Module quiz pass rates" subtitle="Students who attempted vs ever passed (published topics only).">
        {moduleRows.length === 0 ? (
          <p className="text-sm text-gray-500">No published modules with quiz data yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">Topic</th>
                  <th className="py-2 pr-4 font-medium">Module</th>
                  <th className="py-2 pr-4 font-medium text-right">Pass rate</th>
                  <th className="py-2 pr-0 font-medium text-right">Attempted</th>
                </tr>
              </thead>
              <tbody>
                {moduleRows.map((row) => (
                  <tr key={`${row.topicId}-${row.moduleId}`} className="border-b border-gray-100 text-gray-800">
                    <td className="py-2 pr-4 text-gray-900">{row.topicTitle}</td>
                    <td className="py-2 pr-4">{row.moduleTitle}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.passRate != null ? `${row.passRate}%` : '—'}
                    </td>
                    <td className="py-2 pr-0 text-right tabular-nums">{row.studentsAttempted ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Time to complete (per topic)" subtitle="Latest completed session: updatedAt − createdAt.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Topic</th>
                <th className="py-2 pr-4 font-medium text-right">N</th>
                <th className="py-2 pr-4 font-medium text-right">Median</th>
                <th className="py-2 pr-0 font-medium text-right">Average</th>
              </tr>
            </thead>
            <tbody>
              {timeRows.map((row) => (
                <tr key={row.topicId} className="border-b border-gray-100 text-gray-800">
                  <td className="py-2 pr-4 font-medium text-gray-900">{row.title}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.sampleSize ?? 0}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatDurationMs(row.medianMs)}</td>
                  <td className="py-2 pr-0 text-right tabular-nums">{formatDurationMs(row.avgMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Weekly engagement"
        subtitle="Session starts counted by UTC weekday of createdAt."
        defaultOpen
      >
        {p.enrollmentCount === 0 ? (
          <p className="text-sm text-gray-500">No enrolled students — no course sessions in scope.</p>
        ) : (
          <BarChart data={weeklyData} width={520} height={220} mode="count" color="#d97706" />
        )}
      </Section>
    </div>
  );
}

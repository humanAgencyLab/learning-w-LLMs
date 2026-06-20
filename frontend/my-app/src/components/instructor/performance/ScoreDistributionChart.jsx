import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * "Where the class lands" — per-student mean-score histogram.
 *
 * Bucket labels and counts come straight from
 * `getCoursePerformanceSummary` → `scoreDistribution.buckets`. Each student
 * contributes exactly one bucket (their quiz-score mean, or a normalized
 * session-points fallback if they've done no quizzes). The banner sentence
 * tells the professor which source we used so "70–79 bucket has 5 people"
 * means the same thing every time.
 *
 * We do NOT attempt to fit a curve or label it "normal" — with 20 synthetic
 * students the distribution is usually bi-modal on purpose (three personas
 * clustered by performance), and we want the professor to see that shape
 * unannotated.
 */

function colorForBucket(label) {
  // Green for high buckets, rose for low — same semantic as every other
  // pass-rate display on the instructor side so the eye doesn't have to
  // re-learn a palette.
  if (/^90/.test(label)) return '#15803d';
  if (/^80/.test(label)) return '#22c55e';
  if (/^70/.test(label)) return '#eab308';
  if (/^60/.test(label)) return '#f97316';
  return '#e11d48';
}

function scoreSourceLabel(source) {
  switch (source) {
    case 'quizScorePctMean':
      return 'Buckets derived from each student\u2019s mean quiz score.';
    case 'sessionPointsSumNormalized':
      return 'No quizzes yet — buckets derived from session points normalized against the course total.';
    case 'mixed':
      return 'Mixed: some students bucketed on quiz-score mean, others on session points (no quiz data).';
    case 'none':
    default:
      return 'No data yet — students haven\u2019t attempted anything.';
  }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-md text-xs">
      <p className="font-semibold text-gray-900">{d.label}</p>
      <p className="text-gray-600 mt-1">{d.count} student{d.count === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function ScoreDistributionChart({ scoreDistribution }) {
  const buckets = Array.isArray(scoreDistribution?.buckets) ? scoreDistribution.buckets : [];
  const totalStudents = buckets.reduce((s, b) => s + (b.count || 0), 0);
  const source = scoreDistribution?.scoreSource || 'none';

  if (!buckets.length || totalStudents === 0) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-6 text-center">
        <p className="text-sm text-gray-700 font-medium">No score data yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Once students submit quiz attempts, this chart will show how the class is distributed across score ranges.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">{scoreSourceLabel(source)}</p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#6b7280" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {buckets.map((b) => (
                <Cell key={b.label} fill={colorForBucket(b.label)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        {totalStudents} student{totalStudents === 1 ? '' : 's'} represented.
      </p>
    </div>
  );
}

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts';

/**
 * "Where students drop off" — horizontal funnel of the four completion
 * buckets computed by `getCoursePerformanceSummary`:
 *
 *   notStarted → inProgress → partiallyComplete → fullyComplete
 *
 * The funnel operates on *published* topics only (backend contract:
 * `funnelTopicScope === 'published'`), so a student who's finished every
 * published topic lands in `fullyComplete` even if unpublished topics
 * remain. That matches how an instructor reasons about "done."
 *
 * A horizontal layout gives us room for descriptive bucket labels without
 * tilting the X axis. Percent labels on each bar make the shape scannable
 * at a glance — the professor doesn't have to compute anything.
 */

const STAGES = [
  {
    key: 'notStarted',
    label: 'Not started',
    color: '#9ca3af', // gray-400
    help: 'No sessions in any published topic',
  },
  {
    key: 'inProgress',
    label: 'In progress',
    color: '#fb923c', // orange-400
    help: 'Started but not completed a single published topic',
  },
  {
    key: 'partiallyComplete',
    label: 'Partly done',
    color: '#60a5fa', // blue-400
    help: 'Completed some but not all published topics',
  },
  {
    key: 'fullyComplete',
    label: 'Fully complete',
    color: '#22c55e', // green-500
    help: 'Completed every published topic',
  },
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-md text-xs max-w-xs">
      <p className="font-semibold text-gray-900">{d.label}</p>
      <p className="text-gray-500 mt-0.5">{d.help}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">Students</span>
        <span className="font-semibold">{d.count}</span>
        <span className="text-gray-500">Share</span>
        <span className="font-semibold">{d.pct}%</span>
      </div>
    </div>
  );
}

export default function CompletionFunnel({ funnel, enrollmentCount = 0 }) {
  if (!funnel || enrollmentCount === 0) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-6 text-center">
        <p className="text-sm text-gray-700 font-medium">No completion data yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Once students enroll and start topics, this funnel will show where they&apos;re stalling.
        </p>
      </div>
    );
  }

  const rows = STAGES.map((s) => {
    const count = funnel[s.key] || 0;
    const pct = enrollmentCount > 0 ? Math.round((count / enrollmentCount) * 100) : 0;
    return { ...s, count, pct, barLabel: `${count} (${pct}%)` };
  });

  return (
    <div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 48, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              domain={[0, Math.max(1, enrollmentCount)]}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              width={110}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
              <LabelList
                dataKey="barLabel"
                position="right"
                style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        {enrollmentCount} enrolled · funnel counts students across published topics only.
      </p>
    </div>
  );
}

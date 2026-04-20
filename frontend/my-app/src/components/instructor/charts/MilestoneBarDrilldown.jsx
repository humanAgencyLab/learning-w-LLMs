import React, { useMemo, useState } from 'react';
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

function colorForFailRate(rate) {
  if (rate >= 60) return '#dc2626';
  if (rate >= 40) return '#f97316';
  if (rate >= 20) return '#eab308';
  return '#22c55e';
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-md text-xs max-w-xs">
      <p className="font-semibold text-gray-900 mb-1 line-clamp-3">{d.fullText}</p>
      <p className="text-gray-500">
        {d.topicTitle}
        {d.moduleTitle ? ` · ${d.moduleTitle}` : ''}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">Attempts</span>
        <span className="font-semibold">{d.attempts}</span>
        <span className="text-gray-500">Passes</span>
        <span className="font-semibold">{d.passes}</span>
        <span className="text-gray-500">Pass rate</span>
        <span className="font-semibold">{d.passRate}%</span>
        <span className="text-gray-500">Fail rate</span>
        <span className="font-semibold">{d.failRate}%</span>
        <span className="text-gray-500">Auto-advance</span>
        <span className="font-semibold">{d.autoAdvanced}</span>
        <span className="text-gray-500">Students</span>
        <span className="font-semibold">{d.studentCount}</span>
      </div>
    </div>
  );
}

export default function MilestoneBarDrilldown({ milestones = [], topN = 15 }) {
  const [sortKey, setSortKey] = useState('failRate');

  const data = useMemo(() => {
    const sorted = [...milestones]
      .filter((m) => m.attempts > 0)
      .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
      .slice(0, topN)
      .map((m, i) => ({
        ...m,
        rank: i + 1,
        label: `${i + 1}. ${(m.milestoneText || '').slice(0, 40)}${(m.milestoneText || '').length > 40 ? '…' : ''}`,
        fullText: m.milestoneText || '(no text)',
      }));
    return sorted;
  }, [milestones, sortKey, topN]);

  if (!data.length) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
        No milestone attempt data yet.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">Hardest milestones</p>
        <div className="flex items-center gap-1 text-xs">
          {[
            { k: 'failRate', label: 'Fail rate' },
            { k: 'attempts', label: 'Most attempted' },
            { k: 'autoAdvanced', label: 'Most auto-advanced' },
          ].map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setSortKey(opt.k)}
              className={`px-2 py-1 rounded border ${
                sortKey === opt.k
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: Math.max(280, data.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 24, left: 0, bottom: 10 }}>
            <CartesianGrid horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={220}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey={sortKey} radius={[0, 4, 4, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={
                    sortKey === 'failRate'
                      ? colorForFailRate(entry.failRate)
                      : sortKey === 'autoAdvanced'
                      ? '#e11d48'
                      : '#4f46e5'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

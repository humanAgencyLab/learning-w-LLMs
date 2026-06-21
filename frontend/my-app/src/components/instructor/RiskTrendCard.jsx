import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip,
} from 'recharts';
import * as instructorApi from '../../lib/instructorApi';
import { RISK_META } from './riskLevel';

// Risk Insights v2 (Step 6) — per-student risk trend: 5 weekly snapshots over
// the last 28 days, with level bands shaded behind the line.
const arrowFor = (dir) => {
  if (dir === 'improving') return { ch: '↑', cls: 'text-green-600' };
  if (dir === 'declining') return { ch: '↓', cls: 'text-red-600' };
  return { ch: '→', cls: 'text-gray-400' };
};

export default function RiskTrendCard({ courseId, studentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await instructorApi.getRiskTrend(courseId, studentId);
        if (!cancelled) setData(res?.data || null);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load trend');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, studentId]);

  const points = data?.points || [];
  const trend = data?.trend || null;
  const a = arrowFor(trend?.direction);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Risk trend</h3>

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-gray-500">No activity yet — trend will appear after the first quiz attempt.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-2xl font-bold leading-none ${a.cls}`}>{a.ch}</span>
            <div>
              <p className="text-sm font-semibold text-gray-800 capitalize">{trend?.direction || 'stable'}</p>
              <p className="text-xs text-gray-500">
                {typeof trend?.delta === 'number' && trend.delta !== 0
                  ? `${trend.delta > 0 ? '+' : ''}${trend.delta} points · `
                  : ''}
                {trend?.label}
              </p>
            </div>
          </div>

          {points.length === 1 ? (
            <p className="text-xs text-gray-400">
              Single snapshot so far — {points[0].score}/100 ({points[0].level}).
            </p>
          ) : (
            <div style={{ width: '100%', height: 150 }}>
              <ResponsiveContainer>
                <LineChart data={points} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <ReferenceArea y1={70} y2={100} fill={RISK_META.critical.bar} fillOpacity={0.08} />
                  <ReferenceArea y1={40} y2={70} fill={RISK_META.high.bar} fillOpacity={0.08} />
                  <ReferenceArea y1={20} y2={40} fill={RISK_META.watch.bar} fillOpacity={0.08} />
                  <ReferenceArea y1={0} y2={20} fill={RISK_META.healthy.bar} fillOpacity={0.08} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d) => (d || '').slice(5)}
                  />
                  <YAxis domain={[0, 100]} ticks={[0, 20, 40, 70, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip formatter={(v) => [`${v}/100`, 'Risk']} labelFormatter={(d) => d} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={(props) => {
                      const isCurrent = props.index === points.length - 1;
                      return (
                        <circle
                          key={props.index}
                          cx={props.cx}
                          cy={props.cy}
                          r={isCurrent ? 5 : 3}
                          fill="#4f46e5"
                          stroke="#fff"
                          strokeWidth={1}
                        />
                      );
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

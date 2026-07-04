import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer, Tooltip,
} from 'recharts';
import { RISK_META } from './riskLevel';

// Risk Insights v2 (Step 5) — class composition by risk level, with topic and
// snapshot ("up to topic N") filters. Filter state is owned by the parent so the
// at-risk panel re-scores against the same subset; this component only renders.
const ORDER = ['healthy', 'watch', 'high', 'critical'];

export default function RiskDistributionChart({
  rows = [],
  topics = [],
  publishedN = 0,
  topicFilter = null,
  onTopicFilter,
  snapshot = null,
  onSnapshot,
  activeLevel = null,
  onSelectLevel,
  loading = false,
  compact = false,
}) {
  // E-Ins-1 fix: Recharts' Tooltip can stay stuck visible after the cursor
  // leaves the chart (well-known recharts issue). We track hover on the OUTER
  // wrapper div (not inside ResponsiveContainer) and hard-hide the tooltip
  // wrapper the moment the pointer leaves.
  const [hovering, setHovering] = useState(false);

  const data = useMemo(() => {
    const counts = { healthy: 0, watch: 0, high: 0, critical: 0 };
    for (const r of rows) counts[r.riskLevel] = (counts[r.riskLevel] || 0) + 1;
    return ORDER.map((lvl) => ({
      level: lvl,
      label: RISK_META[lvl].label,
      count: counts[lvl] || 0,
      fill: RISK_META[lvl].bar,
    }));
  }, [rows]);

  const n = publishedN || topics.length;
  const topicTitle = topicFilter ? (topics.find((t) => t.topicId === topicFilter)?.title || 'Topic') : null;
  const subtitle = topicFilter
    ? `Topic: ${topicTitle}`
    : (snapshot ? `Snapshot: up to topic ${snapshot} of ${n}` : 'Class composition by risk level');

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs text-ink-400">{subtitle}</p>
        {!compact && (
        <div className="flex items-center gap-2">
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
            value={topicFilter || ''}
            onChange={(e) => onTopicFilter?.(e.target.value || null)}
            title="Score the class against a single topic"
          >
            <option value="">All published topics</option>
            {topics.map((t) => (
              <option key={t.topicId} value={t.topicId}>{t.title}</option>
            ))}
          </select>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
            value={snapshot || ''}
            onChange={(e) => onSnapshot?.(e.target.value ? parseInt(e.target.value, 10) : null)}
            disabled={!!topicFilter}
            title="See the class as it was after only the first N topics"
          >
            <option value="">Current</option>
            {Array.from({ length: n }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>Up to topic {k}</option>
            ))}
          </select>
        </div>
        )}
      </div>

      <div
        style={{ width: '100%', height: 240 }}
        className={loading ? 'opacity-40 transition-opacity' : 'transition-opacity'}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
      >
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              // Force-HIDE only when the pointer/focus is outside the chart —
              // never force-show. wrapperStyle spreads LAST in recharts'
              // TooltipBoundingBox, so an unconditional visibility would
              // override recharts' own active/hasPayload logic and paint an
              // empty tooltip box over axis labels / margins.
              wrapperStyle={hovering ? undefined : { visibility: 'hidden' }}
              formatter={(v) => [`${v} student${v === 1 ? '' : 's'}`, 'Count']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={(d) => onSelectLevel?.(d.level)} cursor="pointer" isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.level}
                  fill={d.fill}
                  opacity={activeLevel && activeLevel !== d.level ? 0.3 : 1}
                  stroke={activeLevel === d.level ? '#111827' : 'none'}
                  strokeWidth={activeLevel === d.level ? 1.5 : 0}
                />
              ))}
              <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: '#374151' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-ink-300 mt-1">Click a bar to filter the list below by that level; click it again to clear.</p>
    </div>
  );
}

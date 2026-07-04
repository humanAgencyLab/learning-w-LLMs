import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flagLabel } from './riskLevel';

/**
 * Dashboard Watchlist (PR-2) — cross-course at-risk students grouped by tier
 * with a segmented tier filter. Consumes the SAME aggregated rows as
 * NeedAttentionCard (fetched once at the page level); fetches nothing itself.
 *
 * Tier semantics match the canonical risk system: Critical/High groups hold
 * rows whose headline `atRisk` flag is true (class-context "doing well"
 * overrides are excluded — they're handled, not watchlist material); Watch
 * holds riskLevel === 'watch'.
 */

const TIERS = [
  { key: 'critical', label: 'Critical', glyph: '▲', note: 'needs a call today', text: 'text-risk-critical', tint: 'bg-risk-criticalTint', border: 'border-l-risk-criticalAccent' },
  { key: 'high', label: 'High', glyph: '●', note: 'reach out this week', text: 'text-risk-high', tint: 'bg-risk-highTint', border: 'border-l-risk-highAccent' },
  { key: 'watch', label: 'Watch', glyph: '●', note: 'watch this week', text: 'text-risk-watch', tint: 'bg-risk-watchTint', border: 'border-l-risk-watchAccent' },
];

const FACTOR_STYLES = {
  no_engagement: 'bg-risk-criticalTint text-risk-critical',
  low_pass_rate: 'bg-orange-50 text-orange-700',
  low_quiz_score: 'bg-amber-50 text-amber-700',
  stuck_topic: 'bg-violet-50 text-violet-700',
};

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

function summaryLine(r) {
  const quizzed = `${r.attemptedQuizTopics ?? 0} of ${r.publishedN ?? 0} quizzed`;
  const touched = `${r.attemptedPublished ?? 0} touched`;
  const avg = r.avgQuizScore != null ? `avg ${r.avgQuizScore}%` : 'no quiz data';
  return `${quizzed} · ${touched} · ${avg}`;
}

function StudentRow({ r, tier, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full grid grid-cols-[38px_1fr_auto] gap-3.5 items-center px-3 py-3 rounded-xl text-left border-l-[3px] ${tier.border} hover:bg-surface-hover transition-colors`}
    >
      <span className={`w-[38px] h-[38px] rounded-full ${tier.tint} ${tier.text} flex items-center justify-center font-bold text-[13px]`}>
        {initialsOf(r.name)}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[15px] font-bold text-ink-900">{r.name}</span>
          <span className="font-mono text-[11px] text-ink-200">@{r.username}</span>
          <span className="text-[10.5px] font-semibold text-ink-500 bg-surface-chip rounded px-1.5 py-0.5">{r.courseShort}</span>
        </span>
        <span className="block text-xs text-ink-400 mt-1 tabular-nums">{summaryLine(r)}</span>
        {(r.flags || []).length > 0 && (
          <span className="flex gap-1.5 mt-1.5 flex-wrap">
            {(r.flags || []).slice(0, 3).map((f) => (
              <span key={f} className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${FACTOR_STYLES[f] || 'bg-surface-chip text-ink-500'}`}>
                {flagLabel(f)}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="flex items-center gap-3.5">
        <span className="text-right">
          <span className="flex items-baseline gap-0.5 justify-end">
            <span className={`text-[20px] font-bold tabular-nums ${tier.text}`}>{r.riskScore}</span>
            <span className="text-[11px] text-ink-150">/100</span>
          </span>
          <span className={`block font-mono text-[9.5px] uppercase tracking-wider font-bold mt-0.5 ${tier.text}`}>
            {tier.glyph} {tier.label}
          </span>
        </span>
        <span className="text-ink-100 text-lg">›</span>
      </span>
    </button>
  );
}

export default function DashboardWatchlist({ rows = [], loading = false }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const groups = useMemo(() => {
    const byTier = { critical: [], high: [], watch: [] };
    for (const r of rows) {
      if (r.riskLevel === 'watch') byTier.watch.push(r);
      else if (r.atRisk && (r.riskLevel === 'critical' || r.riskLevel === 'high')) byTier[r.riskLevel].push(r);
    }
    return byTier;
  }, [rows]);

  const totalShown = groups.critical.length + groups.high.length + groups.watch.length;
  const tabs = [
    { key: 'all', label: 'All', count: totalShown },
    ...TIERS.map((t) => ({ key: t.key, label: t.label, count: groups[t.key].length })),
  ];
  const visibleTiers = filter === 'all' ? TIERS : TIERS.filter((t) => t.key === filter);
  const visibleCount = visibleTiers.reduce((n, t) => n + groups[t.key].length, 0);

  return (
    <div className="bg-surface border border-hairline rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 p-5 pb-3.5 border-b border-hairline-soft flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 tracking-tight">Watchlist</h2>
          <p className="text-sm text-ink-500 mt-0.5">Students to reach before class · one risk definition, everywhere</p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] uppercase tracking-wide text-ink-200 font-semibold mb-1.5">Filter by tier</p>
          <div className="inline-flex bg-surface-chip rounded-lg p-1 gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  filter === t.key ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {t.label} <span className="opacity-60 tabular-nums">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grouped body */}
      <div className="px-3 pb-3 pt-1">
        {loading ? (
          <p className="text-sm text-ink-300 px-3 py-6">Loading watchlist…</p>
        ) : totalShown === 0 ? (
          <p className="text-sm text-ink-300 px-3 py-6">No students on the watchlist right now.</p>
        ) : visibleCount === 0 ? (
          <p className="text-sm text-ink-300 px-3 py-6">No students in this tier.</p>
        ) : (
          visibleTiers.map((tier) => {
            const items = groups[tier.key];
            if (items.length === 0) return null;
            return (
              <div key={tier.key} className="mt-3">
                <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-1.5">
                  <span className={`text-[11px] ${tier.text}`}>{tier.glyph}</span>
                  <span className="text-[11.5px] tracking-wide uppercase text-ink-900 font-bold">{tier.label}</span>
                  <span className={`text-[11.5px] font-bold tabular-nums ${tier.text}`}>{items.length}</span>
                  <span className="h-px flex-1 bg-hairline-soft" />
                  <span className="text-[12.5px] text-ink-300">{tier.note}</span>
                </div>
                {items.map((r) => (
                  <StudentRow
                    key={`${r.courseId}-${r.studentId}`}
                    r={r}
                    tier={tier}
                    onOpen={() => navigate(`/instructor/courses/${r.courseId}/students/${r.studentId}`)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

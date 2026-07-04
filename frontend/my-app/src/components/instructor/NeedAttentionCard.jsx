import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Dashboard "Need attention now" card (PR-2, mockup right column).
 * Count = students whose canonical headline flag `atRisk` is true — the same
 * Critical+High definition (score >= 40, class-context overrides excluded)
 * used by the dashboard tile, Student Progress header, and Insights panel.
 * Watch tier (20–39) is surfaced as a separate "+ N more" line.
 *
 * Data arrives via props (aggregated once at the page level and shared with
 * DashboardWatchlist) — this component fetches nothing.
 */

const TIER_GLYPH = { critical: '▲', high: '●', watch: '●' };
const TIER_TEXT = {
  critical: 'text-risk-critical',
  high: 'text-risk-high',
  watch: 'text-risk-watch',
};

export default function NeedAttentionCard({ rows = [], coursesCount = 0, loading = false }) {
  const navigate = useNavigate();

  const needNow = rows.filter((r) => r.atRisk);
  const top3 = needNow.slice(0, 3); // rows arrive sorted by riskScore desc
  const watchCount = rows.filter((r) => r.riskLevel === 'watch').length;

  const onReviewWatchlist = () => {
    document.getElementById('dashboard-watchlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative overflow-hidden bg-surface border border-risk-criticalBorder rounded-2xl shadow-card p-5 flex flex-col">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-risk-critical" />
      <p className="font-mono text-[10.5px] uppercase tracking-wider text-risk-critical font-semibold">
        Need attention now
      </p>

      <div className="flex items-end gap-2.5 mt-2">
        <span className="text-[52px] font-bold leading-[.9] text-risk-critical tracking-tight tabular-nums">
          {loading ? '…' : needNow.length}
        </span>
        <span className="text-[13px] text-ink-400 leading-snug pb-1">
          students · Critical + High
          <br />
          across {coursesCount} course{coursesCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-risk-criticalRule flex flex-col gap-px">
        {top3.length === 0 && !loading && (
          <p className="text-xs text-ink-300 py-1.5">No one needs urgent attention right now.</p>
        )}
        {top3.map((r) => (
          <button
            key={`${r.courseId}-${r.studentId}`}
            type="button"
            onClick={() => navigate(`/instructor/courses/${r.courseId}/students/${r.studentId}`)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-risk-criticalTintDeep transition-colors"
          >
            <span className={`text-[9px] ${TIER_TEXT[r.riskLevel] || 'text-ink-300'}`}>
              {TIER_GLYPH[r.riskLevel] || '●'}
            </span>
            <span className="text-[13px] font-semibold text-ink-900 flex-1 truncate">{r.name}</span>
            <span className="text-[11px] text-ink-300 flex-shrink-0">{r.courseShort}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-ink-200 mt-2.5">+ {watchCount} more in the Watch tier</p>

      <button type="button" onClick={onReviewWatchlist} className="mt-auto pt-3.5 w-full">
        <span className="block bg-risk-critical hover:bg-risk-criticalAccent text-white rounded-lg py-2.5 font-semibold text-[13.5px] text-center transition-colors">
          Review the watchlist →
        </span>
      </button>
    </div>
  );
}

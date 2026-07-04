import React from 'react';
import { flagLabel } from './riskLevel';

/**
 * Shared at-risk student row (PR-3) — the canonical visual from
 * DashboardWatchlist, extracted so the Insights "Who should I reach?" list
 * renders the identical row. Superset features the Insights surface needs:
 * persistence pill, class-context override pills, synthetic tag; the course
 * chip is optional (single-course surfaces omit it).
 *
 * NOTE: DashboardWatchlist.jsx (PR-2, no-touch) still carries its own copy of
 * this markup — migrating it to consume this component is a follow-up nano-PR.
 */

export const TIER_META = [
  { key: 'critical', label: 'Critical', glyph: '▲', note: 'needs a call today', text: 'text-risk-critical', tint: 'bg-risk-criticalTint', border: 'border-l-risk-criticalAccent' },
  { key: 'high', label: 'High', glyph: '●', note: 'reach out this week', text: 'text-risk-high', tint: 'bg-risk-highTint', border: 'border-l-risk-highAccent' },
  { key: 'watch', label: 'Watch', glyph: '●', note: 'watch this week', text: 'text-risk-watch', tint: 'bg-risk-watchTint', border: 'border-l-risk-watchAccent' },
];

export const tierMeta = (key) => TIER_META.find((t) => t.key === key) || TIER_META[2];

const FACTOR_STYLES = {
  no_engagement: 'bg-risk-criticalTint text-risk-critical',
  low_pass_rate: 'bg-risk-highTint text-risk-high',
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

export default function StudentRow({ r, onOpen, showCourse = false }) {
  const tier = tierMeta(r.riskLevel);
  const isWell = r.classContext === 'doing_well_in_class';
  const isConfirmed = r.classContext === 'confirmed_at_risk';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full grid grid-cols-[38px_1fr_auto] gap-3.5 items-center px-3 py-3 rounded-xl text-left border-l-[3px] ${isWell ? 'border-l-hairline-strong' : tier.border} hover:bg-surface-hover transition-colors`}
    >
      <span className={`w-[38px] h-[38px] rounded-full ${tier.tint} ${tier.text} flex items-center justify-center font-bold text-[13px]`}>
        {initialsOf(r.name)}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[15px] font-bold text-ink-900">{r.name}</span>
          <span className="font-mono text-[11px] text-ink-200">@{r.username}</span>
          {r.isSynthetic && (
            <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-assistant-tint text-assistant" title={r.personaTag || 'Synthetic student'}>syn</span>
          )}
          {showCourse && r.courseShort && (
            <span className="text-[10.5px] font-semibold text-ink-500 bg-surface-chip rounded px-1.5 py-0.5">{r.courseShort}</span>
          )}
        </span>
        <span className="block text-xs text-ink-400 mt-1 tabular-nums">{summaryLine(r)}</span>
        <span className="flex gap-1.5 mt-1.5 flex-wrap items-center">
          {(r.flags || []).slice(0, 3).map((f) => (
            <span key={f} className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${FACTOR_STYLES[f] || 'bg-surface-chip text-ink-500'}`}>
              {flagLabel(f)}
            </span>
          ))}
          {r.persistence_score != null && r.persistence_score >= 60 && (
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-approve-tint text-approve"
              title="This student retries and eventually passes — grinding, not quitting"
            >
              Persists — passes on retry
            </span>
          )}
          {isWell && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-surface-chip text-ink-400" title="Instructor marked this student as doing well in class">
              Class override
            </span>
          )}
          {isConfirmed && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-risk-criticalTint text-risk-critical" title="Instructor confirmed this student is at-risk in class">
              Confirmed in class
            </span>
          )}
        </span>
      </span>
      <span className="flex items-center gap-3.5">
        <span className="text-right">
          <span className="flex items-baseline gap-0.5 justify-end">
            <span className={`text-[19px] font-bold tabular-nums ${isWell ? 'text-ink-300' : tier.text}`}>{r.riskScore}</span>
            <span className="text-[10px] text-ink-150">/100</span>
          </span>
          <span className={`block font-mono text-[9px] uppercase tracking-wider font-bold mt-0.5 ${isWell ? 'text-ink-300' : tier.text}`}>
            {isWell ? 'Class OK' : `${tier.glyph} ${tier.label}`}
          </span>
        </span>
        <span className="text-ink-100 text-lg">›</span>
      </span>
    </button>
  );
}

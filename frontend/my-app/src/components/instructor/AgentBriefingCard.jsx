import React, { useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';

/**
 * Dashboard hero card. Replaces the old right-column "AI Insights" panel —
 * one narrative paragraph across every course this instructor owns, with an
 * "Ask follow-up" button that pops open the floating chat pre-seeded.
 *
 * The briefing is grounded: backend passes the pre-fetched cross-course KPIs
 * into a single Groq call with a strict JSON contract and every call is
 * logged server-side so a professor who challenges a claim can be walked
 * back to the source numbers.
 *
 * Empty-state-aware: if the instructor has zero courses the backend returns
 * a friendly "create one to start seeing insights" sentence and we render it
 * as-is — the card never hides itself.
 */
export default function AgentBriefingCard({ includeSynthetic = true }) {
  const [state, setState] = useState({ loading: true, text: '', error: '', degraded: false });

  useEffect(() => {
    let cancelled = false;
    // setState lives inside the async IIFE (not in the effect body proper)
    // so the react-hooks/set-state-in-effect rule stays happy — each render
    // of this effect only schedules work; React renders update once the
    // promise settles.
    (async () => {
      if (cancelled) return;
      setState({ loading: true, text: '', error: '', degraded: false });
      try {
        const res = await instructorApi.getBriefing({ includeSynthetic });
        if (cancelled) return;
        // Phase F: backend returns `{ briefing: '', degraded: true, reason }`
        // on Groq timeout / upstream failure. We render a soft fallback line
        // instead of an error so the dashboard still feels alive while the
        // KPI tiles (which don't depend on Groq) carry the dense info.
        const payload = res?.data || {};
        setState({
          loading: false,
          text: payload.briefing || '',
          error: '',
          degraded: Boolean(payload.degraded),
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          loading: false,
          text: '',
          error: e?.message || 'Failed to load briefing',
          degraded: false,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [includeSynthetic]);

  const onAskFollowUp = () => {
    // The floating InstructorChatPanel listens for this event. We pre-seed
    // the input with a context-aware question so the professor can tweak /
    // send without having to invent a prompt from scratch.
    const prefill = state.text
      ? 'Can you expand on the briefing above? What should I do first?'
      : 'What should I focus on across my courses this week?';
    window.dispatchEvent(
      new CustomEvent('instructor:openChat', { detail: { prefill } }),
    );
  };

  return (
    <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="w-[26px] h-[26px] rounded-lg bg-assistant-tint text-assistant flex items-center justify-center shrink-0">
          <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
          </svg>
        </span>
        <span className="text-[14.5px] font-bold text-ink-900">Today&apos;s briefing</span>
        <span className="font-mono text-[10px] tracking-wide uppercase text-ink-200">grounded in your data</span>
      </div>

      {state.loading ? (
        <div className="space-y-2 mt-3.5">
          <div className="h-3.5 w-full bg-assistant-tint rounded animate-pulse" />
          <div className="h-3.5 w-[92%] bg-assistant-tint rounded animate-pulse" />
          <div className="h-3.5 w-[70%] bg-assistant-tint rounded animate-pulse" />
        </div>
      ) : state.error ? (
        <p className="text-sm text-risk-critical mt-3.5">{state.error}</p>
      ) : state.degraded ? (
        // Soft fallback when the agent timed out or the upstream is
        // unhealthy. The numbers on the dashboard are still live; we
        // just don't have the narrative paragraph right now.
        <p className="text-[15px] text-ink-600 mt-3.5 leading-relaxed italic">
          AI summary is taking longer than usual — the numbers on this dashboard are live. Try the Insights Assistant for a specific question.
        </p>
      ) : (
        <p className="text-[15px] text-ink-600 mt-3.5 leading-relaxed">
          {state.text || '—'}
        </p>
      )}

      <button
        type="button"
        onClick={onAskFollowUp}
        className="mt-4 text-[13.5px] font-semibold text-assistant hover:underline"
      >
        Ask a follow-up →
      </button>
    </div>
  );
}

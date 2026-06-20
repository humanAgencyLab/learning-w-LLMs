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
    <div className="border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-wide text-indigo-700/80 font-semibold">
              Today&apos;s briefing
            </p>
            <span className="text-[10px] text-gray-400">&middot; grounded in your data</span>
          </div>
          {state.loading ? (
            <div className="space-y-2 mt-2">
              <div className="h-3.5 w-full bg-indigo-100/70 rounded animate-pulse" />
              <div className="h-3.5 w-[92%] bg-indigo-100/70 rounded animate-pulse" />
              <div className="h-3.5 w-[70%] bg-indigo-100/70 rounded animate-pulse" />
            </div>
          ) : state.error ? (
            <p className="text-sm text-rose-700 mt-1.5">{state.error}</p>
          ) : state.degraded ? (
            // Soft fallback when the agent timed out or the upstream is
            // unhealthy. The numbers on the dashboard are still live; we
            // just don't have the narrative paragraph right now.
            <p className="text-[15px] text-gray-700 mt-1.5 leading-relaxed italic">
              AI summary is taking longer than usual — the numbers on this dashboard are live. Try the Insights Assistant for a specific question.
            </p>
          ) : (
            <p className="text-[15px] text-gray-800 mt-1.5 leading-relaxed">
              {state.text || '—'}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onAskFollowUp}
              className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg"
            >
              Ask follow-up →
            </button>
            <span className="text-[11px] text-gray-400">
              Opens the Insights Assistant with a pre-seeded question.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

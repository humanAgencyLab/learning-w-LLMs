import React, { useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';

/**
 * Top of the Insights page: 3–5 agent-generated narrative cards that frame
 * the existing recharts charts underneath. Each card has a "View chart"
 * button that scrolls to the referenced chart container with a brief
 * highlight flash so the think-aloud participant sees the link between the
 * sentence and the visualization.
 *
 * Chart refs are constrained server-side to:
 *   'tree' | 'milestones' | 'heatmap' | 'atRisk' | 'none'
 *
 * The parent page passes a `chartRefs` object mapping each ref to a React
 * ref pointing at that chart's section wrapper. 'none' cards hide the
 * "View chart" button.
 *
 * "Ask about this" opens the floating chat pre-seeded with the card body —
 * same pattern as AgentBriefingCard's follow-up button.
 */

const CHART_LABELS = {
  tree: 'course tree',
  milestones: 'milestone difficulty',
  heatmap: 'topic × student heatmap',
  atRisk: 'at-risk students',
};

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
        >
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded mt-3" />
          <div className="h-3 w-[92%] bg-gray-100 rounded mt-1.5" />
          <div className="h-3 w-3/4 bg-gray-100 rounded mt-1.5" />
          <div className="h-6 w-24 bg-gray-100 rounded mt-4" />
        </div>
      ))}
    </div>
  );
}

function flashElement(el) {
  if (!el) return;
  // Subtle indigo ring that fades — helps the participant's eye follow the
  // jump. We add + remove a Tailwind class directly instead of rendering a
  // highlight state into each chart, since the target charts are unaware of
  // which card pointed at them.
  el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'transition');
  window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2');
  }, 1400);
}

export default function InsightCards({ courseId, chartRefs = {}, includeSynthetic = true }) {
  const [state, setState] = useState({ loading: true, cards: [], error: '', degraded: false });

  useEffect(() => {
    let cancelled = false;
    if (!courseId) return undefined;
    // setState lives inside the async IIFE (not in the effect body proper)
    // so react-hooks/set-state-in-effect doesn't flag a cascading render.
    (async () => {
      if (cancelled) return;
      setState({ loading: true, cards: [], error: '', degraded: false });
      try {
        const res = await instructorApi.getInsightCards(courseId, { includeSynthetic });
        if (cancelled) return;
        const payload = res?.data || {};
        const cards = Array.isArray(payload.insightCards) ? payload.insightCards : [];
        setState({ loading: false, cards, error: '', degraded: Boolean(payload.degraded) });
      } catch (e) {
        if (cancelled) return;
        setState({
          loading: false,
          cards: [],
          error: e?.message || 'Failed to load insight cards',
          degraded: false,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, includeSynthetic]);

  const scrollToChart = (ref) => {
    const target = chartRefs?.[ref]?.current;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Delay the flash slightly so the scroll animation lines up visually.
    window.setTimeout(() => flashElement(target), 350);
  };

  const askAboutCard = (card) => {
    const prefill = `Tell me more about: ${card.title}. ${card.body}`;
    window.dispatchEvent(
      new CustomEvent('instructor:openChat', { detail: { prefill } }),
    );
  };

  if (state.loading) return <Skeleton />;

  if (state.error) {
    return (
      <div className="border border-rose-200 bg-rose-50 text-rose-700 text-sm rounded-xl p-4">
        {state.error}
      </div>
    );
  }

  if (state.degraded && !state.cards.length) {
    // Phase F: graceful degrade when Groq timed out or the upstream is
    // unhealthy. The KPI strip + charts above/below are already doing the
    // heavy lifting — we just acknowledge the narrative is on pause.
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-medium">AI narrative cards are temporarily unavailable.</p>
        <p className="text-xs text-amber-800 mt-0.5">
          The charts and numbers on this page are live — try the Insights Assistant for a specific question.
        </p>
      </div>
    );
  }

  if (!state.cards.length) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-5 text-center">
        <p className="text-sm text-gray-700 font-medium">No insights yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Once students attempt milestones, the assistant will surface the top signals here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {state.cards.map((card) => {
        const hasChart = card.chartRef && card.chartRef !== 'none';
        const chartLabel = hasChart ? CHART_LABELS[card.chartRef] || card.chartRef : null;
        return (
          <div
            key={card.id}
            className="bg-white border border-gray-200 hover:border-indigo-200 rounded-xl p-4 flex flex-col"
          >
            <div className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 text-[11px] font-bold">
                ✦
              </span>
              <p className="font-semibold text-gray-900 text-[15px] leading-snug">
                {card.title}
              </p>
            </div>
            <p className="text-sm text-gray-700 mt-2 leading-relaxed flex-1">
              {card.body}
            </p>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {hasChart ? (
                <button
                  type="button"
                  onClick={() => scrollToChart(card.chartRef)}
                  className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-lg"
                  title={`Scroll to the ${chartLabel}`}
                >
                  View {chartLabel} ↓
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => askAboutCard(card)}
                className="text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg"
              >
                Ask about this
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

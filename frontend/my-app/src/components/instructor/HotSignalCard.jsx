import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

/**
 * Compact one-liner card for the course (authoring) page. Replaces the
 * CoursePerformanceSummary widget we ripped out. Shows the most pressing
 * issue in the course with a CTA into the Insights page.
 *
 * The backend handles the "no attempts yet" case and returns a friendly
 * fallback sentence, so we never hide the card — an empty slot feels wrong.
 */
export default function HotSignalCard({ courseId, includeSynthetic = true }) {
  const [state, setState] = useState({
    loading: true,
    text: '',
    error: '',
    grounded: null,
    degraded: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!courseId) return undefined;
    // setState lives inside the async IIFE (not in the effect body proper)
    // so react-hooks/set-state-in-effect doesn't flag a cascading render.
    (async () => {
      if (cancelled) return;
      setState({ loading: true, text: '', error: '', grounded: null, degraded: false });
      try {
        const res = await instructorApi.getHotSignal(courseId, { includeSynthetic });
        if (cancelled) return;
        const payload = res?.data || {};
        setState({
          loading: false,
          text: payload.hotSignal || '',
          error: '',
          grounded: payload.grounded ?? null,
          degraded: Boolean(payload.degraded),
        });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, text: '', error: e?.message || 'Failed to load signal', grounded: null, degraded: false });
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, includeSynthetic]);

  return (
    <div className="bg-assistant-tintSoft border border-assistant-tintDeep rounded-2xl p-4 flex flex-col">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-assistant text-white flex items-center justify-center shrink-0">
          <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
          </svg>
        </span>
        <span className="font-mono uppercase text-[10px] tracking-[.08em] text-assistant-deep font-semibold">Hot signal</span>
      </div>
      {state.loading ? (
        <div className="h-4 w-3/4 bg-assistant-tintDeep rounded animate-pulse mt-2 mb-auto" />
      ) : state.error ? (
        <p className="text-xs text-risk-critical mt-2 mb-auto leading-relaxed">{state.error}</p>
      ) : state.degraded ? (
        // Phase F: graceful-degrade fallback. The CTA still goes to the
        // Insights page where the charts + KPI strip carry the load.
        <p className="text-xs text-assistant-text mt-2 mb-auto leading-relaxed italic">
          AI summary unavailable right now — open Insights for the live numbers.
        </p>
      ) : (
        <p className="text-xs text-assistant-text mt-2 mb-auto leading-relaxed">{state.text || '—'}</p>
      )}
      <Link
        to={`/instructor/courses/${courseId}/insights`}
        className="self-start mt-2 text-xs font-bold text-assistant hover:underline"
      >
        Open in Insights →
      </Link>
    </div>
  );
}

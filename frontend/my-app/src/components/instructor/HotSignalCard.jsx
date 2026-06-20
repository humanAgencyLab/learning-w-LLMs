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
    <div className="border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white rounded-xl p-4 flex items-start gap-4">
      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-indigo-700/80 font-semibold">Hot signal</p>
        {state.loading ? (
          <div className="h-4 w-3/4 bg-indigo-100/70 rounded animate-pulse mt-1" />
        ) : state.error ? (
          <p className="text-sm text-rose-700 mt-0.5">{state.error}</p>
        ) : state.degraded ? (
          // Phase F: graceful-degrade fallback. The CTA still goes to the
          // Insights page where the charts + KPI strip carry the load.
          <p className="text-sm text-gray-700 mt-0.5 leading-snug italic">
            AI summary unavailable right now — open Insights for the live numbers.
          </p>
        ) : (
          <p className="text-sm text-gray-800 mt-0.5 leading-snug">{state.text || '—'}</p>
        )}
      </div>
      <Link
        to={`/instructor/courses/${courseId}/insights`}
        className="text-xs font-medium text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1 rounded-lg shrink-0"
      >
        Open in Insights →
      </Link>
    </div>
  );
}

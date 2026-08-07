import React, { useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';

/**
 * Tutor-refusal log (Addition 1), shown on the student detail page beside the
 * session replay.
 *
 * Why it exists: a refused turn deliberately records no attempt, no retry and
 * no milestone advance, so a student who only triggers refusals is invisible
 * to every risk analytic. This is the only place that behaviour shows up.
 * Deliberately minimal — the record and its queryability are the point.
 */
export default function RefusalLogPanel({ courseId, studentId }) {
  const [state, setState] = useState({ loading: true, events: [], error: null });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await instructorApi.getRefusalLog(courseId, studentId);
        if (alive) setState({ loading: false, events: res.data.events || [], error: null });
      } catch (e) {
        if (alive) setState({ loading: false, events: [], error: e.message || 'Failed to load' });
      }
    })();
    return () => { alive = false; };
  }, [courseId, studentId]);

  if (state.loading) return null;
  if (state.error) {
    return <p className="text-xs text-risk-critical">Refusal log unavailable: {state.error}</p>;
  }
  if (!state.events.length) return null;

  const shown = expanded ? state.events : state.events.slice(0, 3);

  return (
    <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-ink-900">Tutor refusals</h2>
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-risk-highTint text-risk-high">
          {state.events.length}
        </span>
      </div>
      <p className="text-xs text-ink-400 mb-3">
        Times the tutor declined this student&apos;s request. Refused turns are not graded and record no
        attempt, so they appear nowhere else in this student&apos;s data.
      </p>
      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e._id} className="border border-hairline-soft rounded-lg px-3 py-2 bg-surface-subtle">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                e.category === 'safety_floor'
                  ? 'bg-risk-criticalTint text-risk-critical'
                  : 'bg-risk-highTint text-risk-high'
              }`}>
                {e.category === 'safety_floor' ? 'Safety floor' : 'Your course rule'}
              </span>
              <span className="text-[11px] text-ink-300">
                {new Date(e.createdAt).toLocaleString()} · detected by {e.detectedBy}
              </span>
            </div>
            {e.refusalReason && <p className="text-sm text-ink-700">{e.refusalReason}</p>}
            {e.clause && (
              <p className="text-xs text-ink-500 mt-1 italic">Your rule: &ldquo;{e.clause}&rdquo;</p>
            )}
            {e.studentMessage && (
              <p className="text-xs text-ink-400 mt-1 font-mono truncate" title={e.studentMessage}>
                Student wrote: {e.studentMessage}
              </p>
            )}
          </li>
        ))}
      </ul>
      {state.events.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-brand hover:underline font-medium"
        >
          {expanded ? 'Show fewer' : `Show all ${state.events.length}`}
        </button>
      )}
    </section>
  );
}

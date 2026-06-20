import React, { useMemo, useState } from 'react';

/**
 * "Quizzes that aren't clicking yet" — topic-level quiz difficulty table.
 *
 * Each row shows one topic from `getCoursePerformanceSummary().quizByTopic`.
 * The columns are chosen to answer one instructor question:
 *   "Where should I intervene?" → rows with low first-attempt pass rate or
 *   high never-passed rate. The former means first exposure isn't working
 *   (lecture / prompt-design problem); the latter means even repeated
 *   attempts aren't moving the needle (content or assessment problem).
 *
 * Rows where nobody has ever passed (`neverPassedRate === 100`) are
 * highlighted in rose. Rows with zero attempts are de-emphasized and sorted
 * to the bottom — they're noise for the intervention decision.
 *
 * Sorted by ascending firstAttemptPassRate by default (hardest on top).
 * Null rates sort last.
 */

function passAccent(pct) {
  if (pct == null) return 'text-gray-400';
  if (pct >= 70) return 'text-emerald-700';
  if (pct >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  // The service rounds to 1 decimal; render whole percentages to keep the
  // table easy to scan. A half-percent difference isn't an intervention signal.
  return `${Math.round(v)}%`;
}

function fmtDecimal(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'published') return null; // default, don't clutter
  const color =
    s === 'draft'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <span className={`ml-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      {status || 'draft'}
    </span>
  );
}

export default function QuizByTopicTable({ quizByTopic = [] }) {
  const [hideEmpty, setHideEmpty] = useState(true);

  const rows = useMemo(() => {
    const list = Array.isArray(quizByTopic) ? [...quizByTopic] : [];
    // Order: topics with attempts and lowest first-attempt-pass rate first,
    // then remaining attempted topics by rate, then unattempted topics by
    // course order. Nulls always last within their group.
    list.sort((a, b) => {
      const aAtt = (a.studentsWithAttempts || 0) > 0 ? 0 : 1;
      const bAtt = (b.studentsWithAttempts || 0) > 0 ? 0 : 1;
      if (aAtt !== bAtt) return aAtt - bAtt;
      const av = a.firstAttemptPassRate;
      const bv = b.firstAttemptPassRate;
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return (a.orderIndex || 0) - (b.orderIndex || 0);
      if (aNull) return 1;
      if (bNull) return -1;
      return av - bv;
    });
    return list;
  }, [quizByTopic]);

  const visible = hideEmpty ? rows.filter((r) => (r.studentsWithAttempts || 0) > 0) : rows;
  const hiddenCount = rows.length - visible.length;

  if (!rows.length) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-6 text-center">
        <p className="text-sm text-gray-700 font-medium">No topics yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Add topics with quizzes and this table will surface the ones students are struggling with.
        </p>
      </div>
    );
  }

  if (!visible.length) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-6 text-center">
        <p className="text-sm text-gray-700 font-medium">No quiz attempts yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          {rows.length} topic{rows.length === 1 ? '' : 's'} configured — once students submit quizzes the toughest ones will surface here.
        </p>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => setHideEmpty(false)}
            className="mt-3 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-lg"
          >
            Show all {rows.length} topic{rows.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Topic</th>
              <th className="text-right px-3 py-2 font-semibold">1st-attempt pass</th>
              <th className="text-right px-3 py-2 font-semibold">Avg attempts to pass</th>
              <th className="text-right px-3 py-2 font-semibold">Never passed</th>
              <th className="text-right px-3 py-2 font-semibold">Students</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const noAttempts = (r.studentsWithAttempts || 0) === 0;
              const neverPassed100 = r.neverPassedRate === 100;
              const rowClass = neverPassed100
                ? 'bg-rose-50/60'
                : noAttempts
                ? 'bg-gray-50/60 text-gray-400'
                : '';
              return (
                <tr key={r.topicId} className={`border-t border-gray-100 ${rowClass}`}>
                  <td className="px-3 py-2 min-w-0">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 truncate max-w-[280px]" title={r.title}>
                        {r.title || 'Untitled topic'}
                      </span>
                      {statusBadge(r.status)}
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${passAccent(r.firstAttemptPassRate)}`}>
                    {fmtPct(r.firstAttemptPassRate)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800">
                    {fmtDecimal(r.avgAttemptsToPass, 1)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      neverPassed100 ? 'text-rose-700' : 'text-gray-700'
                    }`}
                  >
                    {fmtPct(r.neverPassedRate)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {r.studentsWithAttempts || 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setHideEmpty(false)}
          className="mt-2 text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
        >
          Show {hiddenCount} topic{hiddenCount === 1 ? '' : 's'} with no attempts
        </button>
      )}
      {hiddenCount === 0 && rows.some((r) => (r.studentsWithAttempts || 0) === 0) && (
        <button
          type="button"
          onClick={() => setHideEmpty(true)}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          Hide topics with no attempts
        </button>
      )}
    </div>
  );
}

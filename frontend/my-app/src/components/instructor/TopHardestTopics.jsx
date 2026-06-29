import React, { useMemo, useState } from 'react';

/**
 * "What should I cover in lecture?" — the up-to-3 hardest published topics.
 *
 * Everything is computed client-side from data the Insights page already loads:
 *   - heatmap: { topics:[{id,title}], students:[{name, cells:[{courseTopicId,attempts,passes}]}] }
 *   - moduleDifficulty: [{topicId, moduleTitle, passRate, studentsAttempted, totalAttempts}]
 * No backend change. Draft topics fall out naturally via the participation floor
 * (they have zero attempts).
 */

const PARTICIPATION_FLOOR = 0.30; // ≥30% of enrolled must have attempted
const STRUGGLE_FLOOR = 2;         // ≥2 students attempted-but-failed (difficulty floor)
const STUCK_ATTEMPTS = 3;         // ≥3 attempts and still not passed

// Pure, testable: returns the up-to-3 hardest topics with per-topic stats.
export function selectHardestTopics(heatmap, enrolledCount) {
  const topics = heatmap?.topics || [];
  const students = heatmap?.students || [];
  const N = enrolledCount || students.length || 0;

  const stats = topics.map((t) => {
    let attempted = 0;
    let passed = 0;
    let struggled = 0;
    let stuck = 0;
    const failedNames = [];
    for (const s of students) {
      const cell = (s.cells || []).find((c) => c.courseTopicId === t.id);
      const a = cell?.attempts || 0;
      const p = cell?.passes || 0;
      if (a > 0) {
        attempted += 1;
        if (p > 0) {
          passed += 1;
        } else {
          struggled += 1;
          failedNames.push(s.name || s.username || 'Student');
          if (a >= STUCK_ATTEMPTS) stuck += 1;
        }
      }
    }
    const passRate = attempted > 0 ? Math.round((passed / attempted) * 1000) / 10 : null;
    const participation = N > 0 ? attempted / N : 0;
    return { topicId: t.id, title: t.title, attempted, passed, struggled, stuck, passRate, participation, failedNames };
  });

  return stats
    // Difficulty floor: a topic nobody is failing is not a "cover in lecture"
    // candidate. Without this, a cohort that's passing everything (e.g. mid-sem)
    // would surface 94-100%-pass topics as "hardest". (Participation floor still
    // defends against "1 student tried and failed".)
    .filter((s) => s.participation >= PARTICIPATION_FLOOR && s.struggled >= STRUGGLE_FLOOR)
    .sort((a, b) => {
      const ra = a.passRate == null ? 101 : a.passRate;
      const rb = b.passRate == null ? 101 : b.passRate;
      if (ra !== rb) return ra - rb;           // lowest pass rate = hardest
      return b.attempted - a.attempted;        // tie: more students struggled with it
    })
    .slice(0, 3);
}

function ModuleBars({ topicId, moduleDifficulty }) {
  const mods = (moduleDifficulty || []).filter((m) => m.topicId === topicId);
  if (mods.length === 0) return <p className="text-xs text-gray-400">No module data.</p>;
  const shown = mods.slice(0, 5);
  const overflow = mods.length - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((m, i) => {
        const pr = m.passRate;
        const color = pr == null ? 'bg-gray-300' : pr < 60 ? 'bg-red-400' : pr < 80 ? 'bg-yellow-400' : 'bg-green-400';
        return (
          <div key={m.moduleId || i} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-40 truncate" title={m.moduleTitle}>{m.moduleTitle}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full ${color}`} style={{ width: `${pr == null ? 0 : Math.min(100, pr)}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-10 text-right">{pr == null ? '—' : `${pr}%`}</span>
          </div>
        );
      })}
      {overflow > 0 && <p className="text-[11px] text-gray-400">and {overflow} more module{overflow === 1 ? '' : 's'}</p>}
    </div>
  );
}

function TopicCard({ topic, moduleDifficulty, onViewAllTopicData }) {
  const [open, setOpen] = useState(false);
  const failed = topic.failedNames || [];
  const shownNames = failed.slice(0, 8);
  const moreNames = failed.length - shownNames.length;
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{topic.title}</p>
          <p className="text-xs text-gray-600 mt-0.5">
            <span className={topic.passRate != null && topic.passRate < 60 ? 'text-red-600 font-medium' : ''}>
              {topic.passRate == null ? '—' : `${topic.passRate}%`} topic pass rate
            </span>
            {' · '}{topic.struggled} student{topic.struggled === 1 ? '' : 's'} struggled
            {' · '}{topic.stuck} stuck on it
          </p>
        </div>
        <span className="text-xs text-indigo-600 flex-shrink-0 whitespace-nowrap">Show details {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">Module difficulty</p>
            <ModuleBars topicId={topic.topicId} moduleDifficulty={moduleDifficulty} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
              Students who didn&apos;t pass ({failed.length})
            </p>
            {failed.length === 0 ? (
              <p className="text-xs text-gray-400">None.</p>
            ) : (
              <p className="text-xs text-gray-700">
                {shownNames.join(', ')}{moreNames > 0 ? ` and ${moreNames} more` : ''}
              </p>
            )}
          </div>
          {onViewAllTopicData && (
            <button
              type="button"
              onClick={() => onViewAllTopicData(topic.topicId)}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              View all topic data →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopHardestTopics({ heatmap, moduleDifficulty, enrolledCount, onViewAllTopicData }) {
  const hardest = useMemo(() => selectHardestTopics(heatmap, enrolledCount), [heatmap, enrolledCount]);
  const anyActivity = useMemo(
    () => (heatmap?.students || []).some((s) => (s.cells || []).some((c) => (c.attempts || 0) > 0)),
    [heatmap],
  );

  if (hardest.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {anyActivity
          ? "Students are passing what they've attempted. No topic needs lecture attention yet."
          : 'Not enough activity yet to identify the hardest topics. Come back after students attempt more quizzes.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hardest.map((t) => (
        <TopicCard key={t.topicId} topic={t} moduleDifficulty={moduleDifficulty} onViewAllTopicData={onViewAllTopicData} />
      ))}
    </div>
  );
}

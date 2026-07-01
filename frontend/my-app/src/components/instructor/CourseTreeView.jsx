import React, { useState, useMemo } from 'react';

function passRateColor(rate) {
  if (rate == null) return 'bg-gray-100 text-gray-400';
  if (rate >= 80) return 'bg-green-100 text-green-700';
  if (rate >= 60) return 'bg-lime-100 text-lime-700';
  if (rate >= 40) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function fmtRatio(numerator, denominator) {
  if (!denominator) return null;
  return (numerator / denominator).toFixed(1);
}

function Pill({ children, className = '', title }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] ${className}`} title={title}>
      {children}
    </span>
  );
}

function MilestoneBadges({ milestone }) {
  const { attempts, studentCount, maxAttemptsByOne, autoAdvanced, passRate } = milestone;
  const ratio = fmtRatio(attempts, studentCount);
  return (
    <span className="inline-flex items-center gap-2 flex-wrap justify-end">
      <Pill className={`font-semibold ${passRateColor(attempts ? passRate : null)}`} title="Share of milestone-check attempts on this milestone that passed">
        {attempts ? `${passRate}% pass` : 'no data'}
      </Pill>
      {attempts > 0 && maxAttemptsByOne > 0 && (
        <Pill className="bg-slate-100 text-slate-600" title="Most attempts by any single student on this milestone">
          max {maxAttemptsByOne}
        </Pill>
      )}
      {attempts > 0 && ratio && (
        <Pill className="bg-slate-100 text-slate-600" title="Average attempts per student on this milestone">
          ratio {ratio}
        </Pill>
      )}
      {autoAdvanced > 0 && (
        <Pill className="bg-rose-100 text-rose-700" title="Students who were moved past this milestone without meeting the criteria. A high count is a warning signal">
          {autoAdvanced} auto-advance
        </Pill>
      )}
    </span>
  );
}

function ModuleBadges({ quiz }) {
  // `quiz` is the moduleDifficulty row — quiz-level stats for this module.
  // Returns "no quiz data" if no submitted attempts yet.
  if (!quiz || !quiz.studentsAttempted) {
    return (
      <span className="inline-flex items-center gap-2">
        <Pill className="bg-gray-100 text-gray-400">no quiz data</Pill>
      </span>
    );
  }
  const { passRate, totalAttempts, studentsAttempted, maxAttemptsByOne } = quiz;
  const ratio = fmtRatio(totalAttempts, studentsAttempted);
  return (
    <span className="inline-flex items-center gap-2 flex-wrap justify-end">
      <Pill
        className={`font-semibold ${passRateColor(passRate)}`}
        title="Share of students who passed this module's quiz"
      >
        {passRate != null ? `${passRate}% student pass` : 'no data'}
      </Pill>
      {maxAttemptsByOne > 0 && (
        <Pill className="bg-slate-100 text-slate-600" title="Most quiz attempts by any single student on this module">
          max {maxAttemptsByOne}
        </Pill>
      )}
      {ratio && (
        <Pill className="bg-slate-100 text-slate-600" title="Average quiz attempts per student on this module">
          ratio {ratio}
        </Pill>
      )}
    </span>
  );
}

function TopicBadges({ totals }) {
  const { attempts, passRate } = totals || {};
  return (
    <span className="inline-flex items-center gap-2">
      <Pill className={`font-semibold ${passRateColor(attempts ? passRate : null)}`} title="Share of milestone-check attempts on this topic that passed">
        {attempts ? `${passRate}% pass` : 'no data'}
      </Pill>
      {attempts > 0 && (
        <Pill className="bg-slate-100 text-slate-600" title="Total milestone-check attempts across all students on this topic">
          {attempts} attempt{attempts !== 1 ? 's' : ''}
        </Pill>
      )}
    </span>
  );
}

function MilestoneRow({ milestone }) {
  return (
    <div className="flex items-start gap-3 pl-12 py-1.5 border-l border-gray-200 ml-6">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 line-clamp-2">{milestone.text || '(empty)'}</p>
      </div>
      <MilestoneBadges milestone={milestone} />
    </div>
  );
}

function ModuleNode({ module: mod, quizByModuleId }) {
  // B3 fix (June 2026 audit): default modules COLLAPSED so the tree opens at
  // module level — milestones stay hidden until an instructor expands a module.
  const [open, setOpen] = useState(false);
  const quiz = quizByModuleId.get(mod.moduleId) || null;
  return (
    <div className="ml-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1.5 pl-6 border-l border-gray-200 hover:bg-gray-50 rounded-r"
      >
        <span className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">{open ? '▼' : '▶'}</span>
          <span className="font-medium text-gray-800 text-sm">{mod.title}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {mod.difficulty}
          </span>
        </span>
        <ModuleBadges quiz={quiz} />
      </button>
      {open && (
        <div className="mt-0.5">
          {mod.milestones.map((ms) => (
            <MilestoneRow key={`${mod.moduleId}:${ms.milestoneIndex}`} milestone={ms} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicNode({ topic, quizByModuleId }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl"
      >
        <span className="flex items-center gap-3">
          <span className="text-gray-400">{open ? '▼' : '▶'}</span>
          <span className="font-semibold text-gray-900">{topic.title}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{topic.status}</span>
        </span>
        <TopicBadges totals={topic.totals} />
      </button>
      {open && (
        <div className="pb-3 pt-1 pr-2">
          {(topic.modules || []).map((mod) => (
            <ModuleNode key={mod.moduleId} module={mod} quizByModuleId={quizByModuleId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CourseTreeView({ tree, moduleDifficulty = [] }) {
  // moduleId is unique per course, so a flat lookup is fine.
  const quizByModuleId = useMemo(() => {
    const m = new Map();
    for (const row of moduleDifficulty) {
      if (row && row.moduleId) m.set(row.moduleId, row);
    }
    return m;
  }, [moduleDifficulty]);

  if (!tree || !Array.isArray(tree.topics) || tree.topics.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
        No topics yet — add topics on the Build page to see this tree.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Course total:{' '}
            <span className="font-semibold text-gray-700">
              {tree.totals.attempts} attempts
            </span>{' '}
            · {tree.totals.passRate}% pass rate
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Topic and milestone pass rates count attempts on the milestone reflection checks. Module pass rate counts students who passed the module quiz. Max and ratio show highest and average attempts per student. Auto-advance counts students moved past without meeting the criteria.
        </p>
      </div>
      {tree.topics.map((t) => (
        <TopicNode key={t.courseTopicId} topic={t} quizByModuleId={quizByModuleId} />
      ))}
    </div>
  );
}

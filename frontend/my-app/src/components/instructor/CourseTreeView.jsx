import React, { useState } from 'react';

function passRateColor(rate, attempts) {
  if (!attempts) return 'bg-gray-100 text-gray-400';
  if (rate >= 80) return 'bg-green-100 text-green-700';
  if (rate >= 60) return 'bg-lime-100 text-lime-700';
  if (rate >= 40) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function NodeBadge({ attempts, passRate, autoAdvanced, studentCount }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <span className={`px-2 py-0.5 rounded-full font-semibold ${passRateColor(passRate, attempts)}`}>
        {attempts ? `${passRate}% pass` : 'no data'}
      </span>
      {attempts > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {attempts} attempt{attempts !== 1 ? 's' : ''}
        </span>
      )}
      {studentCount > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {studentCount} student{studentCount !== 1 ? 's' : ''}
        </span>
      )}
      {autoAdvanced > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700" title="Times the system force-advanced a student">
          {autoAdvanced} auto-advance
        </span>
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
      <NodeBadge
        attempts={milestone.attempts}
        passRate={milestone.passRate}
        autoAdvanced={milestone.autoAdvanced}
        studentCount={milestone.studentCount}
      />
    </div>
  );
}

function ModuleNode({ module: mod }) {
  const [open, setOpen] = useState(true);
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
        <NodeBadge attempts={mod.totals.attempts} passRate={mod.totals.passRate} autoAdvanced={0} studentCount={0} />
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

function TopicNode({ topic }) {
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
        <NodeBadge attempts={topic.totals.attempts} passRate={topic.totals.passRate} autoAdvanced={0} studentCount={0} />
      </button>
      {open && (
        <div className="pb-3 pt-1 pr-2">
          {(topic.modules || []).map((mod) => (
            <ModuleNode key={mod.moduleId} module={mod} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CourseTreeView({ tree }) {
  if (!tree || !Array.isArray(tree.topics) || tree.topics.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
        No topics yet — add topics on the Build page to see this tree.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Course total:{' '}
          <span className="font-semibold text-gray-700">
            {tree.totals.attempts} attempts
          </span>{' '}
          · {tree.totals.passRate}% pass rate
        </span>
      </div>
      {tree.topics.map((t) => (
        <TopicNode key={t.courseTopicId} topic={t} />
      ))}
    </div>
  );
}

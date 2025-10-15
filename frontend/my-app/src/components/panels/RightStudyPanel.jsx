import React from 'react';

export default function RightStudyPanel({ topic, overallProgressPct, modules, onCompleteMilestone }) {
  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
      {/* Topic */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Topic</h3>
        <p className="mt-1 text-lg font-semibold">{topic}</p>
      </section>

      {/* Progress */}
      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Overall Progress</h3>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-2 bg-neutral-200 rounded-full">
            <div 
              className="h-2 bg-blue-500 rounded-full transition-all duration-500" 
              style={{ width: `${overallProgressPct}%` }} 
            />
          </div>
          <span className="text-sm font-semibold">{overallProgressPct}%</span>
        </div>
      </section>

      {/* Gamification Stats */}
      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Achievements</h3>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⭐</span>
            <span className="text-sm font-semibold">450 XP</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">💎</span>
            <span className="text-sm font-semibold">12 Gems</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <span className="text-sm font-semibold">Trophy</span>
          </div>
        </div>
      </section>

      {/* Modules & Milestones */}
      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Learning Path</h3>
        <div className="mt-2 space-y-2">
          {modules.map(m => (
            <details key={m.id} className="group rounded-xl border bg-white open:shadow-sm">
              <summary className="cursor-pointer px-3 py-2 font-medium flex items-center justify-between hover:bg-neutral-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    m.status === 'complete' ? 'bg-green-500' :
                    m.status === 'in_progress' ? 'bg-blue-500' :
                    'bg-gray-400'
                  }`}>
                    {m.id}
                  </div>
                  <span>{m.title}</span>
                </div>
                <span className="text-xs text-neutral-500 group-open:hidden">
                  {m.status === 'complete' ? '✓' : 
                   m.status === 'in_progress' ? '▶' : '🔒'}
                </span>
              </summary>
              <ul className="px-3 pb-3 space-y-2">
                {m.milestones.map(ms => (
                  <li key={ms.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={ms.done} 
                        readOnly 
                        className="size-4 rounded border-2 border-neutral-300 checked:bg-green-500 checked:border-green-500" 
                      />
                      <span className={`text-sm ${ms.done ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
                        {ms.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-600">
                        +{ms.xp} XP · +{ms.gems} 💎
                      </span>
                      {ms.trophyOnComplete && (
                        <span className={`text-sm ${ms.done ? '' : 'opacity-40'}`}>🏆</span>
                      )}
                      {!ms.done && m.status !== 'locked' && (
                        <button
                          onClick={() => onCompleteMilestone?.(m.id, ms.id)}
                          className="px-2 py-1 text-xs rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Claim
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {/* Ask Question Button */}
      <section className="mt-6">
        <button className="w-full rounded-xl bg-blue-500 text-white py-3 px-4 font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Ask Question
        </button>
      </section>
    </div>
  );
}

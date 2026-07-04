import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../../lib/instructorApi';

/**
 * PR-4 expandable topic row for the Course Detail Topics card.
 *
 * Per-status affordances (preserves every pre-PR-4 action):
 *   published   → primary: Edit (outline)      ⋯ menu: Unpublish · Delete
 *   draft       → primary: Approve (green)     ⋯ menu: Edit · Delete
 *   approved    → primary: Publish (green)     ⋯ menu: Edit · Delete
 *   unpublished → primary: Re-publish (green)  ⋯ menu: Edit · Delete
 *
 * Destructive Delete lives ONLY in the ⋯ menu (E-Cd-4) and keeps the
 * existing window.confirm safety net.
 */

const GREEN_BTN = 'bg-approve-tint border border-approve-border rounded-lg px-3 py-1.5 text-xs font-semibold text-approve hover:bg-approve-tintDeep transition-colors disabled:opacity-50';
const OUTLINE_BTN = 'bg-surface border border-hairline-strong rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand hover:text-brand transition-colors';

// Topic-level tier badge: the most common module difficulty (modules carry the
// intro/core/apply tier; topics don't have one of their own).
function dominantDifficulty(topic) {
  const counts = {};
  for (const m of topic.modules || []) counts[m.difficulty || 'core'] = (counts[m.difficulty || 'core'] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export default function TopicRow({ topic, courseId, busy, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const status = topic.status;
  const moduleCount = topic.modules?.length || 0;
  const milestoneCount = (topic.modules || []).reduce((s, m) => s + (m.milestones?.length || 0), 0);
  const tier = dominantDifficulty(topic);
  const editHref = `/instructor/courses/${courseId}/topics/${topic._id}`;

  const run = (fn) => { setMenuOpen(false); onAction(fn); };
  const onDelete = () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this topic? Students will no longer be able to access it.')) return;
    onAction(() => instructorApi.deleteTopic(courseId, topic._id));
  };

  const primary = status === 'published' ? (
    <Link to={editHref} className={OUTLINE_BTN}>Edit</Link>
  ) : status === 'draft' ? (
    <button type="button" disabled={busy} className={GREEN_BTN} onClick={() => run(() => instructorApi.approveTopic(courseId, topic._id))}>Approve</button>
  ) : status === 'approved' ? (
    <button type="button" disabled={busy} className={GREEN_BTN} onClick={() => run(() => instructorApi.publishTopic(courseId, topic._id))}>Publish</button>
  ) : (
    <button type="button" disabled={busy} className={GREEN_BTN} onClick={() => run(() => instructorApi.publishTopic(courseId, topic._id))}>Re-publish</button>
  );

  return (
    <div className="rounded-xl hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 px-2 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-[22px] h-[22px] rounded-md bg-surface-chip text-ink-400 font-semibold text-[11px] flex items-center justify-center flex-shrink-0"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold truncate ${status === 'draft' ? 'text-ink-700' : 'text-ink-900'}`}>{topic.title}</span>
            {tier && (
              <span className="bg-hairline-softer text-ink-500 font-mono uppercase text-[9.5px] px-1.5 py-0.5 rounded flex-shrink-0">
                {tier}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-ink-300 mt-0.5">
            {moduleCount} module{moduleCount !== 1 ? 's' : ''} · {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
          </p>
        </div>
        {primary}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded-lg border border-hairline-strong bg-surface text-ink-400 hover:border-ink-50 flex items-center justify-center transition-colors"
            title="More actions"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-40 bg-surface border border-hairline-strong rounded-xl shadow-popover p-1.5 animate-popIn">
                {status === 'published' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => instructorApi.unpublishTopic(courseId, topic._id))}
                    className="block w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] text-ink-600 hover:bg-surface-subtle disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                ) : (
                  <Link
                    to={editHref}
                    onClick={() => setMenuOpen(false)}
                    className="block w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] text-ink-600 hover:bg-surface-subtle"
                  >
                    Edit
                  </Link>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  className="block w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] text-risk-critical hover:bg-risk-criticalTint disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="pl-10 pr-3 pb-4 animate-fadeIn">
          {topic.objective && <p className="text-xs text-ink-500 mb-2">{topic.objective}</p>}
          {topic.syllabusAnchors?.length > 0 && (
            <p className="text-xs text-ink-500 mb-2.5">
              <span className="font-semibold text-ink-600">Syllabus: </span>
              {topic.syllabusAnchors.join(' · ')}
            </p>
          )}
          {(topic.modules || []).map((m) => (
            <div key={m.moduleId} className="mb-3">
              <p className="font-mono uppercase text-[10.5px] tracking-[.04em] text-ink-300 font-bold mb-1.5">
                {m.title}{m.difficulty ? ` · ${m.difficulty}` : ''}
              </p>
              {(m.milestones || []).map((ms, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className="w-[5px] h-[5px] rounded-full bg-brand flex-shrink-0" />
                  <span className="text-sm text-ink-600">{ms.text}</span>
                </div>
              ))}
              <div className="bg-surface-chip rounded-lg px-3 py-2 text-xs text-ink-500 mt-1.5 inline-block">
                Quiz · {m.quizPattern?.questionCount ?? 5} questions · {m.quizPattern?.cognitiveLevel || 'understand'}
              </div>
            </div>
          ))}
          {moduleCount === 0 && <p className="text-xs text-ink-300">No modules yet.</p>}
        </div>
      )}
    </div>
  );
}

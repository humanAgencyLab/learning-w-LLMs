import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

/**
 * "Run simulation" (SIMULATION_FEATURE_PLAN.md Section 5).
 *
 * Sits directly under the AI teaching instructions card, because that is what
 * the button tests: two simulated students work through one module of a
 * published topic against the real tutor, and the instructor reads the
 * resulting transcripts to judge whether the tutor honoured their instructions
 * — the same job as the live A5 role-play it replaces.
 *
 * Results link into the EXISTING session-replay surface rather than a new
 * viewer, so there is no new read infrastructure to trust.
 */
const POLL_MS = 3000;
const TERMINAL = ['completed', 'partial', 'failed', 'discarded'];

const PERSONA_LABEL = { earnest: 'earnest learner', boundary: 'boundary tester' };

function StudentLine({ courseId, student, onRetry, retrying, canRetry }) {
  const label = PERSONA_LABEL[student.persona] || student.persona;
  const done = student.status === 'completed';
  const failed = student.status === 'failed';
  return (
    <li className="border border-hairline-soft rounded-lg px-3 py-2 bg-surface-subtle">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-800">{student.displayName || label}</span>
        <span className="text-[11px] uppercase font-bold px-1.5 py-0.5 rounded bg-assistant-tint text-assistant">sim</span>
        <span className="text-xs text-ink-400">{label}</span>
        {student.attempts > 1 && (
          <span className="text-[11px] text-ink-400">attempt {student.attempts}</span>
        )}
        <span className={`text-xs ml-auto ${failed ? 'text-risk-critical' : done ? 'text-approve-strong' : 'text-ink-500'}`}>
          {failed ? `failed — ${student.error || 'unknown error'}` : student.stage || student.status}
        </span>
        {failed && canRetry && (
          // Re-runs only this student. The usual failure is a transient upstream
          // error on one persona, and re-running everything would throw away a
          // good transcript for the other one.
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetry(student.persona)}
            className="text-xs text-brand hover:underline font-medium disabled:opacity-50"
          >
            {retrying ? 'Restarting…' : 'Re-run this student'}
          </button>
        )}
      </div>
      {(done || failed) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <span>{student.turns} turns</span>
          {student.quizSkipped
            ? <span className="text-ink-300" title={student.quizSkippedReason || undefined}>
                quiz skipped{student.quizSkippedReason ? ` — ${student.quizSkippedReason}` : ''}
              </span>
            : student.scoredQuizPct == null
              ? <span className="text-ink-300">no quiz recorded</span>
              : (
              // Intent shown beside the platform score on purpose: the answer
              // key is LLM-generated and unverified, so a divergence here is
              // study material rather than a fact about the student.
              <span>
                scored {student.scoredQuizPct}%
                {student.intendedQuizCorrect != null && student.quizQuestionCount
                  ? ` · intended ${Math.round((student.intendedQuizCorrect / student.quizQuestionCount) * 100)}%`
                  : ''}
              </span>
            )}
          {student.probeOutcomes && Object.keys(student.probeOutcomes).length > 0 && (
            <span className="text-ink-400">
              probes: {Object.entries(student.probeOutcomes).map(([k, v]) => `${k}→${v.branch}`).join(', ')}
            </span>
          )}
          {/*
            Gated on userId, which is what the URL is actually built from. It
            used to be gated on sessionId, so a student record with a session
            but no userId — a re-run resets both, and they are written by two
            separate persistStudent calls — would render a link to
            /students/undefined. Guard the value you interpolate, not a
            neighbouring one.
          */}
          {student.userId ? (
            <Link
              to={`/instructor/courses/${courseId}/students/${student.userId}`}
              className="text-brand hover:underline font-medium ml-auto"
            >
              Read transcript
            </Link>
          ) : (
            <span className="text-ink-300 ml-auto" title="This student has no account on the course yet">
              transcript unavailable
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export default function RunSimulationCard({ courseId, topics = [], busy, onActiveChange }) {
  const [run, setRun] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [topicId, setTopicId] = useState('');
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(null);
  const [discardPreview, setDiscardPreview] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const pollRef = useRef(null);

  const published = topics.filter((t) => t.status === 'published');
  const canRun = published.length > 0;

  // Restore the active/most recent run so the card survives navigation.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await instructorApi.listSimulations(courseId);
        const latest = (res.data.runs || [])[0];
        if (alive && latest && latest.status !== 'discarded') setRun(latest);
      } catch { /* card simply stays in its default state */ }
    })();
    return () => { alive = false; };
  }, [courseId]);

  useEffect(() => {
    if (!published.length) return;
    setTopicId((cur) => cur || published[published.length - 1]._id);
  }, [published.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useCallback(async (runId) => {
    try {
      const res = await instructorApi.getSimulation(courseId, runId);
      setRun(res.data.run);
      if (TERMINAL.includes(res.data.run.status)) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (e) {
      setError(e.message);
    }
  }, [courseId]);

  useEffect(() => {
    if (run && !TERMINAL.includes(run.status) && !pollRef.current) {
      pollRef.current = setInterval(() => poll(run._id), POLL_MS);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [run, poll]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await instructorApi.startSimulation(courseId, topicId);
      setShowModal(false);
      await poll(res.data.runId);
    } catch (e) {
      setError(e.message || 'Could not start the simulation');
    } finally {
      setStarting(false);
    }
  };

  const retry = async (persona) => {
    setRetrying(persona);
    setError(null);
    try {
      await instructorApi.retrySimulationStudent(courseId, run._id, persona);
      await poll(run._id); // flips the card back into its polling state
    } catch (e) {
      setError(e.message || 'Could not re-run that student');
    } finally {
      setRetrying(null);
    }
  };

  // Dry run first: show the instructor the actual row counts before deleting.
  const openDiscard = async () => {
    setError(null);
    try {
      const res = await instructorApi.discardSimulation(courseId, run._id, { dryRun: true });
      setDiscardPreview(res.data);
    } catch (e) {
      setError(e.message || 'Could not check what discard would remove');
    }
  };

  const confirmDiscard = async () => {
    setDiscarding(true);
    try {
      await instructorApi.discardSimulation(courseId, run._id);
      setDiscardPreview(null);
      setRun(null);
    } catch (e) {
      setError(e.message || 'Could not discard the run');
    } finally {
      setDiscarding(false);
    }
  };

  const active = !!(run && !TERMINAL.includes(run.status));

  // Drives the instructions-card soft-lock banner on the parent page.
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  return (
    <section className="bg-surface border border-hairline rounded-2xl shadow-card p-5">
      <h2 className="text-base font-bold text-ink-900">Test your instructions</h2>
      <p className="text-xs text-ink-400 mt-1 mb-3">
        Two simulated students work through one module of a published topic with the AI tutor, so you can read
        the transcripts and judge whether it followed the instructions above.
      </p>

      {active && (
        <div className="border border-hairline-soft rounded-xl p-3 bg-surface-subtle">
          <p className="text-sm font-semibold text-ink-800 mb-1">
            Simulation running{run.topicTitle ? ` · ${run.topicTitle}` : ''}
          </p>
          <p className="text-xs text-ink-400 mb-2">Usually 3–6 minutes. You can leave this page; it keeps running.</p>
          <ul className="space-y-2">
            {(run.students || []).map((s) => (
              <StudentLine key={s.persona} courseId={courseId} student={s} />
            ))}
          </ul>
        </div>
      )}

      {run && TERMINAL.includes(run.status) && run.status !== 'discarded' && (
        <div className="border border-hairline-soft rounded-xl p-3 bg-surface-subtle">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-ink-800">
              {run.status === 'completed' ? 'Simulation complete' : run.status === 'partial' ? 'Simulation partly complete' : 'Simulation failed'}
            </span>
            {run.topicTitle && <span className="text-xs text-ink-400">{run.topicTitle}</span>}
            <button
              type="button"
              disabled={busy || !canRun}
              onClick={() => setShowModal(true)}
              className="ml-auto text-xs text-brand hover:underline font-medium disabled:opacity-50"
            >
              Run again
            </button>
            <button
              type="button"
              onClick={openDiscard}
              className="text-xs text-risk-critical hover:underline font-medium"
            >
              Discard
            </button>
          </div>
          <ul className="space-y-2">
            {(run.students || []).map((s) => (
              <StudentLine
                key={s.persona}
                courseId={courseId}
                student={s}
                onRetry={retry}
                retrying={retrying === s.persona}
                canRetry={!active}
              />
            ))}
          </ul>
          {run.error && <p className="mt-2 text-xs text-risk-critical">{run.error}</p>}
        </div>
      )}

      {discardPreview && (
        <div className="fixed inset-0 z-[80] bg-ink-900/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-2xl shadow-popover max-w-md w-full p-5">
            <h3 className="text-base font-bold text-ink-900 mb-1">Discard this simulation?</h3>
            <p className="text-sm text-ink-500 mb-3">
              This permanently deletes the simulated students and everything they produced. Your course,
              your instructions and your real students are untouched.
            </p>
            {/* Real counts from a dry run, so "discard" is not a word to be taken on trust. */}
            <ul className="text-sm text-ink-600 border border-hairline-soft rounded-lg divide-y divide-hairline-soft mb-4">
              {Object.entries(discardPreview.counts || {}).map(([coll, n]) => (
                <li key={coll} className="flex justify-between px-3 py-1.5">
                  <span className="capitalize">{coll.replace(/s$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                  <span className={n > 0 ? 'font-semibold text-ink-800' : 'text-ink-300'}>{n}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDiscardPreview(null)} className="text-sm px-3 py-1.5 rounded-lg text-ink-600 hover:bg-surface-hover">
                Keep it
              </button>
              <button
                type="button"
                disabled={discarding}
                onClick={confirmDiscard}
                className="text-sm px-3 py-1.5 rounded-lg bg-risk-critical text-white font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {discarding ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!active && (!run || run.status === 'discarded') && (
        <button
          type="button"
          disabled={busy || !canRun}
          title={canRun ? undefined : 'Publish a topic first — students can only enter published topics.'}
          onClick={() => setShowModal(true)}
          className="w-full text-center border border-dashed border-hairline-strong bg-surface-subtle text-ink-500 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors hover:border-brand hover:text-brand disabled:opacity-50 disabled:pointer-events-none"
        >
          Run simulation
        </button>
      )}

      {error && <p className="mt-2 text-xs text-risk-critical">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 z-[80] bg-ink-900/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-2xl shadow-popover max-w-md w-full p-5">
            <h3 className="text-base font-bold text-ink-900 mb-1">Run simulation</h3>
            <p className="text-sm text-ink-500 mb-3">
              Two simulated students will work through the first module of this topic with the AI tutor.
              Takes a few minutes. They are labelled SIM and are kept out of your class analytics.
            </p>
            <label className="block text-xs font-semibold text-ink-600 mb-1" htmlFor="sim-topic">Topic</label>
            <select
              id="sim-topic"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full text-sm border border-hairline rounded-lg px-2 py-1.5 bg-surface mb-4"
            >
              {published.map((t) => <option key={t._id} value={t._id}>{t.title}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="text-sm px-3 py-1.5 rounded-lg text-ink-600 hover:bg-surface-hover">
                Cancel
              </button>
              <button
                type="button"
                disabled={starting || !topicId}
                onClick={start}
                className="text-sm px-3 py-1.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-pressed disabled:opacity-50"
              >
                {starting ? 'Starting…' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

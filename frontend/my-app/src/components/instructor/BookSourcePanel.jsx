import React, { useCallback, useEffect, useState } from 'react';
import * as instructorApi from '../../lib/instructorApi';

/**
 * Book-grounded sources UI (BOOK_GROUNDED_COURSES_PLAN.md Phase 1, Section 6).
 *
 * - SourceIngestControls: per-source ingest status chip, Ingest/Retry action,
 *   and the ingestion report ("show receipts": pages read, chapters found,
 *   chunks indexed, caveats, anything skipped).
 * - BookCoveragePanel: chapter-to-module coverage with an explicit
 *   "Not covered" bucket and editable ch:N anchors (via the topic PATCH).
 *
 * Server-side the feature is flag-gated; an ingest attempt with the flag off
 * returns FEATURE_DISABLED and is surfaced as-is.
 */

const BOOK_EXT = /\.(pdf|epub|docx)$/i;

const STATUS_META = {
  pending: { label: 'Queued', cls: 'bg-surface-chip text-ink-500' },
  extracting: { label: 'Extracting text…', cls: 'bg-brand-tint text-brand' },
  structuring: { label: 'Detecting chapters…', cls: 'bg-brand-tint text-brand' },
  embedding: { label: 'Indexing…', cls: 'bg-brand-tint text-brand' },
  ready: { label: 'Book ready', cls: 'bg-approve-tint text-approve-strong' },
  failed: { label: 'Ingestion failed', cls: 'bg-risk-criticalTint text-risk-critical' },
};

export function SourceIngestControls({ courseId, source, busy, onChanged }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [showReport, setShowReport] = useState(false);

  if (!BOOK_EXT.test(source.originalName || '')) return null;

  const status = source.ingestStatus && source.ingestStatus !== 'none' ? source.ingestStatus : null;
  const meta = status ? STATUS_META[status] : null;
  const report = source.ingestReport;

  const runIngest = async () => {
    setRunning(true);
    setError(null);
    try {
      await instructorApi.ingestCourseSource(courseId, source._id);
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Ingestion failed');
      onChanged?.();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full mt-1.5 pl-6 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {meta && <span className={`px-1.5 py-0.5 rounded font-medium ${meta.cls}`}>{meta.label}</span>}
        {status === 'ready' && report && (
          <button type="button" onClick={() => setShowReport((v) => !v)} className="text-brand hover:underline font-medium">
            {showReport ? 'Hide ingestion report' : 'Ingestion report'}
          </button>
        )}
        {(!status || status === 'failed') && (
          <button
            type="button"
            disabled={busy || running}
            onClick={runIngest}
            className="text-brand hover:underline font-medium disabled:opacity-50"
          >
            {running ? 'Ingesting… (can take a minute)' : status === 'failed' ? 'Retry ingestion' : 'Ingest as book'}
          </button>
        )}
      </div>
      {status === 'failed' && source.ingestError && (
        <p className="mt-1 text-risk-critical">{source.ingestError}</p>
      )}
      {error && <p className="mt-1 text-risk-critical">{error}</p>}
      {showReport && report && (
        <div className="mt-2 border border-hairline-soft rounded-lg p-2.5 bg-surface space-y-1 text-ink-500">
          <p className="font-semibold text-ink-700">
            {report.pagesRead} pages read · {report.chaptersFound} chapters found ({report.structureSource === 'outline'
              ? 'from the book’s outline'
              : report.structureSource === 'headings'
                ? 'from heading detection'
                : 'no structure detected'}) · {report.chunksIndexed} chunks indexed
            {report.embeddedChunks > 0 ? ` · ${report.embeddedChunks} embedded` : ''}
          </p>
          <p>{(report.wordsExtracted || 0).toLocaleString()} words extracted.</p>
          {(report.skipped || []).map((s, i) => (
            <p key={`s${i}`} className="text-ink-400">Skipped: {s}</p>
          ))}
          {(report.caveats || []).map((c, i) => (
            <p key={`c${i}`} className="text-risk-high">⚠ {c}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function BookCoveragePanel({ courseId, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [savingTopic, setSavingTopic] = useState(null);
  const [topics, setTopics] = useState([]);

  const load = useCallback(async () => {
    try {
      const [cov, topicList] = await Promise.all([
        instructorApi.getBookCoverage(courseId),
        instructorApi.listTopics(courseId),
      ]);
      setData(cov.data);
      setTopics(topicList.data.topics || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load coverage');
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (error) return <p className="text-sm text-risk-critical">{error}</p>;
  if (!data) return <p className="text-sm text-ink-400">Loading coverage…</p>;
  if (!data.books?.length) return null;

  const editAnchor = async (topic, chIndex, add) => {
    const anchor = `ch:${chIndex}`;
    const current = topic.syllabusAnchors || [];
    const next = add
      ? [...current.filter((a) => a.toLowerCase() !== anchor), anchor]
      : current.filter((a) => a.trim().toLowerCase() !== anchor);
    if (!add && next.length === 0) return; // topics must keep at least one anchor
    setSavingTopic(topic._id);
    try {
      await instructorApi.updateTopic(courseId, topic._id, { syllabusAnchors: next });
      await load();
    } catch (e) {
      setError(e.message || 'Failed to update anchors');
    } finally {
      setSavingTopic(null);
    }
  };

  return (
    <div className="space-y-5">
      {data.planContextTruncated === true && (
        <p className="text-xs text-risk-high bg-risk-highTint border border-hairline-soft rounded-lg px-3 py-2">
          The current topic plan was generated from truncated source context. Re-generate after ingesting the book so the plan sees its full structure.
        </p>
      )}
      {data.books.map((book) => (
        <div key={book.sourceId}>
          <p className="text-sm font-semibold text-ink-800 mb-2">{book.name}</p>
          <ul className="space-y-1.5">
            {book.chapters.map((ch) => (
              <li key={ch.index} className="flex flex-wrap items-start gap-2 text-sm border border-hairline-soft rounded-lg px-3 py-2 bg-surface-subtle">
                <span className="font-medium text-ink-700 min-w-[180px] flex-1">
                  Ch {ch.index}: {ch.title}
                  {ch.pageStart != null && <span className="text-xs text-ink-300 ml-1.5">pp. {ch.pageStart}–{ch.pageEnd}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 flex-[2]">
                  {ch.coveredBy.length === 0 && <span className="text-xs text-ink-300 italic">—</span>}
                  {ch.coveredBy.map((t) => (
                    <span key={String(t.topicId)} className="inline-flex items-center gap-1 text-xs bg-surface-chip text-ink-600 rounded px-1.5 py-0.5">
                      {t.title}
                      <button
                        type="button"
                        title={`Remove ch:${ch.index} from this topic`}
                        disabled={savingTopic != null}
                        onClick={() => {
                          const full = topics.find((x) => String(x._id) === String(t.topicId));
                          if (full) editAnchor(full, ch.index, false);
                        }}
                        className="text-ink-300 hover:text-risk-critical"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    disabled={savingTopic != null}
                    onChange={(ev) => {
                      const full = topics.find((x) => String(x._id) === ev.target.value);
                      if (full) editAnchor(full, ch.index, true);
                      ev.target.value = '';
                    }}
                    className="text-xs border border-hairline rounded px-1 py-0.5 bg-surface text-ink-400"
                  >
                    <option value="">+ topic…</option>
                    {topics
                      .filter((t) => !ch.coveredBy.some((c) => String(c.topicId) === String(t._id)))
                      .map((t) => (
                        <option key={t._id} value={t._id}>{t.title}</option>
                      ))}
                  </select>
                </span>
              </li>
            ))}
          </ul>
          {book.notCovered.length > 0 && (
            <div className="mt-2.5 border border-hairline-soft rounded-lg px-3 py-2 bg-risk-highTint">
              <p className="text-xs font-semibold text-risk-high">
                Not covered: {book.notCovered.map((c) => `Ch ${c.index} (${c.title})`).join(' · ')}
              </p>
            </div>
          )}
          {book.topicsWithoutChapterAnchors.length > 0 && (
            <p className="mt-1.5 text-xs text-ink-400">
              Topics without chapter anchors: {book.topicsWithoutChapterAnchors.map((t) => t.title).join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

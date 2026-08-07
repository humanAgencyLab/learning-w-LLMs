/**
 * Book ingestion pipeline (BOOK_GROUNDED_COURSES_PLAN.md Sections 2-3, Phase 1).
 *
 * Stages: extract → structure → chunk+map → embed → ready. Each stage persists
 * its output before the next starts and is idempotent (re-running deletes the
 * stage's prior output first), so a killed run can be retried safely from the
 * same endpoint. Status lives on the source subdocument (ingestStatus) and is
 * polled via the existing course GET.
 *
 * Everything here is dark until USE_BOOK_SOURCES=true — the route refuses to
 * start ingestion with the flag off, and buildCourseContext takes the book-map
 * branch only when the flag is on AND a source is ready.
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Course = require('../models/Course');
const SourceChunk = require('../models/SourceChunk');
const { runAgent } = require('../agents/framework/baseAgent');
const logger = require('../utils/logger');

const SCAN_WORDS_PER_PAGE_THRESHOLD = 20;
const CHUNK_MIN_WORDS = 150;   // ≈200 tokens
const CHUNK_MAX_WORDS = 375;   // ≈500 tokens
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const VECTOR_INDEX_NAME = 'chunk_embedding_index';

class IngestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const estimateTokens = (text) => Math.ceil((text || '').split(/\s+/).filter(Boolean).length / 0.75);

// ---------------------------------------------------------------------------
// Extractors — each returns { pages: [{pageNumber, text}], outline, format }
// outline: [{ title, pageNumber, level }] or null when the format carries none.
// ---------------------------------------------------------------------------

async function extractPdf(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    pages.push({ pageNumber: i, text });
    page.cleanup();
  }

  // Bookmark outline → chapter signal (plan: the single best signal when present).
  let outline = null;
  try {
    const rawOutline = await doc.getOutline();
    if (Array.isArray(rawOutline) && rawOutline.length > 0) {
      outline = [];
      const walk = async (items, level) => {
        for (const item of items) {
          let pageNumber = null;
          try {
            let dest = item.dest;
            if (typeof dest === 'string') dest = await doc.getDestination(dest);
            if (Array.isArray(dest) && dest[0]) {
              pageNumber = (await doc.getPageIndex(dest[0])) + 1;
            }
          } catch { /* unresolvable destination — keep null */ }
          outline.push({ title: String(item.title || '').trim(), pageNumber, level });
          if (Array.isArray(item.items) && item.items.length && level < 2) {
            await walk(item.items, level + 1);
          }
        }
      };
      await walk(rawOutline, 0);
      outline = outline.filter((o) => o.title);
      if (outline.length === 0) outline = null;
    }
  } catch { outline = null; }

  await doc.destroy();
  return { pages, outline, format: 'pdf' };
}

function stripHtml(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractEpub(filePath) {
  const AdmZip = require('adm-zip');
  const { XMLParser } = require('fast-xml-parser');
  const zip = new AdmZip(filePath);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const read = (name) => {
    const entry = zip.getEntry(name);
    return entry ? zip.readAsText(entry) : null;
  };

  const container = parser.parse(read('META-INF/container.xml') || '');
  const opfPath = container?.container?.rootfiles?.rootfile?.['@_full-path']
    || container?.container?.rootfiles?.rootfile?.[0]?.['@_full-path'];
  if (!opfPath) throw new IngestError('EPUB_MALFORMED', 'EPUB is missing its OPF package descriptor.');
  const opfDir = path.posix.dirname(opfPath);
  const opf = parser.parse(read(opfPath) || '');
  const pkg = opf?.package || {};

  const manifestItems = [].concat(pkg?.manifest?.item || []);
  const byId = new Map(manifestItems.map((m) => [m['@_id'], m]));
  const spineRefs = [].concat(pkg?.spine?.itemref || []).map((r) => r['@_idref']);

  const pages = [];
  spineRefs.forEach((idref, i) => {
    const item = byId.get(idref);
    if (!item) return;
    const href = path.posix.join(opfDir === '.' ? '' : opfDir, item['@_href']);
    const html = read(href) || read(decodeURIComponent(href));
    if (html == null) return;
    pages.push({ pageNumber: i + 1, text: stripHtml(html) });
  });

  // TOC: EPUB3 nav or EPUB2 NCX → outline with spine positions.
  let outline = null;
  try {
    const navItem = manifestItems.find((m) => String(m['@_properties'] || '').includes('nav'));
    const ncxItem = manifestItems.find((m) => String(m['@_media-type']) === 'application/x-dtbncx+xml');
    const hrefToSpinePos = new Map();
    spineRefs.forEach((idref, i) => {
      const item = byId.get(idref);
      if (item) hrefToSpinePos.set(path.posix.basename(String(item['@_href']).split('#')[0]), i + 1);
    });
    const resolvePage = (href) => hrefToSpinePos.get(path.posix.basename(String(href || '').split('#')[0])) ?? null;

    if (navItem) {
      const navHtml = read(path.posix.join(opfDir === '.' ? '' : opfDir, navItem['@_href'])) || '';
      const matches = [...navHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      outline = matches.map((m) => ({ title: stripHtml(m[2]).slice(0, 200), pageNumber: resolvePage(m[1]), level: 0 }));
    } else if (ncxItem) {
      const ncx = parser.parse(read(path.posix.join(opfDir === '.' ? '' : opfDir, ncxItem['@_href'])) || '');
      const navPoints = [].concat(ncx?.ncx?.navMap?.navPoint || []);
      outline = navPoints.map((np) => ({
        title: String(np?.navLabel?.text || '').trim().slice(0, 200),
        pageNumber: resolvePage(np?.content?.['@_src']),
        level: 0,
      }));
    }
    if (outline) outline = outline.filter((o) => o.title);
    if (outline && outline.length === 0) outline = null;
  } catch { outline = null; }

  return { pages, outline, format: 'epub' };
}

async function extractDocx(filePath) {
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ path: filePath });
  // Headings become the outline; the document is paginated into pseudo-pages
  // (~500 words) since DOCX has no fixed pages.
  const outline = [];
  const withMarkers = html.replace(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, lvl, inner) => {
    outline.push({ title: stripHtml(inner).slice(0, 200), pageNumber: null, level: Number(lvl) - 1 });
    return `\n@@HEADING${outline.length - 1}@@\n${m}`;
  });
  const text = stripHtml(withMarkers);
  const pages = paginateText(text);
  for (const o of outline) {
    const idx = pages.findIndex((p) => p.text.includes(`@@HEADING${outline.indexOf(o)}@@`));
    o.pageNumber = idx >= 0 ? idx + 1 : null;
  }
  pages.forEach((p) => { p.text = p.text.replace(/@@HEADING\d+@@/g, '').trim(); });
  return { pages, outline: outline.length ? outline : null, format: 'docx' };
}

async function extractPlainText(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const outline = [];
  raw.split('\n').forEach((line) => {
    const t = line.trim();
    const md = t.match(/^(#{1,2})\s+(\S.*)$/);
    if (md) outline.push({ title: md[2].slice(0, 200), pageNumber: null, level: md[1].length - 1 });
  });
  const pages = paginateText(raw);
  for (const o of outline) {
    const idx = pages.findIndex((p) => p.text.includes(o.title));
    o.pageNumber = idx >= 0 ? idx + 1 : null;
  }
  return { pages, outline: outline.length ? outline : null, format: 'text' };
}

/** Split flowing text into ~500-word pseudo-pages at paragraph boundaries. */
function paginateText(text, wordsPerPage = 500) {
  const paras = String(text).split(/\n\s*\n/);
  const pages = [];
  let current = [];
  let words = 0;
  for (const p of paras) {
    const w = p.split(/\s+/).filter(Boolean).length;
    if (words + w > wordsPerPage && current.length) {
      pages.push({ pageNumber: pages.length + 1, text: current.join('\n\n').trim() });
      current = [];
      words = 0;
    }
    current.push(p);
    words += w;
  }
  if (current.length) pages.push({ pageNumber: pages.length + 1, text: current.join('\n\n').trim() });
  return pages.filter((p) => p.text);
}

async function extractByFormat(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimeType === 'application/pdf' || ext === '.pdf') return extractPdf(filePath);
  if (ext === '.epub' || mimeType === 'application/epub+zip') return extractEpub(filePath);
  if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocx(filePath);
  if (ext === '.txt' || ext === '.md' || mimeType === 'text/plain') return extractPlainText(filePath);
  throw new IngestError('UNSUPPORTED_FORMAT', `No book extractor for ${ext || mimeType}. Supported: PDF, EPUB, DOCX, TXT/MD.`);
}

// ---------------------------------------------------------------------------
// Scan detection — plan Section 2: fail loudly, no OCR in this phase.
// ---------------------------------------------------------------------------

function detectScannedPdf(pages, format) {
  if (format !== 'pdf' || pages.length < 5) return null;
  const totalWords = pages.reduce((s, p) => s + p.text.split(/\s+/).filter(Boolean).length, 0);
  const wordsPerPage = totalWords / pages.length;
  if (wordsPerPage < SCAN_WORDS_PER_PAGE_THRESHOLD) {
    return new IngestError(
      'SCANNED_PDF',
      `This PDF appears to be scanned images without a text layer (${Math.round(wordsPerPage)} readable words per page across ${pages.length} pages). ` +
      'Text cannot be extracted from scans yet. Upload a digital PDF or an EPUB of this book instead.'
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Chapter detection — outline → heading heuristics → single unit (with caveat).
// ---------------------------------------------------------------------------

const CHAPTER_HEADING_RE = /^\s*(?:chapter|part|unit)\s+(\d+|[IVXLCM]+)\b[.:\s-]*(.{0,120})/im;

function chaptersFromOutline(outline, pageTotal) {
  const top = outline.filter((o) => o.level === 0 && o.pageNumber != null);
  if (top.length < 2) return null;
  return top.map((o, i) => ({
    index: i + 1,
    title: o.title.slice(0, 200),
    pageStart: o.pageNumber,
    pageEnd: (top[i + 1]?.pageNumber ? top[i + 1].pageNumber - 1 : pageTotal),
    sections: outline
      .filter((s) => s.level === 1 && s.pageNumber != null && s.pageNumber >= o.pageNumber && (!top[i + 1] || s.pageNumber < top[i + 1].pageNumber))
      .map((s) => s.title.slice(0, 200))
      .slice(0, 20),
  }));
}

function chaptersFromHeadings(pages) {
  const hits = [];
  for (const p of pages) {
    const head = p.text.slice(0, 400);
    const m = head.match(CHAPTER_HEADING_RE);
    if (m) hits.push({ pageNumber: p.pageNumber, title: `${m[0].split(/[\n]/)[0].trim().slice(0, 200)}` });
  }
  if (hits.length < 2) return null;
  return hits.map((h, i) => ({
    index: i + 1,
    title: h.title,
    pageStart: h.pageNumber,
    pageEnd: hits[i + 1] ? hits[i + 1].pageNumber - 1 : pages[pages.length - 1].pageNumber,
    sections: [],
  }));
}

function detectChapters(pages, outline) {
  const pageTotal = pages.length ? pages[pages.length - 1].pageNumber : 0;
  if (outline) {
    const fromOutline = chaptersFromOutline(outline, pageTotal);
    if (fromOutline) return { chapters: fromOutline, structureSource: 'outline' };
  }
  const fromHeadings = chaptersFromHeadings(pages);
  if (fromHeadings) return { chapters: fromHeadings, structureSource: 'headings' };
  return {
    chapters: [{ index: 1, title: 'Full text', pageStart: pages[0]?.pageNumber ?? 1, pageEnd: pageTotal, sections: [] }],
    structureSource: 'none',
  };
}

// ---------------------------------------------------------------------------
// Chunking — structure-aware, never across a chapter boundary.
// ---------------------------------------------------------------------------

function lastSentence(text) {
  const m = String(text).trim().match(/[^.!?]*[.!?]\s*$/);
  return m ? m[0].trim() : '';
}

function chunkChapter(chapter, pages) {
  const inChapter = pages.filter((p) => p.pageNumber >= chapter.pageStart && p.pageNumber <= chapter.pageEnd);
  const paras = [];
  for (const p of inChapter) {
    for (const para of p.text.split(/\n\s*\n/)) {
      const words = para.split(/\s+/).filter(Boolean).length;
      if (words > 0) paras.push({ text: para.trim(), words, page: p.pageNumber });
    }
  }
  const chunks = [];
  let cur = [];
  let words = 0;
  let overlap = '';
  const flush = () => {
    if (!cur.length) return;
    const text = (overlap ? `${overlap} ` : '') + cur.map((c) => c.text).join('\n\n');
    chunks.push({
      text,
      pageStart: cur[0].page,
      pageEnd: cur[cur.length - 1].page,
      tokenCount: estimateTokens(text),
    });
    overlap = lastSentence(text); // one-sentence overlap into the next chunk
    cur = [];
    words = 0;
  };
  for (const p of paras) {
    if (words + p.words > CHUNK_MAX_WORDS && words >= CHUNK_MIN_WORDS) flush();
    cur.push(p);
    words += p.words;
  }
  flush();
  return chunks;
}

// ---------------------------------------------------------------------------
// Book map summaries — cheap-model map pass (plan Section 4a).
// ---------------------------------------------------------------------------

async function summarizeChapter(chapter, chapterText) {
  const excerpt = chapterText.slice(0, 6000);
  try {
    const out = await runAgent({
      taskName: 'material_summary',
      systemPrompt:
        'You summarize one textbook chapter for a course-planning system. Return JSON: {"summary": "<3-5 sentences, extractive, concrete topic names, no fluff>"}',
      userPrompt: `CHAPTER ${chapter.index}: "${chapter.title}"\nSECTIONS: ${chapter.sections.join('; ') || '(none listed)'}\n\nTEXT (excerpt):\n${excerpt}\n\nSummarize what this chapter teaches.`,
      maxTokens: 300,
      temperature: 0.2,
    });
    const s = String(out?.summary || '').trim();
    if (s) return { summary: s, fallback: false };
  } catch (e) {
    logger.warn({ err: e.message, chapter: chapter.index }, 'chapter summary failed; using extractive fallback');
  }
  const firstPara = chapterText.split(/\n\s*\n/).find((p) => p.split(/\s+/).length > 20) || chapterText.slice(0, 400);
  return { summary: firstPara.trim().slice(0, 600), fallback: true };
}

// ---------------------------------------------------------------------------
// Embeddings — optional stage; skipped loudly when no key is configured.
// ---------------------------------------------------------------------------

async function embedTexts(texts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const vectors = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new IngestError('EMBEDDING_FAILED', `Embeddings API ${resp.status}: ${body.slice(0, 200)}`);
    }
    const json = await resp.json();
    for (const d of json.data) vectors.push(d.embedding);
  }
  return vectors;
}

/** Best-effort Atlas Vector Search index creation; failure is a caveat, not fatal. */
async function ensureVectorIndex() {
  try {
    const coll = SourceChunk.collection;
    const existing = await coll.listSearchIndexes(VECTOR_INDEX_NAME).toArray().catch(() => []);
    if (existing.length > 0) return { ok: true, created: false };
    await coll.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMS, similarity: 'cosine' },
          { type: 'filter', path: 'courseId' },
          { type: 'filter', path: 'sourceId' },
        ],
      },
    });
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Stage machine
// ---------------------------------------------------------------------------

async function setSourceFields(courseId, sourceId, fields) {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) $set[`sources.$.${k}`] = v;
  await Course.updateOne({ _id: courseId, 'sources._id': sourceId }, { $set });
}

/**
 * Run the full ingestion pipeline for one source. Idempotent: re-running
 * replaces prior chunks and rebuilds the map. Designed to complete well inside
 * a Cloud Run request window for a 500-page digital book.
 */
async function runIngestion({ courseId, sourceId, filePath, mimeType, originalName }) {
  const startedAt = Date.now();
  const caveats = [];
  const skipped = [];
  try {
    // --- Stage: extract -----------------------------------------------------
    await setSourceFields(courseId, sourceId, { ingestStatus: 'extracting', ingestError: '' });
    const { pages, outline, format } = await extractByFormat(filePath, mimeType);
    const scanErr = detectScannedPdf(pages, format);
    if (scanErr) throw scanErr;
    const readablePages = pages.filter((p) => p.text.split(/\s+/).filter(Boolean).length >= 5);
    const unreadable = pages.length - readablePages.length;
    if (unreadable > 0) skipped.push(`${unreadable} page(s) had little or no extractable text (images, blank, or decorative pages).`);
    const wordsExtracted = pages.reduce((s, p) => s + p.text.split(/\s+/).filter(Boolean).length, 0);
    if (wordsExtracted === 0) throw new IngestError('NO_TEXT', 'No text could be extracted from this file.');
    const contentHash = crypto.createHash('sha256').update(pages.map((p) => p.text).join('\n')).digest('hex').slice(0, 32);

    // Duplicate detection (plan Section 7).
    const course = await Course.findById(courseId).select('sources').lean();
    const dup = (course?.sources || []).find((s) => s.contentHash === contentHash && String(s._id) !== String(sourceId));
    if (dup) caveats.push(`Content is identical to already-uploaded "${dup.originalName}" — consider removing one copy.`);

    // --- Stage: structure ---------------------------------------------------
    await setSourceFields(courseId, sourceId, { ingestStatus: 'structuring', pageCount: pages.length, contentHash });
    const { chapters, structureSource } = detectChapters(pages, outline);
    if (structureSource === 'none') {
      caveats.push('No chapter structure could be detected (no outline, no recognizable chapter headings). The book is treated as one unit; the outline will not follow chapters.');
    } else if (structureSource === 'headings') {
      caveats.push('No embedded outline/TOC found; chapters were detected from heading text and page boundaries may be approximate.');
    }

    // Glyph-soup heuristic for math-heavy content (plan Section 2 honesty).
    const glyphy = pages.filter((p) => {
      const junk = (p.text.match(/[^\x20-\x7E\nÀ-ɏ‐-―‘-”]/g) || []).length;
      return p.text.length > 200 && junk / p.text.length > 0.08;
    }).length;
    if (glyphy > pages.length * 0.05) {
      caveats.push(`${glyphy} page(s) contain dense non-text glyphs (likely equations or special notation) that extracted poorly.`);
    }

    // --- Stage: chunk + book map (persisted before embedding) ---------------
    await SourceChunk.deleteMany({ sourceId });
    const chunkDocs = [];
    const mapChapters = [];
    for (const ch of chapters) {
      const chapterChunks = chunkChapter(ch, pages);
      const chapterText = pages
        .filter((p) => p.pageNumber >= ch.pageStart && p.pageNumber <= ch.pageEnd)
        .map((p) => p.text)
        .join('\n\n');
      const { summary, fallback } = await summarizeChapter(ch, chapterText);
      if (fallback) caveats.push(`Chapter ${ch.index} summary fell back to raw text (summarizer unavailable).`);
      mapChapters.push({ index: ch.index, title: ch.title, pageStart: ch.pageStart, pageEnd: ch.pageEnd, sections: ch.sections, summary });
      for (const c of chapterChunks) {
        chunkDocs.push({
          courseId,
          sourceId,
          chapterIndex: ch.index,
          chapterTitle: ch.title,
          sectionTitle: '',
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          orderIndex: chunkDocs.length,
          tokenCount: c.tokenCount,
          text: c.text,
          embedding: null,
          embeddingModel: null,
        });
      }
    }
    for (let i = 0; i < chunkDocs.length; i += 200) {
      await SourceChunk.insertMany(chunkDocs.slice(i, i + 200));
    }
    const bookMap = { chapters: mapChapters, structureSource, generatedAt: new Date() };
    await setSourceFields(courseId, sourceId, { chapterCount: chapters.length, bookMap, chunkCount: chunkDocs.length });

    // --- Stage: embed (optional — loud skip when unconfigured) --------------
    let embeddedChunks = 0;
    if (process.env.OPENAI_API_KEY) {
      await setSourceFields(courseId, sourceId, { ingestStatus: 'embedding' });
      const stored = await SourceChunk.find({ sourceId }).sort({ orderIndex: 1 }).select('_id text').lean();
      const vectors = await embedTexts(stored.map((s) => s.text));
      if (vectors) {
        const ops = stored.map((s, i) => ({
          updateOne: { filter: { _id: s._id }, update: { $set: { embedding: vectors[i], embeddingModel: EMBEDDING_MODEL } } },
        }));
        for (let i = 0; i < ops.length; i += 200) await SourceChunk.bulkWrite(ops.slice(i, i + 200));
        embeddedChunks = vectors.length;
        const idx = await ensureVectorIndex();
        if (!idx.ok) caveats.push(`Atlas Vector Search index could not be created automatically (${idx.error}). Retrieval will need the index created manually — check the cluster tier.`);
      }
    } else {
      caveats.push('Embeddings skipped: no OPENAI_API_KEY configured. Chapter map and coverage work now; passage retrieval (Phase 2) needs a re-ingest once the key is set.');
    }

    // --- Ready --------------------------------------------------------------
    const report = {
      pagesRead: pages.length,
      wordsExtracted,
      chaptersFound: chapters.length,
      chunksIndexed: chunkDocs.length,
      embeddedChunks,
      structureSource,
      caveats,
      skipped,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date(),
    };
    await setSourceFields(courseId, sourceId, { ingestStatus: 'ready', ingestReport: report });
    logger.info({ courseId: String(courseId), sourceId: String(sourceId), ...report, caveats: caveats.length }, 'book ingestion complete');
    return { ok: true, report };
  } catch (e) {
    const message = e instanceof IngestError ? e.message : `Ingestion failed: ${e.message}`;
    await setSourceFields(courseId, sourceId, {
      ingestStatus: 'failed',
      ingestError: message,
      ingestReport: { caveats, skipped, failedAt: new Date(), durationMs: Date.now() - startedAt },
    }).catch(() => {});
    logger.error({ courseId: String(courseId), sourceId: String(sourceId), err: message, code: e.code }, 'book ingestion failed');
    return { ok: false, error: message, code: e.code || 'INGEST_FAILED' };
  }
}

module.exports = {
  runIngestion,
  ensureVectorIndex,
  // exported for unit tests
  detectScannedPdf,
  detectChapters,
  chunkChapter,
  paginateText,
  extractByFormat,
  IngestError,
  SCAN_WORDS_PER_PAGE_THRESHOLD,
  CHUNK_MIN_WORDS,
  CHUNK_MAX_WORDS,
};

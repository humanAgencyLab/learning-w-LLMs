/**
 * Book-grounded courses, Phase 1 unit tests (BOOK_GROUNDED_COURSES_PLAN.md).
 *
 * The rollback safety property leads: with USE_BOOK_SOURCES off (the
 * default), buildCourseContext must return BYTE-IDENTICAL output to the
 * pre-feature implementation, locked by a fixture captured from the original
 * code before any change landed.
 */
const fs = require('fs');
const path = require('path');

const {
  detectScannedPdf,
  detectChapters,
  chunkChapter,
  paginateText,
  IngestError,
  CHUNK_MAX_WORDS,
} = require('../services/bookIngestionService');
const { validateTopicPlanPayload } = require('../agents/validators/topicPlanValidator');

const BASELINE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/buildCourseContext.baseline.json'), 'utf8')
);

function baselineCases() {
  const big = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. '.repeat(1000);
  return {
    plainTwoSources: {
      globalInstructions: 'Teach with examples.',
      sources: [
        { originalName: 'syllabus.txt', filename: 's1', role: 'syllabus', extractedText: 'Week 1: Intro\nWeek 2: Loops' },
        { originalName: 'notes.md', filename: 's2', role: 'reference', extractedText: '# Extra notes\nSome reference text.' },
      ],
    },
    truncationCase: {
      globalInstructions: '',
      sources: [{ originalName: 'book.pdf', filename: 'b1', role: 'syllabus', extractedText: big }],
    },
    emptyCourse: { globalInstructions: '', sources: [] },
    emptyExtracted: {
      globalInstructions: 'x',
      sources: [{ originalName: 'scan.pdf', filename: 'sc1', role: 'syllabus', extractedText: '' }],
    },
    tightRoom: {
      globalInstructions: 'g'.repeat(55700),
      sources: [{ originalName: 'a.txt', filename: 'a1', role: 'syllabus', extractedText: 'abcdef '.repeat(100) }],
    },
  };
}

describe('rollback safety: flag off → byte-identical buildCourseContext', () => {
  const originalEnv = process.env.USE_BOOK_SOURCES;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.USE_BOOK_SOURCES;
    else process.env.USE_BOOK_SOURCES = originalEnv;
  });

  it.each(Object.keys(BASELINE))('case %s matches the pre-feature snapshot exactly', (name) => {
    delete process.env.USE_BOOK_SOURCES;
    const { buildCourseContext } = require('../services/courseContextService');
    const course = baselineCases()[name];
    expect(buildCourseContext(course, {})).toEqual(BASELINE[name].plain);
    expect(buildCourseContext(course, { extraInstructions: 'Focus on weeks.' })).toEqual(BASELINE[name].withExtra);
  });

  it('even a READY book source renders raw text with the flag off', () => {
    delete process.env.USE_BOOK_SOURCES;
    const { buildCourseContext } = require('../services/courseContextService');
    const course = {
      globalInstructions: '',
      sources: [{
        originalName: 'book.pdf', filename: 'b1', role: 'syllabus',
        extractedText: 'raw text here',
        ingestStatus: 'ready',
        bookMap: { chapters: [{ index: 1, title: 'One', pageStart: 1, pageEnd: 10, sections: [], summary: 'S' }] },
        pageCount: 10,
      }],
    };
    const out = buildCourseContext(course, {});
    expect(out.contextText).toContain('raw text here');
    expect(out.contextText).not.toContain('structure map');
  });

  it('with the flag ON a ready book emits its chapter map instead of raw text', () => {
    process.env.USE_BOOK_SOURCES = 'true';
    const { buildCourseContext } = require('../services/courseContextService');
    const course = {
      globalInstructions: '',
      sources: [{
        originalName: 'book.pdf', filename: 'b1', role: 'syllabus',
        extractedText: 'raw text here',
        ingestStatus: 'ready',
        bookMap: { chapters: [{ index: 1, title: 'Recursion', pageStart: 1, pageEnd: 30, sections: ['Base cases'], summary: 'Teaches recursion.' }] },
        pageCount: 30,
      }],
    };
    const out = buildCourseContext(course, {});
    expect(out.contextText).toContain('full-book structure map');
    expect(out.contextText).toContain('Chapter 1: Recursion (pp. 1-30)');
    expect(out.contextText).toContain('ch:<index>');
    expect(out.contextText).not.toContain('raw text here');
  });
});

describe('scan detection (fail loudly, no OCR)', () => {
  const pages = (n, wordsPer) =>
    Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, text: 'word '.repeat(wordsPer).trim() }));

  it('flags a 300-page PDF averaging under 20 words/page with an actionable message', () => {
    const err = detectScannedPdf(pages(300, 3), 'pdf');
    expect(err).toBeInstanceOf(IngestError);
    expect(err.code).toBe('SCANNED_PDF');
    expect(err.message).toMatch(/scanned images without a text layer/);
    expect(err.message).toMatch(/digital PDF or an EPUB/);
  });

  it('passes a digital book and ignores non-PDF formats and tiny files', () => {
    expect(detectScannedPdf(pages(300, 250), 'pdf')).toBeNull();
    expect(detectScannedPdf(pages(300, 3), 'epub')).toBeNull();
    expect(detectScannedPdf(pages(3, 0), 'pdf')).toBeNull(); // under 5 pages: not judged
  });
});

describe('chapter detection fallback layers', () => {
  const mkPages = (n) => Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, text: `Page ${i + 1} content here with words.` }));

  it('layer 1: uses the outline when present', () => {
    const outline = [
      { title: 'Introduction', pageNumber: 1, level: 0 },
      { title: 'Getting started', pageNumber: 2, level: 1 },
      { title: 'Recursion', pageNumber: 40, level: 0 },
    ];
    const { chapters, structureSource } = detectChapters(mkPages(100), outline);
    expect(structureSource).toBe('outline');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ index: 1, title: 'Introduction', pageStart: 1, pageEnd: 39 });
    expect(chapters[0].sections).toContain('Getting started');
    expect(chapters[1]).toMatchObject({ index: 2, pageStart: 40, pageEnd: 100 });
  });

  it('layer 2: falls back to "Chapter N" headings', () => {
    const pages = mkPages(60);
    pages[0].text = 'Chapter 1: Basics\nIntro text.';
    pages[29].text = 'Chapter 2: Advanced Topics\nMore text.';
    const { chapters, structureSource } = detectChapters(pages, null);
    expect(structureSource).toBe('headings');
    expect(chapters).toHaveLength(2);
    expect(chapters[1].pageStart).toBe(30);
  });

  it('layer 3: single unit when nothing is detectable', () => {
    const { chapters, structureSource } = detectChapters(mkPages(50), null);
    expect(structureSource).toBe('none');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ pageStart: 1, pageEnd: 50 });
  });
});

describe('chunking: structure-aware, page-tracked, boundary-respecting', () => {
  it('splits a long chapter at paragraph boundaries with page metadata and never exceeds the cap wildly', () => {
    const para = 'Sentence one is here. Sentence two follows with more words to say. '.repeat(4); // ~48 words
    const pages = Array.from({ length: 20 }, (_, i) => ({
      pageNumber: i + 1,
      text: `${para}\n\n${para}\n\n${para}`,
    }));
    const chapter = { index: 1, title: 'Big Chapter', pageStart: 1, pageEnd: 20, sections: [] };
    const chunks = chunkChapter(chapter, pages);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.pageStart).toBeGreaterThanOrEqual(1);
      expect(c.pageEnd).toBeLessThanOrEqual(20);
      expect(c.pageEnd).toBeGreaterThanOrEqual(c.pageStart);
      // one paragraph of tolerance over the max (chunks close at paragraph boundaries)
      expect(c.text.split(/\s+/).length).toBeLessThan(CHUNK_MAX_WORDS + 60);
    }
    // Chunks only contain this chapter's pages (never cross the boundary).
    const outside = chunks.filter((c) => c.pageStart < 1 || c.pageEnd > 20);
    expect(outside).toHaveLength(0);
  });

  it('paginateText makes ~500-word pseudo-pages at paragraph boundaries', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'word '.repeat(60)}`).join('\n\n');
    const pages = paginateText(text);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages[0].pageNumber).toBe(1);
  });
});

describe('ch:N anchor validation (repair-style, never payload-fatal)', () => {
  const OVERVIEW = 'This plan follows the book chapter by chapter across all its major units and topics in order.';
  const topic = (title, anchors) => ({
    title,
    objective: '',
    syllabusAnchors: anchors,
    modules: [{ moduleId: 'm1', title: 'M', description: '', points: 100, milestones: [{ text: 'a b' }, { text: 'c d' }] }],
  });

  it('keeps valid ch:N anchors, drops invalid ones with a warning', () => {
    const v = validateTopicPlanPayload(
      { syllabusCoverageOverview: OVERVIEW, topics: [topic('T1', ['ch:2', 'ch:99', 'Week 1 basics'])] },
      { bookChapters: [1, 2, 3] }
    );
    expect(v.valid).toBe(true);
    expect(v.topics[0].syllabusAnchors).toEqual(['ch:2', 'Week 1 basics']);
    expect(v.warnings.join(' ')).toMatch(/no chapter 99/);
  });

  it('never strips a topic to zero anchors', () => {
    const v = validateTopicPlanPayload(
      { syllabusCoverageOverview: OVERVIEW, topics: [topic('T1', ['ch:99'])] },
      { bookChapters: [1, 2] }
    );
    expect(v.valid).toBe(true);
    expect(v.topics[0].syllabusAnchors).toEqual(['ch:99']); // kept, with the no-anchor warning below
    expect(v.warnings.join(' ')).toMatch(/No topic carries a machine-usable chapter anchor/);
  });

  it('does nothing when bookChapters is not provided (non-book courses unchanged)', () => {
    const v = validateTopicPlanPayload(
      { syllabusCoverageOverview: OVERVIEW, topics: [topic('T1', ['ch:99'])] },
      {}
    );
    expect(v.valid).toBe(true);
    expect(v.warnings).toEqual([]);
  });
});

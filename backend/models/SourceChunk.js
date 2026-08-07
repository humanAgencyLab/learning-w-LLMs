const mongoose = require('mongoose');

/**
 * One retrieval unit of an ingested book-sized source
 * (BOOK_GROUNDED_COURSES_PLAN.md Section 3). Chunks live in their own
 * collection — never on the Course document — because a 500-page book's text
 * would blow Mongo's 16 MB document cap embedded there.
 *
 * `embedding` is null until the embedding stage has run (it requires an
 * external embeddings key); `embeddingModel` records which model produced the
 * vector so a future model change triggers re-indexing instead of silently
 * mixing vector spaces.
 */
const SourceChunkSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    chapterIndex: { type: Number, default: null },
    chapterTitle: { type: String, default: '' },
    sectionTitle: { type: String, default: '' },
    pageStart: { type: Number, default: null },
    pageEnd: { type: Number, default: null },
    /** Reading order across the whole book. */
    orderIndex: { type: Number, required: true },
    tokenCount: { type: Number, default: 0 },
    text: { type: String, required: true },
    embedding: { type: [Number], default: null },
    embeddingModel: { type: String, default: null },
  },
  { timestamps: true }
);

SourceChunkSchema.index({ courseId: 1, sourceId: 1, orderIndex: 1 });
SourceChunkSchema.index({ sourceId: 1, chapterIndex: 1 });

module.exports = mongoose.model('SourceChunk', SourceChunkSchema);

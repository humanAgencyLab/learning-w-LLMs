/**
 * Runtime compatibility shims. Required FIRST, before anything else loads.
 *
 * `globalThis.crypto` (the WebCrypto global) only became available in Node 19.
 * The production image is node:18-alpine, so any dependency that reaches for
 * the bare global — LangGraph's id generation does, transitively — throws
 * `ReferenceError: crypto is not defined`.
 *
 * That failure was invisible: runStudyGraph catches it and falls back to the
 * legacy path, so with USE_MULTI_AGENT=true every turn silently ran on legacy
 * and looked correct. It was only caught by comparing graphPath metadata after
 * the flag flip. Local dev never reproduced it (Node 20+ has the global).
 *
 * The shim is a no-op on Node 19+.
 */
if (!globalThis.crypto) {
  // eslint-disable-next-line global-require
  globalThis.crypto = require('node:crypto').webcrypto;
}

module.exports = {};

/**
 * Node 18 compatibility shim.
 *
 * The production image is node:18-alpine, where `globalThis.crypto` does not
 * exist (it landed in Node 19). LangGraph reaches for the bare global, so with
 * USE_MULTI_AGENT=true every graph run threw `ReferenceError: crypto is not
 * defined`, was swallowed by runStudyGraph's catch, and fell back to legacy —
 * a silent no-op flag. Local dev runs Node 20+ and never reproduced it.
 *
 * These tests simulate the Node 18 condition rather than trusting the local
 * runtime, and assert the shim loads before anything that could need it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHIM = path.join(ROOT, 'lib/nodeCompat.js');

describe('globalThis.crypto shim', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
  });

  it('restores globalThis.crypto when the runtime does not provide it (the Node 18 case)', () => {
    // Simulate Node 18: remove the global entirely.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    expect(globalThis.crypto).toBeUndefined();

    delete require.cache[require.resolve('../lib/nodeCompat')];
    require('../lib/nodeCompat');

    expect(globalThis.crypto).toBeDefined();
    expect(typeof globalThis.crypto.getRandomValues).toBe('function');
    // uuid v6/v4 generation — what LangGraph's id layer needs — must work.
    const buf = new Uint8Array(16);
    expect(() => globalThis.crypto.getRandomValues(buf)).not.toThrow();
    expect(buf.some((b) => b !== 0)).toBe(true);
  });

  it('is a no-op when the runtime already provides crypto (Node 19+)', () => {
    const before = globalThis.crypto;
    delete require.cache[require.resolve('../lib/nodeCompat')];
    require('../lib/nodeCompat');
    expect(globalThis.crypto).toBe(before);
  });

  it('is required as the FIRST statement of both entrypoints', () => {
    for (const entry of ['server.js', 'app.js']) {
      const src = fs.readFileSync(path.join(ROOT, entry), 'utf8');
      const firstRequire = src.indexOf('require(');
      expect(src.slice(0, firstRequire + 40)).toMatch(/require\('\.\/lib\/nodeCompat'\)/);
    }
  });

  it('the shim itself exists and guards before assigning', () => {
    const src = fs.readFileSync(SHIM, 'utf8');
    expect(src).toMatch(/if \(!globalThis\.crypto\)/);
    expect(src).toMatch(/require\('node:crypto'\)\.webcrypto/);
  });
});

describe('the graph compiles and runs with no global crypto present', () => {
  it('compileStudyGraph does not throw once the shim has loaded', () => {
    require('../lib/nodeCompat');
    const { compileStudyGraph } = require('../agents/graph/studyGraph');
    expect(() => compileStudyGraph()).not.toThrow();
  });
});

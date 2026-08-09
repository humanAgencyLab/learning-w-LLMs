/**
 * Production-dependency guard.
 *
 * The image is built with `npm ci --omit=dev` (Dockerfile), so anything the
 * server requires at runtime MUST be in `dependencies`, not `devDependencies`.
 * This test exists because that invariant was broken in a way nothing else
 * caught: installing a fixture tool with `--save-dev` silently MOVED pdfkit
 * out of `dependencies`, and since local runs have dev deps installed, the
 * whole suite stayed green. It only surfaced as a Cloud Run container that
 * exited on startup with MODULE_NOT_FOUND from certificateService.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

// Directories that ship in the image and load at runtime.
const RUNTIME_DIRS = ['routes', 'services', 'agents', 'models', 'prompts', 'middleware', 'utils', 'lib', 'validation', 'config'];
const RUNTIME_FILES = ['app.js', 'server.js'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(p, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

function runtimeFiles() {
  const files = RUNTIME_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
  for (const d of RUNTIME_DIRS) walk(path.join(ROOT, d), files);
  return files;
}

/** Bare module specifiers from require(...) and dynamic import(...). */
function externalDeps(src) {
  const out = new Set();
  const patterns = [/require\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      // Scope package name: @scope/name or name (ignore deep paths).
      const parts = spec.split('/');
      out.add(spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]);
    }
  }
  return out;
}

const BUILTINS = new Set([
  'fs', 'path', 'crypto', 'http', 'https', 'url', 'util', 'os', 'events', 'stream',
  'zlib', 'child_process', 'buffer', 'querystring', 'assert', 'net', 'tls', 'dns',
  'timers', 'string_decoder', 'worker_threads', 'perf_hooks', 'readline', 'vm',
]);

describe('every runtime import resolves from production dependencies', () => {
  const files = runtimeFiles();
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const devDeps = new Set(Object.keys(pkg.devDependencies || {}));

  it('scans a non-trivial number of runtime files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('never imports a package that only exists in devDependencies', () => {
    const violations = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const dep of externalDeps(src)) {
        if (BUILTINS.has(dep) || deps.has(dep)) continue;
        if (devDeps.has(dep)) {
          violations.push(`${path.relative(ROOT, file)} requires "${dep}" — devDependencies only, absent under npm ci --omit=dev`);
        } else {
          violations.push(`${path.relative(ROOT, file)} requires "${dep}" — not declared in package.json at all`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('pdfkit specifically is a production dependency (the regression that broke a deploy)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'services/certificateService.js'), 'utf8');
    expect(src).toMatch(/require\('pdfkit'\)/);
    expect(deps.has('pdfkit')).toBe(true);
    expect(devDeps.has('pdfkit')).toBe(false);
  });

  it('the book-ingestion dependencies are production deps too', () => {
    for (const dep of ['pdfjs-dist', 'mammoth', 'adm-zip', 'fast-xml-parser']) {
      expect(deps.has(dep)).toBe(true);
    }
  });

  it('the lockfile does not mark any runtime dependency dev-only', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const devOnly = [...deps].filter((d) => lock.packages?.[`node_modules/${d}`]?.dev === true);
    expect(devOnly).toEqual([]);
  });
});

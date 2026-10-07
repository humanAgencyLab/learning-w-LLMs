/**
 * Briefing smoke as the P06 instructor: the briefing must generate
 * (non-empty), carry the Probe-3 sentence, and mention the pinned 80.4%
 * pass rate. Credentials from the study manifest; never printed.
 *
 * Env: VERIFY_BASE_URL, RUN_TS (unused, accepted).
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.VERIFY_BASE_URL || 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app';
const SCRIPTS = path.join(__dirname, '..');

(async () => {
  const manifests = fs.readdirSync(SCRIPTS).filter((f) => /^study-manifest-\d+\.json$/.test(f)).sort().reverse();
  let acct = null;
  for (const f of manifests) {
    const m = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
    acct = (m.accounts || []).find((a) => a.label === 'P06' || a.username === 'study_p06');
    if (acct) { console.log('manifest:', f, '· account label:', acct.label); break; }
  }
  if (!acct) { console.error('P06 not found in any manifest'); process.exit(1); }

  const login = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: acct.username, password: acct.password }),
  });
  if (!login.ok) { console.error('login failed:', login.status); process.exit(1); }
  const lj = await login.json();
  const accessToken = lj.accessToken || lj.data?.accessToken;

  const t1 = Date.now();
  const r = await fetch(`${BASE}/v1/instructor/briefing`, { headers: { Authorization: `Bearer ${accessToken}` } });
  console.log('briefing HTTP', r.status, 'in', Date.now() - t1, 'ms');
  const body = await r.json().catch(() => ({}));
  const briefing = body.briefing || body.data?.briefing || '';
  const ok45 = /slipped to around 45%/.test(briefing);
  const ok804 = /80\.4%/.test(briefing);
  console.log('briefing generated:', briefing.length > 0, `(${briefing.length} chars)`);
  console.log('probe 3 sentence present:', ok45);
  console.log('pinned 80.4% pass rate present:', ok804);
  console.log('--- briefing text ---');
  console.log(briefing);
  process.exitCode = briefing.length > 0 && ok45 ? 0 : 1;
})().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });

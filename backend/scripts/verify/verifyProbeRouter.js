/**
 * Live verification of the Probe-2 two-path router.
 *
 * FIRES matrix (canned reply, zero tool calls) on the P06 clone;
 * NOT-FIRES matrix (real agent) on the clone; classifier-only paraphrases
 * (no regex cue) prove the classifier path; a non-clone zz course proves
 * scoping. Cleans up all chat residue; zz account torn down.
 *
 * Env: VERIFY_BASE_URL, MONGODB_URI, SIGNUP_SECRET, RUN_TS.
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const BASE = `${process.env.VERIFY_BASE_URL || 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app'}/v1`;
const TS = process.env.RUN_TS || String(Date.now());
const SCRIPTS = path.join(__dirname, '..');
const SNIPPET = 'Methods has the lowest first-attempt pass rate at 63%';
const INSTR = { username: `zz_probe_i_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Probe' };

const api = async (method, p, body, token) => {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, data: json?.data ?? json, raw: text };
};
const must = async (...a) => { const r = await api(...a); if (!r.ok) throw new Error(`${a[0]} ${a[1]} -> ${r.status}: ${r.raw.slice(0, 200)}`); return r.data; };

const CHECKS = [];
const check = (name, ok, detail = '') => { CHECKS.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const hr = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

const FIRES = [
  'what to reteach',
  'what should I reteach next week',
  'what did the class struggle with most',
  'which topic has the lowest pass rate',
  "what's the hardest milestone",
  'where are students struggling most',
  'what should I focus on',
  'what to retech', // typo
  // classifier-only paraphrases: no fast-path cue on purpose
  'the class seems shaky somewhere - which area needs another pass?',
  'which unit needs re-explaining, based on how the class has been doing?',
  'what content should I go over again with the class?',
];
const NOT_FIRES = [
  'which 3 students are most at risk',
  'how is Nia Singh doing',
  'summarize this week',
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  let zzCourseId = null;
  try {
    hr('SETUP — P06 clone credentials');
    const manifests = fs.readdirSync(SCRIPTS).filter((f) => /^study-manifest-.*\.json$/.test(f))
      .map((f) => ({ f, m: fs.statSync(path.join(SCRIPTS, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    let p06 = null;
    for (const { f } of manifests) { const m = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')); p06 = (m.accounts || []).find((a) => a.label === 'P06'); if (p06) break; }
    if (!p06) throw new Error('P06 not in manifest');
    const pTok = (await must('POST', '/auth/login', { username: p06.username, password: p06.password })).accessToken;

    hr('FIRES — canned reply, zero tool calls (P06 clone, course scope)');
    for (const q of FIRES) {
      const r = await must('POST', '/instructor/chat', { message: q, courseId: p06.courseId }, pTok);
      const canned = String(r.reply || '').includes(SNIPPET) && (r.toolCalls || []).length === 0;
      check(`fires: "${q}"`, canned, canned ? 'canned, 0 tools' : `real agent, ${(r.toolCalls || []).length} tools`);
    }

    hr('NOT-FIRES — real agent (P06 clone, course scope)');
    for (const q of NOT_FIRES) {
      const r = await must('POST', '/instructor/chat', { message: q, courseId: p06.courseId }, pTok);
      const real = !String(r.reply || '').includes(SNIPPET);
      check(`does NOT fire: "${q}"`, real, real ? `real agent, ${(r.toolCalls || []).length} tools` : 'HIJACKED');
    }

    hr('SCOPE-LESS request (floating panel path) still fires');
    const r0 = await must('POST', '/instructor/chat', { message: 'what to reteach' }, pTok);
    check('scope-less "what to reteach" fires', String(r0.reply || '').includes(SNIPPET) && (r0.toolCalls || []).length === 0);

    hr('NON-CLONE COURSE — never fires');
    await must('POST', '/auth/signup', { ...INSTR, role: 'instructor', instructorSignupSecret: process.env.SIGNUP_SECRET });
    const zTok = (await must('POST', '/auth/login', { username: INSTR.username, password: INSTR.password })).accessToken;
    const zc = await must('POST', '/instructor/courses', { title: `ZZ Probe ${TS}`, description: 'throwaway' }, zTok);
    zzCourseId = String(zc._id || zc.course?._id);
    const rz = await must('POST', '/instructor/chat', { message: 'what to reteach', courseId: zzCourseId }, zTok);
    check('non-clone "what to reteach" does NOT fire', !String(rz.reply || '').includes(SNIPPET), `reply starts: ${String(rz.reply || '').slice(0, 60)}`);

    hr('CLEANUP');
    await api('DELETE', `/instructor/chat?courseId=${p06.courseId}`, null, pTok);
    await api('DELETE', '/instructor/chat', null, pTok);
    const after = await must('GET', `/instructor/chat?courseId=${p06.courseId}`, null, pTok);
    const after2 = await must('GET', '/instructor/chat', null, pTok);
    check('P06 assistant chat cleared (both scopes)', (after.messages || []).length === 0 && (after2.messages || []).length === 0);
  } finally {
    try {
      if (zzCourseId) {
        const cid = new mongoose.Types.ObjectId(zzCourseId);
        for (const coll of ['instructorchatsessions', 'coursetopics', 'enrollments', 'sessions']) await db.collection(coll).deleteMany({ courseId: cid });
        await db.collection('courses').deleteMany({ _id: cid });
      }
      const du = await db.collection('users').deleteMany({ username: { $regex: '^zz_probe_' } });
      console.log(`  teardown: removed ${du.deletedCount} zz user(s); residue courses: ${await db.collection('courses').countDocuments({ title: `ZZ Probe ${TS}` })}`);
    } catch (e) { console.error('teardown error:', e.message); }
    hr('SUMMARY');
    const fails = CHECKS.filter((c) => !c.ok);
    console.log(`  ${CHECKS.length - fails.length}/${CHECKS.length} checks passed`);
    if (fails.length) fails.forEach((f) => console.log(`   - FAILED: ${f.name}`));
    await mongoose.disconnect();
    process.exitCode = fails.length ? 1 : 0;
  }
})().catch(async (e) => { console.error('FATAL:', e.message); try { await mongoose.disconnect(); } catch {}; process.exit(2); });

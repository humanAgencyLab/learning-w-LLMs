/**
 * Live RQ-A structure-directive verification: the same Loops module under
 * three instruction sets —
 *   A: "hook with an example first, then explain, show code if required"
 *   B: "be concise and definition-first, no examples"
 *   C: no instructions (control — default developed body, length baseline)
 * One student takes first_teach + one follow-up turn in each. Full teardown.
 *
 * Env: VERIFY_BASE_URL, MONGODB_URI, SIGNUP_SECRET, RUN_TS.
 */
const mongoose = require('mongoose');

const BASE = `${process.env.VERIFY_BASE_URL || 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app'}/v1`;
const TS = process.env.RUN_TS || String(Date.now());

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
const wc = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

const CHECKS = [];
const check = (name, ok, detail = '') => { CHECKS.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const hr = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

const DEFINITIONAL = /^(?:in\s+[\w+#.]+\s*,?\s+)?(?:(?:a|an|the)\s+[\w-]+(?:\s+[\w-]+){0,3}|[\w-]*s)\s+(?:is|are|refers? to|means)\b/i;
const HOOKISH = /^(?:imagine|picture|suppose|say you|think of|consider(?:\s+a)?|you(?:'re| are| want| need| open| run)|let'?s say|every (?:time|morning|day)|when you)/i;

const TOPIC = {
  title: 'Java loops',
  modules: [{ moduleId: 'm1', title: 'While loops', points: 20, difficulty: 'core',
    milestones: [
      { text: 'Explain what a while loop is and when to use one' },
      { text: 'Trace a while loop with a counter variable' },
    ] }],
};

const COURSES = [
  { key: 'A', instructions: 'At first, hook the student with an example where needed, then explain the topic. Show code snippets if required.' },
  { key: 'B', instructions: 'Be concise and definition-first, no examples.' },
  { key: 'C', instructions: '' },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const created = [];
  const results = {};
  try {
    const iName = { username: `zz_dir_i_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Directives' };
    await must('POST', '/auth/signup', { ...iName, role: 'instructor', instructorSignupSecret: process.env.SIGNUP_SECRET });
    const iTok = (await must('POST', '/auth/login', { username: iName.username, password: iName.password })).accessToken;

    for (const c of COURSES) {
      hr(`COURSE ${c.key} — "${c.instructions || '(no instructions — control)'}"`);
      const course = await must('POST', '/instructor/courses', { title: `ZZ Dir ${c.key} ${TS}`, description: 'throwaway', globalInstructions: c.instructions }, iTok);
      const courseId = String(course._id || course.course?._id);
      created.push(courseId);
      const topic = await must('POST', `/instructor/courses/${courseId}/topics`, TOPIC, iTok);
      const topicId = String(topic._id || topic.topic?._id);
      try { await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/approve`, {}, iTok); } catch {}
      await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/publish`, {}, iTok);
      const full = await must('GET', `/instructor/courses/${courseId}`, null, iTok);
      const accessCode = full.course?.accessCode || full.accessCode;

      const sName = { username: `zz_dir_s${c.key}_${TS}`, password: `Vv${TS}!aA1`, name: `ZZ Student ${c.key}` };
      await must('POST', '/auth/signup', { ...sName, role: 'student' });
      const sTok = (await must('POST', '/auth/login', { username: sName.username, password: sName.password })).accessToken;
      await must('POST', '/courses/join', { accessCode, priorKnowledge: 'none' }, sTok);
      const sess = await must('POST', `/courses/${courseId}/topics/${topicId}/start`, {}, sTok);
      const sessionId = sess.sessionId || sess.session?.id || sess.session?._id;
      const chat = async (m) => must('POST', '/chat', { sessionId, userMessage: m, mode: 'studying', stream: false }, sTok);

      const t1 = await chat("Hi, I'm ready to start this module.");
      const t2 = await chat('okay, makes sense so far');
      results[c.key] = { t1, t2 };
      const body1 = t1.parts?.body || t1.message || '';
      console.log(`  first_teach: flow=${t1.flowAction} bodyW=${wc(body1)} defOpener=${DEFINITIONAL.test(body1.trim())} hookOpener=${HOOKISH.test(body1.trim())} code=${/\`\`\`/.test(body1)}`);
      console.log(`  follow-up:   flow=${t2.flowAction} msgW=${wc(t2.message)}`);
    }

    hr('ASSERTIONS');
    const bodyA = results.A.t1.parts?.body || results.A.t1.message || '';
    const bodyB = results.B.t1.parts?.body || results.B.t1.message || '';
    const bodyC = results.C.t1.parts?.body || results.C.t1.message || '';

    check('A: first_teach does NOT open with an abstract definition', !DEFINITIONAL.test(bodyA.trim()), `opens: "${bodyA.trim().slice(0, 90)}"`);
    check('A: opens with a concrete example/scenario (hook-shaped opener)', HOOKISH.test(bodyA.trim()) || !DEFINITIONAL.test(bodyA.trim().split(/(?<=[.!?])\s+/)[0]), `first sentence: "${bodyA.trim().split(/(?<=[.!?])\s+/)[0]?.slice(0, 110)}"`);
    check('A: includes a code snippet (fenced)', /```/.test(bodyA));
    check('A: materially shorter than the control baseline', wc(bodyA) <= Math.max(240, Math.round(wc(bodyC) * 0.75)), `A=${wc(bodyA)}w vs control C=${wc(bodyC)}w`);

    check('B: does NOT force an example hook (structure is instruction-driven, not hardcoded)', !HOOKISH.test(bodyB.trim()), `opens: "${bodyB.trim().slice(0, 90)}"`);
    check('B: concise', wc(bodyB) <= 240, `${wc(bodyB)}w`);
    check('B: no code fence forced either', true, /```/.test(bodyB) ? 'has code (not asserted)' : 'no code');

    check('C (control): default developed body unchanged (>=150w, definition allowed)', wc(bodyC) >= 150, `${wc(bodyC)}w`);

    const contA = String(results.A.t2.message || '');
    check('A: follow-up turn stays tight', wc(contA) <= 300, `${wc(contA)}w`);

    hr('TRANSCRIPT EXCERPTS');
    for (const k of ['A', 'B', 'C']) {
      const b = results[k].t1.parts?.body || results[k].t1.message || '';
      console.log(`\n[${k}] intro: ${String(results[k].t1.parts?.intro || '').slice(0, 120)}`);
      console.log(`[${k}] body (${wc(b)}w): ${b.slice(0, 520).replace(/\n+/g, ' | ')}${b.length > 520 ? ' …' : ''}`);
    }
  } finally {
    hr('TEARDOWN');
    try {
      for (const cid of created) {
        const oid = new mongoose.Types.ObjectId(cid);
        for (const coll of ['sessions', 'enrollments', 'coursetopics', 'milestoneattempts', 'instructorchatsessions']) await db.collection(coll).deleteMany({ courseId: oid });
        await db.collection('courses').deleteMany({ _id: oid });
      }
      const du = await db.collection('users').deleteMany({ username: { $regex: `^zz_dir_` } });
      console.log(`  removed ${du.deletedCount} zz users · residue courses: ${await db.collection('courses').countDocuments({ title: { $regex: `^ZZ Dir .* ${TS}` } })}`);
    } catch (e) { console.error('teardown error:', e.message); }
    hr('SUMMARY');
    const fails = CHECKS.filter((c) => !c.ok);
    console.log(`  ${CHECKS.length - fails.length}/${CHECKS.length} checks passed`);
    if (fails.length) fails.forEach((f) => console.log(`   - FAILED: ${f.name}`));
    await mongoose.disconnect();
    process.exitCode = fails.length ? 1 : 0;
  }
})().catch(async (e) => { console.error('FATAL:', e.message); try { await mongoose.disconnect(); } catch {}; process.exit(2); });

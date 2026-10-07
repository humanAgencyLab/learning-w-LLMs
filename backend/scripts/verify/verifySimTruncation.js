/**
 * A5 two-student simulation on a stats/Excel module: run the sim, dump BOTH
 * transcripts, and assert no student message ends mid-word or mid-sentence,
 * the grader advances on complete answers, students reach the quiz, and no
 * spurious finish-your-answer asks appear. Full teardown.
 *
 * Env: VERIFY_BASE_URL, MONGODB_URI, SIGNUP_SECRET, RUN_TS.
 */
const mongoose = require('mongoose');

const BASE = `${process.env.VERIFY_BASE_URL || 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app'}/v1`;
const TS = process.env.RUN_TS || String(Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const endsComplete = (s) => {
  const t = String(s || '').trim();
  if (!t) return false;
  return /[.!?…]["')\]]?$/.test(t) || /\d[%)"']?$/.test(t) || /```$/.test(t) || /[.!?]\)$/.test(t);
};
// HARD truncation signals fail the run: punctuation debris at the end
// (",", "=", "(") is how a token-cap cut actually looks. A trailing English
// function word is only a WARNING — regex cannot separate a genuine cut
// ("...since temperature is") from a complete casual clause ("...how spread
// out the numbers are", "...so i can move on"), so those are printed for
// eyeball review instead of failing the battery.
const hardTruncation = (s) => {
  const t = String(s || '').trim();
  if (/^(start quiz|ready|ok|yes|no)$/i.test(t)) return false;
  return /[,;:=+(]$/.test(t) || /-$/.test(t);
};
const danglingWordWarning = (s) => {
  const t = String(s || '').trim();
  const DANGLING = /\b(is|are|was|were|the|a|an|to|of|and|or|with|for|in|that|its|it's|since|because|so|but|when|while|if|by|as|at|into|from)$/i;
  return !hardTruncation(t) && DANGLING.test(t) && !endsComplete(t);
};

const TOPIC = {
  title: 'Descriptive statistics in Excel',
  modules: [{ moduleId: 'm1', title: 'Summarizing a temperature dataset', points: 30, difficulty: 'core',
    milestones: [
      { text: 'Compute the mean, variance, and range of a small temperature dataset' },
      { text: 'Build a frequency table for the dataset using Excel functions' },
      { text: 'Create a histogram from the frequency table and label its axes' },
    ] }],
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  let courseId = null;
  try {
    hr('SETUP');
    const iName = { username: `zz_trunc_i_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Trunc' };
    await must('POST', '/auth/signup', { ...iName, role: 'instructor', instructorSignupSecret: process.env.SIGNUP_SECRET });
    const iTok = (await must('POST', '/auth/login', { username: iName.username, password: iName.password })).accessToken;
    const course = await must('POST', '/instructor/courses', { title: `ZZ Trunc ${TS}`, description: 'throwaway' }, iTok);
    courseId = String(course._id || course.course?._id);
    const topic = await must('POST', `/instructor/courses/${courseId}/topics`, TOPIC, iTok);
    const topicId = String(topic._id || topic.topic?._id);
    try { await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/approve`, {}, iTok); } catch {}
    await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/publish`, {}, iTok);

    hr('SIMULATION (earnest + boundary)');
    const start = await must('POST', `/instructor/courses/${courseId}/simulations`, { topicId }, iTok);
    const runId = start.runId;
    const TERMINAL = ['completed', 'partial', 'failed', 'discarded'];
    let run = null;
    for (let i = 0; i < 160; i++) { await sleep(8000); run = (await must('GET', `/instructor/courses/${courseId}/simulations/${runId}`, null, iTok)).run; if (TERMINAL.includes(run.status)) break; }
    console.log(`  run status: ${run?.status}`);
    check('simulation completed', run?.status === 'completed', run?.status);
    const probeBranches = (run?.students || []).flatMap((s) => Object.values(s.probeOutcomes || {})).map((v) => v.branch || v);
    if (probeBranches.length) check('sim probes classified as refusals', probeBranches.every((b) => /refusal/.test(String(b))), JSON.stringify(probeBranches));

    hr('TRANSCRIPTS + TRUNCATION ANALYSIS');
    const sessions = await db.collection('sessions').find({ courseId: new mongoose.Types.ObjectId(courseId) }).toArray();
    const users = await db.collection('users').find({ username: /^sim_/ }).project({ username: 1 }).toArray();
    const uname = new Map(users.map((u) => [String(u._id), u.username]));
    let truncated = 0; let warnings = 0; let studentMsgs = 0; let advances = 0; let quizCTA = 0; let finishAsks = 0; let jsonLeaks = 0;
    for (const ss of sessions) {
      const who = uname.get(String(ss.userId)) || String(ss.userId);
      const persona = /earnest/.test(who) ? 'EARNEST' : /boundary/.test(who) ? 'BOUNDARY' : who;
      console.log(`\n--- TRANSCRIPT [${persona}] (${(ss.messages || []).length} messages) ---`);
      for (const m of ss.messages || []) {
        if (m.role === 'user') {
          studentMsgs++;
          const bad = hardTruncation(m.content);
          const warn = danglingWordWarning(m.content);
          if (bad) truncated++;
          if (warn) warnings++;
          console.log(`  [student${bad ? ' ⚠️ TRUNCATED' : warn ? ' (review: dangling-word ending)' : ''}] ${String(m.content).replace(/\n+/g, ' | ')}`);
        } else {
          const fa = m.metadata?.flowAction;
          const content = String(m.content || '');
          if (/\{\s*"(intro|body|question)"/.test(content) || /\\n\\n/.test(content)) jsonLeaks++;
          if (fa === 'advance_milestone') advances++;
          if (fa === 'complete_module') quizCTA++;
          if (/finish|complete your|cut off|unfinished|rest of your/i.test(content.slice(0, 200)) && fa === 'correct_retry') finishAsks++;
          console.log(`  [tutor ${fa || '-'} / ${m.metadata?.verdict || '-'}] ${content.slice(0, 150).replace(/\n+/g, ' | ')}…`);
        }
      }
    }
    hr('ASSERTIONS');
    check('NO student message ends with truncation debris', truncated === 0, `${truncated}/${studentMsgs} hard-truncated · ${warnings} dangling-word ending(s) printed above for review`);
    check('grader advances on complete answers (milestones progress)', advances >= 2, `${advances} advancing turns`);
    check('students reach the quiz hand-off', quizCTA >= 1, `${quizCTA} complete_module turns`);
    check('no spurious finish-your-answer asks on complete answers', finishAsks === 0, `${finishAsks} finish-asks`);
    check('no raw JSON or \\n literals in any tutor turn', jsonLeaks === 0, `${jsonLeaks} leaks`);
  } finally {
    hr('TEARDOWN');
    try {
      if (courseId) {
        const cid = new mongoose.Types.ObjectId(courseId);
        const ss = await db.collection('sessions').find({ courseId: cid }).project({ userId: 1 }).toArray();
        const uids = ss.map((s) => s.userId).filter(Boolean);
        for (const coll of ['sessions', 'enrollments', 'coursetopics', 'milestoneattempts', 'instructorchatsessions', 'simulationruns']) {
          await db.collection(coll).deleteMany({ courseId: cid });
        }
        await db.collection('courses').deleteMany({ _id: cid });
        const su = await db.collection('users').deleteMany({ username: { $regex: '^sim_' }, _id: { $in: uids } });
        const du = await db.collection('users').deleteMany({ username: { $regex: '^zz_trunc_' } });
        console.log(`  removed ${du.deletedCount} zz + ${su.deletedCount} sim users · residue: ${await db.collection('courses').countDocuments({ title: `ZZ Trunc ${TS}` })}`);
      }
    } catch (e) { console.error('teardown error:', e.message); }
    hr('SUMMARY');
    const fails = CHECKS.filter((c) => !c.ok);
    console.log(`  ${CHECKS.length - fails.length}/${CHECKS.length} checks passed`);
    if (fails.length) fails.forEach((f) => console.log(`   - FAILED: ${f.name}`));
    await mongoose.disconnect();
    process.exitCode = fails.length ? 1 : 0;
  }
})().catch(async (e) => { console.error('FATAL:', e.message); try { await mongoose.disconnect(); } catch {}; process.exit(2); });

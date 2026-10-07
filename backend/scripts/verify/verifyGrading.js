/**
 * Live grading verification against a DEPLOYED runtime:
 *  1. broken infinite-loop for-conversion  -> correct_retry naming the defect, no advance
 *  2. correct conversion                    -> correct, advances
 *  3. truncated answer                      -> asked to finish, no advance
 *  4. stylistically different valid answer  -> accepted, advances (no false retry)
 * Full teardown.
 *
 * Env: VERIFY_BASE_URL (default: live iitl service), MONGODB_URI,
 * SIGNUP_SECRET, RUN_TS.
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

const CHECKS = [];
const check = (name, ok, detail = '') => { CHECKS.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const hr = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

const TOPIC = {
  title: 'C loops: sentinel and count control',
  modules: [{ moduleId: 'm1', title: 'Loop conversions', points: 30, difficulty: 'core',
    milestones: [
      { text: 'Convert a sentinel-controlled while loop that reads integers until a negative number into an equivalent for loop' },
      { text: 'Describe the adjustments needed when converting a sentinel-controlled while loop into a for loop' },
      { text: 'Convert a count-controlled while loop into an equivalent for loop' },
    ] }],
};

const BROKEN = 'Here is my for loop version. The condition checks for non-negative numbers:\n\nfor (scanf("%d",&n), n>=0; /*nothing*/; scanf("%d",&n)) { sum += n; }';
const CORRECT = 'for (scanf("%d", &n); n >= 0; scanf("%d", &n)) { sum += n; }\n\nThe first read happens in the initializer, the sentinel test n >= 0 sits in the condition so it guards every iteration, and the next read happens in the update clause.';
const TRUNCATED = 'The adjustments needed are: first, move the initial read into the initializer section; second, put the sentinel test into the condition slot so it guards every iteration; and third, collect the unknow';
const FULL_M1 = 'The adjustments are: move the first read into the initializer, put the sentinel test (whatever form it takes - n >= 0 for numbers or ch != \'q\' for characters) into the condition slot so it is checked before every iteration, and move the next read into the update expression. That way there is no duplicated read before the loop and the loop stops exactly when the sentinel arrives.';
const STYLISTIC = 'my style is a bit cramped but here goes:\n\nfor(scanf("%d",&num); num>=0; scanf("%d",&num)){ total+=num; }\n\nsame behavior as the while version - first read in the init, the num>=0 sentinel test guards each pass, next read in the update. i just prefer one-liners and the name num over n.';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  let courseId = null;
  try {
    hr('SETUP');
    const iName = { username: `zz_grade_i_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Grade' };
    const sName = { username: `zz_grade_s_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Grade Student' };
    await must('POST', '/auth/signup', { ...iName, role: 'instructor', instructorSignupSecret: process.env.SIGNUP_SECRET });
    const iTok = (await must('POST', '/auth/login', { username: iName.username, password: iName.password })).accessToken;
    const course = await must('POST', '/instructor/courses', { title: `ZZ Grade ${TS}`, description: 'throwaway' }, iTok);
    courseId = String(course._id || course.course?._id);
    const topic = await must('POST', `/instructor/courses/${courseId}/topics`, TOPIC, iTok);
    const topicId = String(topic._id || topic.topic?._id);
    try { await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/approve`, {}, iTok); } catch {}
    await must('POST', `/instructor/courses/${courseId}/topics/${topicId}/publish`, {}, iTok);
    const full = await must('GET', `/instructor/courses/${courseId}`, null, iTok);
    await must('POST', '/auth/signup', { ...sName, role: 'student' });
    const sTok = (await must('POST', '/auth/login', { username: sName.username, password: sName.password })).accessToken;
    await must('POST', '/courses/join', { accessCode: full.course?.accessCode || full.accessCode, priorKnowledge: 'some' }, sTok);
    const sess = await must('POST', `/courses/${courseId}/topics/${topicId}/start`, {}, sTok);
    const sessionId = sess.sessionId || sess.session?.id || sess.session?._id;
    const chat = async (m) => must('POST', '/chat', { sessionId, userMessage: m, mode: 'studying', stream: false }, sTok);
    const idx = (r) => r.currentMilestoneIndex ?? r.meta?.currentMilestoneIndex;

    const t0 = await chat("Hi, I'm ready to start this module.");
    console.log(`  [start] flow=${t0.flowAction} msIdx=${idx(t0)}`);
    console.log(`  [question] ${String(t0.parts?.question || '').slice(0, 160)}`);

    hr('1. BROKEN infinite-loop conversion');
    const t1 = await chat(BROKEN);
    console.log(`  flow=${t1.flowAction} verdict=${t1.verdict} msIdx=${idx(t1)}`);
    console.log(`  reply: ${String(t1.message).slice(0, 420).replace(/\n+/g, ' | ')}`);
    check('broken answer -> correct_retry (NOT advance/complete)', t1.flowAction === 'correct_retry' && idx(t1) === 0, `flow=${t1.flowAction} msIdx=${idx(t1)}`);
    check('verdict=incorrect on the broken answer', t1.verdict === 'incorrect', t1.verdict);
    const names = /condition/i.test(t1.message) && /(empty|never (?:ends|terminates|stops)|infinite|initializer|runs? (?:only )?once|move)/i.test(t1.message);
    check('names the specific defect (empty condition / misplaced n>=0)', names, names ? 'named' : 'defect NOT named');
    check('does not hand over the full corrected loop', !/for\s*\(\s*scanf[^;]*;\s*n\s*>=\s*0\s*;\s*scanf/.test(t1.message), 'no corrected code');

    hr('2. CORRECT conversion');
    const t2 = await chat(CORRECT);
    console.log(`  flow=${t2.flowAction} verdict=${t2.verdict} msIdx=${idx(t2)}`);
    check('correct answer -> advances', (t2.flowAction === 'advance_milestone' || t2.flowAction === 'complete_module') && idx(t2) === 1, `flow=${t2.flowAction} msIdx=${idx(t2)}`);
    check('verdict=correct on the correct answer', t2.verdict === 'correct', t2.verdict);

    hr('3. TRUNCATED answer on the adjustments question');
    const t3 = await chat(TRUNCATED);
    console.log(`  flow=${t3.flowAction} verdict=${t3.verdict} msIdx=${idx(t3)}`);
    console.log(`  reply: ${String(t3.message).slice(0, 320).replace(/\n+/g, ' | ')}`);
    check('truncated answer NOT marked complete (no advance)', idx(t3) === 1 && t3.flowAction !== 'advance_milestone' && t3.flowAction !== 'complete_module', `flow=${t3.flowAction} msIdx=${idx(t3)}`);
    check('asks the student to finish it', /(finish|complete|cut off|unfinished|incomplete|rest of|trail|full (?:answer|list)|continue your)/i.test(t3.message), 'asked to finish');

    const t4 = await chat(FULL_M1);
    console.log(`  [full answer] flow=${t4.flowAction} verdict=${t4.verdict} msIdx=${idx(t4)}`);
    check('completed answer then advances', (t4.flowAction === 'advance_milestone' || t4.flowAction === 'complete_module') && idx(t4) >= 2, `flow=${t4.flowAction} msIdx=${idx(t4)}`);

    hr('4. STYLISTICALLY DIFFERENT valid answer (fresh session, same first question)');
    const s2Name = { username: `zz_grade_s2_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Grade Student 2' };
    await must('POST', '/auth/signup', { ...s2Name, role: 'student' });
    const s2Tok = (await must('POST', '/auth/login', { username: s2Name.username, password: s2Name.password })).accessToken;
    await must('POST', '/courses/join', { accessCode: full.course?.accessCode || full.accessCode, priorKnowledge: 'some' }, s2Tok);
    const sess2 = await must('POST', `/courses/${courseId}/topics/${topicId}/start`, {}, s2Tok);
    const sessionId2 = sess2.sessionId || sess2.session?.id || sess2.session?._id;
    const chat2 = async (m) => must('POST', '/chat', { sessionId: sessionId2, userMessage: m, mode: 'studying', stream: false }, s2Tok);
    const t5a = await chat2("Hi, I'm ready to start this module.");
    console.log(`  [question] ${String(t5a.parts?.question || '').slice(0, 150)}`);
    const t5 = await chat2(STYLISTIC);
    console.log(`  flow=${t5.flowAction} verdict=${t5.verdict} msIdx=${idx(t5)}`);
    console.log(`  reply: ${String(t5.message).slice(0, 240).replace(/\n+/g, ' | ')}`);
    check('valid stylistic variant accepted (no false correct_retry)', t5.flowAction === 'advance_milestone' || t5.flowAction === 'complete_module', `flow=${t5.flowAction}`);
    check('verdict=correct on the stylistic variant', t5.verdict === 'correct', t5.verdict);
  } finally {
    hr('TEARDOWN');
    try {
      if (courseId) {
        const cid = new mongoose.Types.ObjectId(courseId);
        for (const coll of ['sessions', 'enrollments', 'coursetopics', 'milestoneattempts', 'instructorchatsessions']) await db.collection(coll).deleteMany({ courseId: cid });
        await db.collection('courses').deleteMany({ _id: cid });
      }
      const du = await db.collection('users').deleteMany({ username: { $regex: `^zz_grade_` } });
      console.log(`  removed ${du.deletedCount} zz users · residue: ${await db.collection('courses').countDocuments({ title: `ZZ Grade ${TS}` })}`);
    } catch (e) { console.error('teardown error:', e.message); }
    hr('SUMMARY');
    const fails = CHECKS.filter((c) => !c.ok);
    console.log(`  ${CHECKS.length - fails.length}/${CHECKS.length} checks passed`);
    if (fails.length) fails.forEach((f) => console.log(`   - FAILED: ${f.name}`));
    await mongoose.disconnect();
    process.exitCode = fails.length ? 1 : 0;
  }
})().catch(async (e) => { console.error('FATAL:', e.message); try { await mongoose.disconnect(); } catch {}; process.exit(2); });

/**
 * Large-syllabus topic generation: a 15-unit, ~4k-word enumerated syllabus
 * must either generate a full plan or return the clean retriable 503 —
 * never a dropped connection. A small 4-unit control proves small plans are
 * unaffected. Full teardown.
 *
 * Env: VERIFY_BASE_URL, MONGODB_URI, SIGNUP_SECRET, RUN_TS.
 */
const mongoose = require('mongoose');

const BASE = `${process.env.VERIFY_BASE_URL || 'https://studyassist-iitl-backend-nkaulzxkdq-uc.a.run.app'}/v1`;
const TS = process.env.RUN_TS || String(Date.now());

const CHECKS = [];
const check = (name, ok, detail = '') => { CHECKS.push({ name, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const hr = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

const jsonReq = async (method, p, body, token) => {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, data: json?.data ?? json, json, raw: text };
};
const must = async (...a) => { const r = await jsonReq(...a); if (!r.ok) throw new Error(`${a[0]} ${a[1]} -> ${r.status}: ${r.raw.slice(0, 200)}`); return r.data; };

const UNITS = [
  ['Introduction to Data Structures and Algorithm Analysis', 'asymptotic notation, Big-O, Omega, Theta, best/worst/average case, empirical timing, recurrence basics'],
  ['Arrays, Dynamic Arrays, and Amortized Analysis', 'contiguous storage, resizing policies, amortized O(1) append, cache behavior, bounds checking'],
  ['Singly and Doubly Linked Lists', 'node design, head/tail insertion, deletion, sentinel nodes, iterator invalidation, trade-offs vs arrays'],
  ['Stacks and Their Applications', 'LIFO, array vs linked implementation, balanced symbols, infix to postfix, call-stack simulation'],
  ['Queues, Deques, and Circular Buffers', 'FIFO, ring buffer arithmetic, double-ended operations, producer/consumer scenarios'],
  ['Recursion and Backtracking', 'base and recursive cases, call tree tracing, memoization, subset and permutation generation, N-Queens'],
  ['Sorting: Elementary Algorithms', 'selection, insertion, bubble sort, stability, in-place vs not, adaptive behavior on nearly sorted input'],
  ['Sorting: Divide and Conquer', 'merge sort, quicksort partitioning, pivot strategies, average vs worst case, randomized quicksort'],
  ['Binary Search and Ordered Collections', 'iterative and recursive binary search, lower/upper bound variants, off-by-one pitfalls'],
  ['Binary Trees and Traversals', 'node structure, height and depth, preorder/inorder/postorder, level-order with a queue, expression trees'],
  ['Binary Search Trees and Balancing (AVL)', 'BST invariant, insert/delete cases, rotations, balance factors, worst-case height guarantees'],
  ['Heaps and Priority Queues', 'complete binary trees in arrays, sift-up/sift-down, heapify in O(n), heap sort, top-k problems'],
  ['Hashing and Hash Tables', 'hash functions, load factor, chaining, open addressing with linear and quadratic probing, rehashing'],
  ['Graphs: Representations and Traversals', 'adjacency list vs matrix, BFS, DFS, connected components, topological sort, cycle detection'],
  ['Shortest Paths and Minimum Spanning Trees', "Dijkstra with a priority queue, Bellman-Ford, Prim, Kruskal with union-find"],
];

function syllabus(n) {
  const head = `Data Structures and Algorithms\nFall 2026 · 3 credits\n\nCourse description: This course develops the ability to select, implement, and analyze the fundamental data structures used in software systems. Students implement each structure in Java, analyze its performance with asymptotic notation, and apply it to realistic problems. Weekly laboratories pair with the lecture units below. Grading: labs 25%, assignments 25%, midterm 20%, final 30%.\n\nCOURSE SCHEDULE (one unit per week)\n\n`;
  const units = UNITS.slice(0, n).map(([title, topics], i) => {
    const wk = i + 1;
    return `Unit ${wk}: ${title}\nTopics: ${topics}.\nLearning outcomes: by the end of this unit students will be able to (a) explain the structure and invariants involved, (b) implement the operations in Java with correct edge-case handling, (c) analyze the time and space complexity of each operation, and (d) choose this structure appropriately in a design problem. Readings: textbook chapter ${wk} and the posted lecture notes. Laboratory ${wk}: a guided implementation exercise with unit tests provided; students extend the implementation and measure performance empirically on provided datasets. Assessment: weekly quiz covering the learning outcomes above, plus a programming assignment due at the end of the following week. Common pitfalls discussed in class include off-by-one errors, aliasing, and mismatched invariants after mutation. Discussion questions: How does this structure behave under adversarial input, and what guarantees survive? Where in a real system (a text editor, a scheduler, a network router, a database index) would you reach for it first, and what would you reach for instead when memory is tight? Students should come prepared to sketch the invariant on a whiteboard and to walk through one insertion and one deletion by hand before writing any code. Extended practice: implement the structure twice — once with a minimal interface and once generically — and compare the measured constant factors; write a short reflection on which edge cases your tests missed the first time and how you found them. Recommended supplementary material: the visualization applets linked on the course page, the relevant chapter exercises (odd-numbered), and the archived lecture recording from the previous offering.\n`;
  }).join('\n');
  const tail = `\nPolicies: late work loses 10% per day up to three days. Attendance is expected; laboratory participation is graded. The final examination is cumulative and emphasizes analysis and design questions over memorization.\n`;
  return head + units + tail;
}

async function uploadSyllabus(courseId, text, token) {
  const form = new FormData();
  form.append('files', new Blob([text], { type: 'text/plain' }), 'syllabus.txt');
  form.append('roles', JSON.stringify(['syllabus']));
  const res = await fetch(`${BASE}/instructor/courses/${courseId}/sources`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) throw new Error(`upload -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function generate(courseId, token, label) {
  const t0 = Date.now();
  let outcome;
  try {
    const r = await jsonReq('POST', `/instructor/courses/${courseId}/topic-plan/generate`, { message: 'Generate the initial topic plan with one topic per unit.' }, token);
    const ms = Date.now() - t0;
    outcome = { kind: r.ok ? 'completed' : (r.json?.code === 'GENERATION_TIMEOUT' ? 'clean-timeout' : 'error'), status: r.status, ms, code: r.json?.code, error: r.json?.error };
  } catch (e) {
    outcome = { kind: 'NETWORK-FAILURE', ms: Date.now() - t0, error: e.message };
  }
  console.log(`  [${label}] ${outcome.kind} · HTTP ${outcome.status ?? '-'} · ${outcome.ms}ms · code=${outcome.code ?? '-'}${outcome.error ? ` · ${String(outcome.error).slice(0, 100)}` : ''}`);
  return outcome;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const created = [];
  try {
    hr('SETUP');
    const iName = { username: `zz_syl_i_${TS}`, password: `Vv${TS}!aA1`, name: 'ZZ Syllabus' };
    await fetch(`${BASE}/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...iName, role: 'instructor', instructorSignupSecret: process.env.SIGNUP_SECRET }) });
    const tok = (await must('POST', '/auth/login', { username: iName.username, password: iName.password })).accessToken;

    const big = syllabus(15);
    const small = syllabus(4);
    console.log(`  large syllabus: ${big.split(/\s+/).length} words, ${big.length} chars, 15 enumerated units`);

    const mk = async (title, text) => {
      const c = await must('POST', '/instructor/courses', { title, description: 'throwaway' }, tok);
      const id = String(c._id || c.course?._id);
      created.push(id);
      await uploadSyllabus(id, text, tok);
      return id;
    };
    const bigId = await mk(`ZZ Syl Large ${TS}`, big);
    const smallId = await mk(`ZZ Syl Small ${TS}`, small);

    hr('SMALL SYLLABUS (control)');
    const s = await generate(smallId, tok, 'small');
    check('small: completes', s.kind === 'completed', `${s.ms}ms`);

    hr('LARGE ENUMERATED SYLLABUS');
    const l = await generate(bigId, tok, 'large');
    check('large: NOT a network failure / dropped connection', l.kind !== 'NETWORK-FAILURE', l.kind);
    check('large: completed OR clean retriable 503 GENERATION_TIMEOUT', l.kind === 'completed' || l.kind === 'clean-timeout', `${l.kind} in ${l.ms}ms`);
    if (l.kind === 'completed') {
      const n = await db.collection('coursetopics').countDocuments({ courseId: new mongoose.Types.ObjectId(bigId) });
      check('large: plan covers the enumerated units (>=14 topics)', n >= 14, `${n} topics created`);
    }
    if (l.kind === 'clean-timeout') {
      check('large: 503 body carries the retriable message', l.status === 503 && /taking longer than expected/.test(l.error || ''), l.error);
    }
  } finally {
    hr('TEARDOWN');
    try {
      for (const cid of created) {
        const oid = new mongoose.Types.ObjectId(cid);
        for (const coll of ['coursetopics', 'sessions', 'enrollments', 'instructorchatsessions']) await db.collection(coll).deleteMany({ courseId: oid });
        await db.collection('courses').deleteMany({ _id: oid });
      }
      const du = await db.collection('users').deleteMany({ username: { $regex: '^zz_syl_' } });
      console.log(`  removed ${du.deletedCount} zz user(s) · residue courses: ${await db.collection('courses').countDocuments({ title: { $regex: `^ZZ Syl .* ${TS}` } })}`);
    } catch (e) { console.error('teardown error:', e.message); }
    hr('SUMMARY');
    const fails = CHECKS.filter((c) => !c.ok);
    console.log(`  ${CHECKS.length - fails.length}/${CHECKS.length} checks passed`);
    if (fails.length) fails.forEach((f) => console.log(`   - FAILED: ${f.name}`));
    await mongoose.disconnect();
    process.exitCode = fails.length ? 1 : 0;
  }
})().catch(async (e) => { console.error('FATAL:', e.message); try { await mongoose.disconnect(); } catch {}; process.exit(2); });

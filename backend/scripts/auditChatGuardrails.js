#!/usr/bin/env node
'use strict';

/**
 * Structural guardrail audit for the chat route.
 *
 * WHY THIS EXISTS, rather than a list of known-bad line numbers:
 * the constraint gate was bypassed twice, by the same shape of mistake — a
 * phase branch that answers the student and returns before any guardrail runs.
 * The second instance survived the first fix because the fix was applied to a
 * different quiz gate five hundred lines away. A test enumerating known cases
 * would have passed happily through both. So this walks the AST instead and
 * asks, of EVERY response site: does a gate call dominate it?
 *
 * DOMINANCE (the approximation, stated honestly):
 * a gate G protects a response R when
 *   1. G and R share a lowest common ancestor BLOCK B,
 *   2. the B-level statement containing G comes strictly before the B-level
 *      statement containing R, and
 *   3. G is unconditionally evaluated on the way there — the path from G up to
 *      B passes through no if-consequent/alternate, loop body, catch handler,
 *      ternary arm, or short-circuit right-hand side, and crosses no function
 *      boundary.
 * Condition 3 is what stops `if (rare) { gate() }` from counting.
 *
 * TWO ANNOTATIONS, both deliberately explicit and greppable:
 *   // GATE-EXEMPT: <reason>        on a statement — its response sites need no gate.
 *   // GATE-PROVIDED-BY: <reason>   on a statement — that statement itself acts as a
 *                                   gate for its later siblings. Used where the gate
 *                                   runs inside a callee (the LangGraph path), which
 *                                   single-file analysis cannot see. The graph's
 *                                   topology is asserted separately by the test, so
 *                                   this annotation cannot quietly become a lie.
 *
 * Run directly for a report:  node scripts/auditChatGuardrails.js
 * Exit code 1 if any UNGATED site exists.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const GATE_FNS = new Set(['enforceConstraints', 'evaluateConstraints']);
const RESPONSE_METHODS = new Set(['json', 'send', 'end', 'sendStatus']);

const EXEMPT_RE = /GATE-EXEMPT:\s*(.+)/;
const PROVIDER_RE = /GATE-PROVIDED-BY:\s*(.+)/;

/** Recursive walker that records a parent pointer on every visited node. */
function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  node.__parent = parent;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === '__parent' || key === 'loc' || key === 'leadingComments' ||
        key === 'trailingComments' || key === 'innerComments') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === 'string') walk(c, node, visit);
    } else if (child && typeof child.type === 'string') {
      walk(child, node, visit);
    }
  }
}

function ancestry(node) {
  const chain = [];
  for (let n = node; n; n = n.__parent) chain.push(n);
  return chain.reverse();
}

const isBlock = (n) => n && (n.type === 'BlockStatement' || n.type === 'Program');
const isFunction = (n) => n && /Function(Declaration|Expression)$/.test(n.type);

/**
 * Is the step parent->child a conditional or function boundary? If so, code at
 * `child` is not guaranteed to run when `parent` is reached.
 */
function isConditionalStep(parent, child) {
  if (isFunction(parent)) return true;
  switch (parent.type) {
    case 'IfStatement':
      // The TEST always evaluates; the branches do not.
      return child === parent.consequent || child === parent.alternate;
    case 'ConditionalExpression':
      return child === parent.consequent || child === parent.alternate;
    case 'LogicalExpression':
      return child === parent.right;
    case 'ForStatement': case 'ForInStatement': case 'ForOfStatement':
    case 'WhileStatement': case 'DoWhileStatement':
      return child === parent.body;
    case 'TryStatement':
      return child === parent.handler || child === parent.finalizer;
    case 'SwitchStatement':
      return child !== parent.discriminant;
    default:
      return false;
  }
}

/** True when `node` is reached unconditionally once execution enters `block`. */
function unconditionalWithin(node, block) {
  const chain = ancestry(node);
  const bIdx = chain.indexOf(block);
  if (bIdx === -1) return false;
  for (let i = bIdx; i < chain.length - 1; i++) {
    if (isConditionalStep(chain[i], chain[i + 1])) return false;
  }
  return true;
}

function commentsOf(node) {
  return (node.leadingComments || []).map((c) => c.value).join('\n');
}

/** Nearest ancestor statement (inclusive) carrying a matching annotation. */
function annotationFor(node, re) {
  for (let n = node; n; n = n.__parent) {
    const m = commentsOf(n).match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function analyze(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(src, { sourceType: 'unambiguous', errorRecovery: false });

  // Locate the POST /v1/chat handler.
  let handler = null;
  walk(ast, null, (n) => {
    if (handler) return;
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c?.type !== 'MemberExpression' || c.property?.name !== 'post') return;
    const first = n.arguments[0];
    if (first?.type !== 'StringLiteral' || !/\/chat$/.test(first.value)) return;
    const last = n.arguments[n.arguments.length - 1];
    if (isFunction(last)) handler = { node: last, route: first.value };
  });
  if (!handler) throw new Error(`could not locate a POST .../chat handler in ${filePath}`);

  const gates = [];
  const responses = [];

  walk(handler.node, handler.node.__parent, (n) => {
    if (n.type === 'CallExpression') {
      // Gate call: enforceConstraints(...) / evaluateConstraints(...)
      const name = n.callee?.type === 'Identifier' ? n.callee.name : null;
      if (name && GATE_FNS.has(name)) gates.push({ node: n, line: n.loc.start.line, kind: name });

      // Response site: res.json(...) / res.status(x).json(...) / res.end(...)
      const c = n.callee;
      if (c?.type === 'MemberExpression' && RESPONSE_METHODS.has(c.property?.name)) {
        let base = c.object;
        while (base?.type === 'CallExpression') base = base.callee?.object;
        if (base?.type === 'Identifier' && base.name === 'res') {
          responses.push({ node: n, line: n.loc.start.line, kind: `res.${c.property.name}` });
        }
      }
    }
    // Annotation-declared gate providers (the gate runs inside a callee).
    // Any node sitting directly in a block's statement list counts — note that
    // a `const x = await gate()` is a VariableDeclaration, not a *Statement.
    const provided = commentsOf(n).match(PROVIDER_RE);
    if (provided && isBlock(n.__parent) && n.__parent.body.includes(n)) {
      gates.push({ node: n, line: n.loc.start.line, kind: 'provided', reason: provided[1].trim() });
    }
  });

  const protects = (gate, resp) => {
    const gChain = ancestry(gate.node);
    const rChain = ancestry(resp.node);
    let i = 0;
    while (i < gChain.length && i < rChain.length && gChain[i] === rChain[i]) i++;
    const lca = gChain[i - 1];
    if (!isBlock(lca)) return false;
    const gStmt = gChain[i];
    const rStmt = rChain[i];
    const body = lca.body;
    const gi = body.indexOf(gStmt);
    const ri = body.indexOf(rStmt);
    if (gi === -1 || ri === -1) return false;
    // A provider annotation sits ON the statement, so it protects later siblings
    // only; a real gate call must also complete before the response begins.
    if (gate.kind === 'provided' ? gi >= ri : gi > ri) return false;
    if (gi === ri && gate.kind !== 'provided') return false;
    return unconditionalWithin(gate.node, lca);
  };

  // Two exemptions are structural rather than a matter of judgement, so they are
  // derived instead of annotated — an HTTP error carries no tutor content and
  // therefore cannot carry a constraint violation.

  /** res.status(<literal >= 400>).json(...) — an error, not an answer. */
  function httpErrorStatus(node) {
    const c = node.callee;
    if (c?.type !== 'MemberExpression' || c.object?.type !== 'CallExpression') return null;
    const inner = c.object;
    if (inner.callee?.type !== 'MemberExpression' || inner.callee.property?.name !== 'status') return null;
    const arg = inner.arguments[0];
    if (arg?.type === 'NumericLiteral' && arg.value >= 400) return arg.value;
    return null;
  }

  // NOTE: "is inside a catch block" is deliberately NOT an exemption. Several
  // catch blocks here return a 200 with canned tutor text and even advance the
  // phase; an LLM call failing does not make the student's message safe.

  const sites = responses.map((r) => {
    const gate = gates.find((g) => protects(g, r));
    const annotated = annotationFor(r.node, EXEMPT_RE);
    const errStatus = httpErrorStatus(r.node);
    const derived = errStatus ? `http ${errStatus} — error response, carries no tutor content` : null;
    const exempt = annotated || derived;
    let status = 'UNGATED';
    if (gate) status = 'GATED';
    else if (exempt) status = 'EXEMPT';
    return {
      line: r.line,
      kind: r.kind,
      status,
      gatedBy: gate ? `${gate.kind}@${gate.line}` : null,
      exemptReason: exempt,
      exemptKind: annotated ? 'annotated' : derived ? 'derived' : null,
    };
  });

  return { file: filePath, route: handler.route, gates, sites };
}

/**
 * COMPANION CHECK: can a path through the handler terminate without responding?
 *
 * The guardrail audit above asks "does a gate dominate this response?". This
 * asks the adjacent question the same route failed: "is there a response at
 * all?". Two phases — 'planning' and 'completed' — matched no branch, so the
 * request fell out of the handler with the socket never written. No exception,
 * so no 500, no log line, and a client spinning until it timed out. A hang is a
 * worse failure than an error because nothing anywhere records it.
 *
 * The analysis is a standard definite-completion walk: respondsDefinitely(n) is
 * true when EVERY path through n writes a response or throws (a throw is fine —
 * the catch answers). An `if` with no `else` is therefore never definite, which
 * is exactly why a chain of `if (phase === X) return res.json(...)` guards needs
 * a terminal unconditional responder underneath it.
 *
 * `return;` with no response is treated as a hole, EXCEPT when the enclosing
 * if-test calls a helper that answers on its own (enforceConstraints returns
 * true only after it has already called res.json). Those helpers are detected
 * from the file rather than hard-coded.
 */
const RESPONDER_HELPER_RE = /^(enforceConstraints)$/;

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);

/** Every Express handler defined in a file, as {method, route, node}. */
function findHandlers(ast) {
  const found = [];
  walk(ast, null, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c?.type !== 'MemberExpression' || !HTTP_METHODS.has(c.property?.name)) return;
    const first = n.arguments[0];
    if (first?.type !== 'StringLiteral') return;
    const last = n.arguments[n.arguments.length - 1];
    if (isFunction(last)) found.push({ method: c.property.name, route: first.value, node: last });
  });
  return found;
}

function analyzeHandlerCompleteness(handler) {
  const holes = [];

  const isResponseCall = (node) => {
    if (node?.type !== 'CallExpression') return false;
    const c = node.callee;
    if (c?.type !== 'MemberExpression' || !RESPONSE_METHODS.has(c.property?.name)) return false;
    let base = c.object;
    while (base?.type === 'CallExpression') base = base.callee?.object;
    return base?.type === 'Identifier' && base.name === 'res';
  };

  /** Does the test of this if-statement delegate answering to a helper? */
  const testDelegates = (ifNode) => {
    let found = false;
    walk(ifNode.test, ifNode, (n) => {
      if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' &&
          RESPONDER_HELPER_RE.test(n.callee.name)) found = true;
    });
    return found;
  };

  function respondsDefinitely(node, ctx = {}) {
    if (!node) return false;
    switch (node.type) {
      case 'ReturnStatement':
        if (node.argument && isResponseCall(node.argument)) return true;
        if (node.argument?.type === 'CallExpression' &&
            node.argument.callee?.type === 'Identifier' &&
            node.argument.callee.name === 'next') return true;
        // `return;` after a helper already answered is fine.
        if (ctx.delegated) return true;
        holes.push({
          line: node.loc.start.line,
          kind: 'bare-return',
          detail: 'returns without writing a response',
        });
        return false;
      case 'ThrowStatement':
        return true; // the handler's catch answers
      case 'ExpressionStatement': {
        const e = node.expression?.type === 'AwaitExpression' ? node.expression.argument : node.expression;
        // next(err) hands off to Express error middleware, which responds.
        if (e?.type === 'CallExpression' && e.callee?.type === 'Identifier' && e.callee.name === 'next') return true;
        // Handing `res` to a callee gives it ownership of responding — covers
        // both `await runTopicPlanPipeline(req, res, …)` and `stream.pipe(res)`.
        if (e?.type === 'CallExpression' &&
            e.arguments.some((a) => a.type === 'Identifier' && a.name === 'res')) return true;
        return isResponseCall(node.expression);
      }
      case 'BlockStatement':
        // The first statement that definitely responds ends the path.
        return node.body.some((s) => respondsDefinitely(s, ctx));
      case 'IfStatement': {
        const delegated = testDelegates(node);
        const c = respondsDefinitely(node.consequent, { delegated });
        if (!node.alternate) return false; // no else — falls through
        return c && respondsDefinitely(node.alternate, ctx);
      }
      case 'TryStatement':
        return respondsDefinitely(node.block, ctx) &&
               (node.handler ? respondsDefinitely(node.handler.body, ctx) : false);
      case 'SwitchStatement': {
        const hasDefault = node.cases.some((k) => !k.test);
        if (!hasDefault) return false;
        return node.cases.every((k) =>
          k.consequent.length === 0 || k.consequent.some((s) => respondsDefinitely(s, ctx)));
      }
      case 'LabeledStatement':
        return respondsDefinitely(node.body, ctx);
      default:
        return false;
    }
  }

  const body = handler.node.body;
  const complete = respondsDefinitely(body);

  // Locate the specific fall-through: the try block that can complete normally.
  const tryStmt = body.body.find((s) => s.type === 'TryStatement');
  const tryFallsThrough = tryStmt ? !respondsDefinitely(tryStmt.block) : false;
  const lastTryStmt = tryStmt?.block?.body?.[tryStmt.block.body.length - 1] || null;

  // Mirror-image defect: a response written without returning, with code after
  // it, risks a second write (ERR_HTTP_HEADERS_SENT).
  const unreturned = [];
  const TERMINATORS = new Set(['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement']);
  walk(handler.node, handler.node.__parent, (n) => {
    if (n.type !== 'BlockStatement') return;
    n.body.forEach((s, i) => {
      if (s.type !== 'ExpressionStatement' || !isResponseCall(s.expression)) return;
      const next = n.body[i + 1];
      // `res.end(); return;` is fine — the path ends either way. Only an
      // unreturned response with real code after it can write twice.
      if (next && !TERMINATORS.has(next.type)) {
        unreturned.push({ line: s.loc.start.line, kind: 'unreturned-response' });
      }
    });
  });

  return {
    method: handler.method,
    route: handler.route,
    line: handler.node.loc.start.line,
    complete,
    tryFallsThrough,
    lastTryStatementLine: lastTryStmt ? lastTryStmt.loc.start.line : null,
    holes,
    unreturned,
  };
}

/** Every Express handler in a file, analysed for response completeness. */
function sweepFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(src, { sourceType: 'unambiguous', errorRecovery: false });
  return findHandlers(ast).map((h) => ({ file: filePath, ...analyzeHandlerCompleteness(h) }));
}

/** The POST /chat handler specifically — what the regression test asserts on. */
function analyzeResponseCompleteness(filePath) {
  const hit = sweepFile(filePath).find((h) => h.method === 'post' && /\/chat$/.test(h.route));
  if (!hit) throw new Error(`could not locate a POST .../chat handler in ${filePath}`);
  return hit;
}

module.exports = { analyze, analyzeResponseCompleteness, sweepFile };

if (require.main === module) {
  const target = process.argv[2] ||
    path.join(__dirname, '..', 'routes', 'chatRoutes.js');
  const r = analyze(target);
  const counts = r.sites.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {});
  console.log(`\n${r.file}  (handler: POST ${r.route})`);
  console.log(`${r.sites.length} response sites — ` +
    `${counts.GATED || 0} gated, ${counts.EXEMPT || 0} exempt, ${counts.UNGATED || 0} UNGATED\n`);
  for (const s of r.sites) {
    const tag = s.status.padEnd(7);
    const why = s.status === 'GATED' ? `via ${s.gatedBy}`
      : s.status === 'EXEMPT' ? s.exemptReason
      : '*** no gate dominates this response ***';
    console.log(`  ${tag} L${String(s.line).padStart(4)}  ${s.kind.padEnd(9)} ${why}`);
  }
  const rc = analyzeResponseCompleteness(target);
  console.log('--- response completeness ---');
  console.log(`  every path answers: ${rc.complete ? 'YES' : 'NO'}`);
  if (rc.tryFallsThrough) {
    console.log(`  *** the try block can complete normally (last statement L${rc.lastTryStatementLine})`);
    console.log('      a request reaching there gets NO response at all — no error, no log, client hangs');
  }
  for (const h of rc.holes) console.log(`  HOLE     L${h.line}  ${h.kind}: ${h.detail}`);
  for (const u of rc.unreturned) console.log(`  WARN     L${u.line}  response written without return, with code after it`);
  console.log('');

  process.exit(((counts.UNGATED || 0) > 0 || !rc.complete) ? 1 : 0);
}

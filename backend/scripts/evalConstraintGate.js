/**
 * Constraint-gate evaluation (Additions 2 and 3).
 *
 *   node scripts/evalConstraintGate.js --mode clauses      # detection miss rate (no model calls)
 *   node scripts/evalConstraintGate.js --mode gate [--runs 2]
 *
 * Addition 2: catch rate on genuine violations vs FALSE-POSITIVE rate on
 * legitimate-but-edgy questions in security, medicine and law/forensics — the
 * domains where an over-tuned gate makes the tutor useless.
 * Addition 3: whether refusal-shaped-clause detection is reliable enough to be
 * used as a skip condition.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { evaluateConstraints, refusalShapedClauses, prefilterViolation } = require('../services/constraintGateService');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const MODE = arg('mode', 'gate');
const RUNS = parseInt(arg('runs', '2'), 10);
const OUT = arg('out', null);

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/constraintGateEvalSet.json'), 'utf8'));
const setById = new Map(FX.instructionSets.map((s) => [s.id, s]));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

if (MODE === 'clauses') {
  // Addition 3 — pure heuristic, no model calls.
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const misses = [];
  for (const s of FX.instructionSets) {
    const detected = refusalShapedClauses(s.text).length > 0;
    if (s.containsProhibition && detected) tp += 1;
    else if (s.containsProhibition && !detected) { fn += 1; misses.push(s); }
    else if (!s.containsProhibition && detected) { fp += 1; misses.push({ ...s, falsePositive: true }); }
    else tn += 1;
    console.log(`${detected ? 'DETECTED  ' : 'MISSED    '} [truth=${s.containsProhibition ? 'prohibits' : 'no-prohibition'}] ${s.id}  (${s.realSource})`);
  }
  const realSets = FX.instructionSets.filter((s) => /verbatim/.test(s.realSource));
  const realMisses = realSets.filter((s) => s.containsProhibition && refusalShapedClauses(s.text).length === 0);
  console.log('\n--- Addition 3: refusal-clause detection ---');
  console.log(`real pilot instruction sets: ${realSets.length}, missed: ${realMisses.length}`);
  console.log(`all sets: TP=${tp} FN=${fn} FP=${fp} TN=${tn}`);
  console.log(`FALSE-NEGATIVE (gate would be silently skipped): ${fn}/${tp + fn}`);
  if (misses.length) {
    console.log('\nmisses:');
    misses.forEach((m) => console.log(`  - ${m.id}${m.falsePositive ? ' (false positive)' : ''}: "${m.text.slice(0, 100)}..."`));
  }
  console.log('\nVERDICT:', fn > 0
    ? 'Detection is NOT safe as a skip condition — the gate must always run.'
    : 'No misses on this fixture.');
  process.exit(0);
}

(async () => {
  const jobs = [];
  for (const c of FX.gateCases) for (let r = 0; r < RUNS; r++) jobs.push(c);

  const results = await mapLimit(jobs, 5, async (c) => {
    const set = setById.get(c.instructionSet);
    const v = await evaluateConstraints({ userMessage: c.message, globalInstructions: set?.text || '' });
    return { id: c.id, label: c.label, domain: c.domain, got: v.violates ? 'refuse' : 'allow', detectedBy: v.detectedBy || null, category: v.category || null, clause: v.clause || '', gateError: v.gateError || null };
  });

  const byCase = new Map();
  for (const r of results) { if (!byCase.has(r.id)) byCase.set(r.id, []); byCase.get(r.id).push(r); }

  let violationsCaught = 0, violationsTotal = 0, legitRefused = 0, legitTotal = 0, unstable = 0;
  const falsePositives = [], falseNegatives = [];
  for (const c of FX.gateCases) {
    const runs = byCase.get(c.id) || [];
    const outs = runs.map((r) => r.got);
    if (new Set(outs).size > 1) unstable += 1;
    const majority = outs.filter((o) => o === 'refuse').length > outs.length / 2 ? 'refuse' : 'allow';
    if (c.label === 'refuse') {
      violationsTotal += 1;
      if (majority === 'refuse') violationsCaught += 1; else falseNegatives.push({ ...c, outs });
    } else {
      legitTotal += 1;
      if (majority === 'refuse') { legitRefused += 1; falsePositives.push({ ...c, outs, by: runs[0]?.detectedBy }); }
    }
  }

  const byDomain = {};
  for (const c of FX.gateCases.filter((x) => x.label === 'allow')) {
    const runs = byCase.get(c.id) || [];
    const refused = runs.filter((r) => r.got === 'refuse').length > runs.length / 2;
    byDomain[c.domain] = byDomain[c.domain] || { total: 0, refused: 0 };
    byDomain[c.domain].total += 1;
    if (refused) byDomain[c.domain].refused += 1;
  }

  const prefilterOnLegit = FX.gateCases.filter((c) => c.label === 'allow' && prefilterViolation(c.message)).map((c) => c.id);
  const prefilterOnViolations = FX.gateCases.filter((c) => c.label === 'refuse' && prefilterViolation(c.message)).map((c) => c.id);

  // Per-FAMILY rates. A single averaged number hid the production failure:
  // safety-floor behaviour was fine while tutor-directed rules were refusing
  // ordinary student answers, and the blend still looked acceptable.
  const families = {};
  for (const c of FX.gateCases) {
    const fam = c.family || 'untagged';
    families[fam] = families[fam] || { caught: 0, violations: 0, refusedLegit: 0, legit: 0 };
    const runs = byCase.get(c.id) || [];
    const majority = runs.filter((r) => r.got === 'refuse').length > runs.length / 2 ? 'refuse' : 'allow';
    if (c.label === 'refuse') {
      families[fam].violations += 1;
      if (majority === 'refuse') families[fam].caught += 1;
    } else {
      families[fam].legit += 1;
      if (majority === 'refuse') families[fam].refusedLegit += 1;
    }
  }
  const pct = (n, d) => (d === 0 ? 'n/a' : `${n}/${d} (${((n / d) * 100).toFixed(1)}%)`);
  const byFamily = {};
  for (const [fam, f] of Object.entries(families)) {
    byFamily[fam] = {
      catchRate: pct(f.caught, f.violations),
      falsePositiveRate: pct(f.refusedLegit, f.legit),
    };
  }

  // The 2026-08-11 production regressions specifically.
  const observed = FX.gateCases.filter((c) => c.observedFalsePositive);
  const observedStillRefused = observed.filter((c) => {
    const runs = byCase.get(c.id) || [];
    return runs.filter((r) => r.got === 'refuse').length > runs.length / 2;
  });

  const summary = {
    runsPerCase: RUNS,
    byFamily,
    observedProductionFalsePositives: pct(observedStillRefused.length, observed.length) + ' still refused',
    catchRateOverall: `${violationsCaught}/${violationsTotal} (${((violationsCaught / violationsTotal) * 100).toFixed(1)}%)`,
    falsePositiveRateOverall: `${legitRefused}/${legitTotal} (${((legitRefused / legitTotal) * 100).toFixed(1)}%)`,
    overRefusalByDomain: byDomain,
    unstableCases: `${unstable}/${FX.gateCases.length}`,
    deterministicPrefilter: {
      firesOnViolations: `${prefilterOnViolations.length}/${violationsTotal}`,
      firesOnLegitimate: `${prefilterOnLegit.length}/${legitTotal}`,
      legitimateCaught: prefilterOnLegit,
    },
    falsePositives: falsePositives.map((f) => ({ id: f.id, family: f.family, domain: f.domain, msg: f.message.slice(0, 90), outs: f.outs.join('/') })),
    falseNegatives: falseNegatives.map((f) => ({ id: f.id, msg: f.message.slice(0, 90), outs: f.outs.join('/') })),
    gateErrors: results.filter((r) => r.gateError).length,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

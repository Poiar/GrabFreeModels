/**
 * safe-chain-walker.test.js — Unit tests for the base_model chain safety utility.
 *
 * Tests walkChain, wouldCreateCycle, detectCycles, and validateNoSelfRefs
 * with normal chains, cycles, self-references, deep chains, and edge cases.
 */

const assert = require('assert');
const path = require('path');

const { MAX_CHAIN_DEPTH, walkChain, wouldCreateCycle, detectCycles, validateNoSelfRefs } = require(
  path.join(__dirname, '../../scripts/utils/safe-chain-walker'),
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ── walkChain ──

test('walkChain: empty chain (start has no parent)', () => {
  const parentMap = new Map([['a', null]]);
  const result = walkChain('a', parentMap);
  assert.strictEqual(result.path.length, 1);
  assert.strictEqual(result.path[0], 'a');
  assert.strictEqual(result.cycleDetected, false);
  assert.strictEqual(result.truncated, false);
});

test('walkChain: simple 3-level chain', () => {
  const parentMap = new Map([
    ['c', 'b'],
    ['b', 'a'],
    ['a', null],
  ]);
  const result = walkChain('c', parentMap);
  assert.deepStrictEqual(result.path, ['c', 'b', 'a']);
  assert.strictEqual(result.cycleDetected, false);
  assert.strictEqual(result.truncated, false);
});

test('walkChain: self-referencing slug', () => {
  const parentMap = new Map([['x', 'x']]);
  const result = walkChain('x', parentMap);
  assert.strictEqual(result.cycleDetected, true);
  assert.strictEqual(result.path.length, 1);
});

test('walkChain: A→B→A cycle', () => {
  const parentMap = new Map([
    ['a', 'b'],
    ['b', 'a'],
  ]);
  const result = walkChain('a', parentMap);
  assert.strictEqual(result.cycleDetected, true);
  assert.strictEqual(result.path.length, 2);
});

test('walkChain: 4-node cycle A→B→C→D→B', () => {
  const parentMap = new Map([
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'b'],
  ]);
  const result = walkChain('a', parentMap);
  assert.strictEqual(result.cycleDetected, true);
  // Path: a, b, c, d — then hits b again (cycle)
  assert.strictEqual(result.path.length, 4);
});

test('walkChain: respects nameMap for path labels', () => {
  const parentMap = new Map([
    ['c', 'b'],
    ['b', 'a'],
    ['a', null],
  ]);
  const nameMap = new Map([
    ['c', 'Charlie'],
    ['b', 'Bravo'],
    ['a', 'Alpha'],
  ]);
  const result = walkChain('c', parentMap, nameMap);
  assert.deepStrictEqual(result.path, ['Charlie', 'Bravo', 'Alpha']);
});

test('walkChain: missing parent in map (null parent arg)', () => {
  const parentMap = new Map([['b', 'a']]); // 'a' not in parentMap
  const result = walkChain('b', parentMap);
  // path: ['b', 'a'] then stops because parentMap.get('a') is undefined/null
  assert.strictEqual(result.path.length, 2);
  assert.strictEqual(result.cycleDetected, false);
});

test('walkChain: ultra-deep chain is truncated at MAX_CHAIN_DEPTH', () => {
  const parentMap = new Map();
  for (let i = 0; i < MAX_CHAIN_DEPTH + 10; i++) {
    parentMap.set('m' + i, 'm' + (i + 1));
  }
  const result = walkChain('m0', parentMap);
  assert.strictEqual(result.truncated, true);
  assert.strictEqual(result.path.length, MAX_CHAIN_DEPTH);
  assert.strictEqual(result.cycleDetected, false);
});

// ── wouldCreateCycle ──

test('wouldCreateCycle: safe assignment (no existing parents)', () => {
  const parentMap = new Map(); // empty — no existing relationships
  assert.strictEqual(wouldCreateCycle('child', 'parent', parentMap), false);
});

test('wouldCreateCycle: self-reference always cycles', () => {
  const parentMap = new Map();
  assert.strictEqual(wouldCreateCycle('x', 'x', parentMap), true);
});

test('wouldCreateCycle: safe 2-level', () => {
  const parentMap = new Map([['a', null]]);
  assert.strictEqual(wouldCreateCycle('b', 'a', parentMap), false);
});

test('wouldCreateCycle: would create A→B→C→A cycle', () => {
  // Existing: a → b, b → c.  Proposal: c → a would complete the loop.
  const parentMap = new Map([
    ['a', 'b'],
    ['b', 'c'],
  ]);
  assert.strictEqual(wouldCreateCycle('c', 'a', parentMap), true);
});

test('wouldCreateCycle: safe linear extension', () => {
  // Existing: b → a.  Proposal: c → b is safe (extends the chain).
  const parentMap = new Map([
    ['b', 'a'],
    ['a', null],
  ]);
  assert.strictEqual(wouldCreateCycle('c', 'b', parentMap), false);
});

test('wouldCreateCycle: parent chain does not include child', () => {
  // Existing: a → b, unrelated: x → y.  Proposal: z → a is safe.
  const parentMap = new Map([
    ['a', 'b'],
    ['x', 'y'],
  ]);
  assert.strictEqual(wouldCreateCycle('z', 'a', parentMap), false);
});

// ── detectCycles ──

test('detectCycles: empty graph', () => {
  const parentMap = new Map();
  assert.deepStrictEqual(detectCycles(parentMap), []);
});

test('detectCycles: no cycles (linear)', () => {
  const parentMap = new Map([
    ['c', 'b'],
    ['b', 'a'],
    ['a', null],
  ]);
  assert.deepStrictEqual(detectCycles(parentMap), []);
});

test('detectCycles: self-reference found', () => {
  const parentMap = new Map([['x', 'x']]);
  const cycles = detectCycles(parentMap);
  assert.ok(cycles.includes('x'));
});

test('detectCycles: all 3 nodes in A→B→C→A cycle', () => {
  const parentMap = new Map([
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
  ]);
  const cycles = detectCycles(parentMap);
  // All three participate
  assert.strictEqual(cycles.length, 3);
  assert.ok(cycles.includes('a'));
  assert.ok(cycles.includes('b'));
  assert.ok(cycles.includes('c'));
});

test('detectCycles: handles 603-cycle scenario (large batch)', () => {
  // Simulate the real-world scenario: many models, some with cycles.
  // Real cycles are shallow (2-5 depth), so all are caught within MAX_CHAIN_DEPTH.
  const parentMap = new Map();
  // 500 linear chains (safe)
  for (let i = 0; i < 500; i++) {
    parentMap.set('linear' + i, i > 0 ? 'linear' + (i - 1) : null);
  }
  // 100 cycle participants: 20 cycles of 5 nodes each (shallow, all detectable)
  for (let c = 0; c < 20; c++) {
    const base = 'cy' + c + '_';
    parentMap.set(base + '0', base + '1');
    parentMap.set(base + '1', base + '2');
    parentMap.set(base + '2', base + '3');
    parentMap.set(base + '3', base + '4');
    parentMap.set(base + '4', base + '0'); // closes the cycle
  }
  const cycles = detectCycles(parentMap);
  assert.strictEqual(cycles.length, 100);
});

// ── validateNoSelfRefs ──

test('validateNoSelfRefs: empty', () => {
  assert.deepStrictEqual(validateNoSelfRefs(new Map()), []);
});

test('validateNoSelfRefs: no self-refs', () => {
  const parentMap = new Map([
    ['a', 'b'],
    ['b', null],
  ]);
  assert.deepStrictEqual(validateNoSelfRefs(parentMap), []);
});

test('validateNoSelfRefs: finds self-reference', () => {
  const parentMap = new Map([
    ['x', 'x'],
    ['y', 'z'],
  ]);
  const refs = validateNoSelfRefs(parentMap);
  assert.deepStrictEqual(refs, ['x']);
});

test('validateNoSelfRefs: multiple self-refs with different casing', () => {
  // Note: the function does exact string match (case-sensitive).
  // 'Ling-2-6-Flash' would NOT match 'ling-2-6-flash' — both the DB CHECK
  // constraint and this function use exact equality.
  const parentMap = new Map([
    ['a', 'a'],
    ['b', 'b'],
    ['c', 'd'],
  ]);
  const refs = validateNoSelfRefs(parentMap);
  assert.strictEqual(refs.length, 2);
  assert.ok(refs.includes('a'));
  assert.ok(refs.includes('b'));
});

test('MAX_CHAIN_DEPTH is a reasonable value', () => {
  // Real model chains don't exceed ~8 levels. 20+ is a guardrail.
  assert.ok(MAX_CHAIN_DEPTH >= 20);
  assert.ok(MAX_CHAIN_DEPTH <= 100);
});

test('detectCycles: catches cycles deeper than MAX_CHAIN_DEPTH', () => {
  // detectCycles uses CYCLE_DETECT_DEPTH (200), not MAX_CHAIN_DEPTH (50),
  // so it catches even pathologically deep cycles.
  const parentMap = new Map();
  // 80-node ring — deeper than MAX_CHAIN_DEPTH but within CYCLE_DETECT_DEPTH
  for (let i = 0; i < 80; i++) {
    parentMap.set('deep' + i, i < 79 ? 'deep' + (i + 1) : 'deep0');
  }
  const cycles = detectCycles(parentMap);
  assert.strictEqual(cycles.length, 80);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

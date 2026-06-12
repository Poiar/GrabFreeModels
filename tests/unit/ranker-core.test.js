/**
 * ranker-core.test.js — Unit tests for the shared ranking/scoring engine.
 *
 * Tests actual module imports — no regex-grep on source files.
 * These tests execute the real functions with known inputs.
 */

const assert = require('assert');
const path = require('path');

// Import the real module
const {
  getQuantFactor,
  sigmoid,
  sigSquash,
  ctxScore,
  tagBonus,
  modelFreshnessScore,
  ROLES,
  buildScoreTypeStats,
  diffRankings,
} = require(path.join(__dirname, '../../scripts/utils/ranker-core'));

// ── Tests ──
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

function assertClose(actual, expected, delta = 0.001, msg = '') {
  if (Math.abs(actual - expected) > delta) {
    throw new assert.AssertionError({
      message: `Expected ${actual} to be close to ${expected} (delta ${delta}) ${msg}`,
      actual,
      expected,
    });
  }
}

// ── Quantization factors ──
test('getQuantFactor returns 1.0 for null', () => {
  assert.strictEqual(getQuantFactor(null), 1.0);
});

test('getQuantFactor returns 1.0 for unknown quant', () => {
  assert.strictEqual(getQuantFactor('unknown_format'), 1.0);
});

test('getQuantFactor penalizes int8', () => {
  assert.strictEqual(getQuantFactor('int8'), 0.99);
});

test('getQuantFactor penalizes fp4', () => {
  assert.strictEqual(getQuantFactor('fp4'), 0.98);
});

// ── Math helpers ──
test('sigmoid(0) = 0.5', () => {
  assertClose(sigmoid(0), 0.5);
});

test('sigmoid is between 0 and 1', () => {
  assert.ok(sigmoid(5) > 0.5 && sigmoid(5) < 1);
  assert.ok(sigmoid(-5) > 0 && sigmoid(-5) < 0.5);
});

test('sigSquash returns 0 for bad inputs', () => {
  assert.strictEqual(sigSquash(0, 0), 0);
  assert.strictEqual(sigSquash(null, 10), 0);
  assert.strictEqual(sigSquash(10, 0), 0);
});

// ── Context scoring ──
test('ctxScore returns -0.5 for null context', () => {
  assert.strictEqual(ctxScore({ context_length: null }, 128000), -0.5);
});

test('ctxScore returns ratio for known context', () => {
  assertClose(ctxScore({ context_length: 64000 }, 128000), 0.5);
});

// ── Tag bonus ──
test('tagBonus returns 0 for empty keywords', () => {
  assert.strictEqual(tagBonus({ best_for: ['coding'] }, []), 0);
});

test('tagBonus returns 1 for full match', () => {
  assert.strictEqual(tagBonus({ best_for: ['coding', 'agentic'] }, ['coding', 'agentic']), 1.0);
});

test('tagBonus returns partial for partial match', () => {
  assertClose(tagBonus({ best_for: ['coding'] }, ['coding', 'reasoning']), 0.5);
});

// ── Freshness ──
test('modelFreshnessScore penalizes deprecated models', () => {
  assert.strictEqual(modelFreshnessScore({ deprecated_at: '2024-01-01' }), -3.0);
});

test('modelFreshnessScore rewards recent releases', () => {
  const recent = new Date();
  recent.setMonth(recent.getMonth() - 3); // 3 months ago
  const date = recent.toISOString().split('T')[0];
  assert.strictEqual(modelFreshnessScore({ release_date: date }), 1.5);
});

// ── Score type stats ──
test('buildScoreTypeStats computes max and mean', () => {
  const scoreMap = new Map();
  scoreMap.set('a/b', [
    {
      score_type: 'intelligence',
      score_value: 30,
      source: 'aa',
      fetched_at: new Date().toISOString(),
    },
    {
      score_type: 'intelligence',
      score_value: 10,
      source: 'aa',
      fetched_at: new Date().toISOString(),
    },
  ]);
  const stats = buildScoreTypeStats(scoreMap);
  const intel = stats.get('intelligence');
  assert.strictEqual(intel.max, 30);
  assertClose(intel.mean, 20);
  assert.strictEqual(intel.count, 2);
});

// ── Role definitions ──
test('ROLES has all 5 expected roles', () => {
  const keys = Object.keys(ROLES);
  assert.deepStrictEqual(keys, ['model', 'build', 'general', 'small_model', 'explore']);
});

test('each role has description, ctxWeight, tagKeywords', () => {
  for (const [name, cfg] of Object.entries(ROLES)) {
    assert.ok(typeof cfg.description === 'string', `${name}: missing description`);
    assert.ok(typeof cfg.ctxWeight === 'number', `${name}: missing ctxWeight`);
    assert.ok(Array.isArray(cfg.tagKeywords), `${name}: missing tagKeywords`);
  }
});

// ── Diff rankings ──
test('diffRankings detects unchanged roles', () => {
  const old = { model: ['a', 'b'], build: ['c'] };
  const n = { model: ['a', 'b'], build: ['c'] };
  const diff = diffRankings(old, n);
  assert.ok(diff.model.unchanged);
  assert.ok(diff.build.unchanged);
});

test('diffRankings detects added and removed', () => {
  const old = { model: ['a', 'b'] };
  const n = { model: ['b', 'c'] };
  const diff = diffRankings(old, n);
  assert.ok(!diff.model.unchanged);
  assert.deepStrictEqual(diff.model.added, ['c']);
  assert.deepStrictEqual(diff.model.removed, ['a']);
});

// ── Results ──
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

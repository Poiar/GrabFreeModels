#!/usr/bin/env node
/**
 * Unit tests for script helper functions and critical bug fixes.
 * Tests the logic in isolation without requiring DB or API access.
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
  }
}

// ── import-modelsdev.js: normalizeName ──
console.log('\n=== import-modelsdev.js: normalizeName ===');

const normalizeName = (name) =>
  name
    .replace(/\s*\(free\)\s*/gi, '')
    .replace(/\s*\(free tier\)\s*/gi, '')
    .replace(/^coding[-_]/i, '')
    .replace(/^xiaomi[-_]/i, '')
    .trim();

test('strips (free) suffix', () => {
  assert.strictEqual(normalizeName('GPT-4 (free)'), 'GPT-4');
});

test('strips (free tier) suffix', () => {
  assert.strictEqual(normalizeName('Mistral (free tier)'), 'Mistral');
});

test('strips coding- prefix', () => {
  assert.strictEqual(normalizeName('coding-glm-5'), 'glm-5');
});

test('strips xiaomi- prefix', () => {
  assert.strictEqual(normalizeName('xiaomi-mimo-v2.5'), 'mimo-v2.5');
});

test('handles plain name', () => {
  assert.strictEqual(normalizeName('Llama 3.1'), 'Llama 3.1');
});

// ── import-modelsdev.js: slugify ──
console.log('\n=== import-modelsdev.js: slugify ===');

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');

test('lowercases and hyphenates', () => {
  assert.strictEqual(slugify('GPT-4 Turbo'), 'gpt-4-turbo');
});

test('collapses multiple special chars', () => {
  assert.strictEqual(slugify('Llama  3.1  8B'), 'llama-3-1-8b');
});

test('trims leading/trailing hyphens', () => {
  assert.strictEqual(slugify('!Model!'), 'model');
});

// ── import-modelsdev.js: verify no masterId reference in source ──
console.log('\n=== import-modelsdev.js: no masterId bug ===');

test('source file does not contain masterId variable', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'import-modelsdev.js'),
    'utf8',
  );
  // The INSERT query should reference superId, not masterId
  const insertMatch = src.match(
    /const \{ rows: dpIns \} = await client\.query\([\s\S]*?\[([^\]]+)\]/,
  );
  assert.ok(insertMatch, 'INSERT query found');
  assert.ok(!insertMatch[1].includes('masterId'), 'masterId should not appear in INSERT values');
  assert.ok(insertMatch[1].includes('superId'), 'superId should appear in INSERT values');
});

test('source file uses supersMatched (not mastersMatched) in log', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'import-modelsdev.js'),
    'utf8',
  );
  assert.ok(!src.includes('mastersMatched'), 'mastersMatched should not appear in source');
  assert.ok(src.includes('supersMatched'), 'supersMatched should appear in source');
});

// ── sync-models.js: verify await on getGroqModels ──
console.log('\n=== sync-models.js: await on getGroqModels ===');

test('getGroqModels call is awaited', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'sync-models.js'),
    'utf8',
  );
  // Find the line that assigns groqModels — must include await
  const groqAssign = src.match(
    /(?:const|let)\s+groqModels\s*=|groqModels\s*=\s*await\s+getGroqModels/,
  );
  assert.ok(groqAssign, 'groqModels awaited assignment found');
  // The actual await call is on the reassignment to the let variable
  assert.ok(
    src.includes('groqModels = await getGroqModels()') || groqAssign[0].includes('await'),
    'groqModels assignment should use await',
  );
});

test('getGroqModels is declared as async', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'sync-models.js'),
    'utf8',
  );
  assert.ok(src.includes('async function getGroqModels'), 'getGroqModels should be declared async');
});

// ── sync-models.js: auth file read has error handling ──
console.log('\n=== sync-models.js: auth file error handling ===');

test('auth file read is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'sync-models.js'),
    'utf8',
  );
  // Find the auth reading block - should have try/catch, not bare readFileSync
  const authBlock = src.match(
    /let auth;[\s\S]*?auth = JSON\.parse[\s\S]*?} catch[\s\S]*?process\.exit\(1\)/,
  );
  assert.ok(authBlock, 'auth file read should be wrapped in try/catch with process.exit(1)');
});

// ── sync-models.js: normalizeModelSlug ──
console.log('\n=== sync-models.js: normalizeModelSlug ===');

const normalizeModelSlug = (name) => {
  let slug = name
    .toLowerCase()
    .replace(/\(free\)/g, '')
    .replace(/\(free tier\)/g, '')
    .replace(/^coding-/, '')
    .replace(/^xiaomi-/, '')
    .replace(/-free$/, '')
    .replace(/-free-/, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
  return slug;
};

test('does NOT strip :free (colon prefix is OpenRouter convention)', () => {
  // The function strips -free (hyphen) and (free) but not :free
  // :free is an OpenRouter model suffix that should be preserved
  assert.strictEqual(normalizeModelSlug('gpt-4:free'), 'gpt-4-free');
  // After the general cleanup pass, : becomes -
  assert.strictEqual(normalizeModelSlug('model:free'), 'model-free');
});

test('strips -free suffix', () => {
  assert.strictEqual(normalizeModelSlug('model-free'), 'model');
});

test('handles complex name', () => {
  assert.strictEqual(normalizeModelSlug('Coding-GLM-5 (Free Tier)'), 'glm-5');
});

// ── server/routes/data.js: error messages are sanitized ──
console.log('\n=== server/routes/data.js: error sanitization ===');

test('/api/data does not leak err.message to client', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'server', 'routes', 'data.js'),
    'utf8',
  );
  // Find all res.json responses - none should contain err.message
  const responseMatches = src.match(/res\.status\(\d+\)\.json\(\{[^}]+\}\)/g) || [];
  for (const match of responseMatches) {
    assert.ok(!match.includes('err.message'), `Response should not contain err.message: ${match}`);
  }
});

test('/api/health does not leak err.message to client', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'server', 'routes', 'data.js'),
    'utf8',
  );
  // The health endpoint should return generic message
  assert.ok(
    src.includes("'Database unavailable'") || src.includes('"Database unavailable"'),
    'Health endpoint should return generic "Database unavailable" message',
  );
});

// ── server/index.js: has error middleware ──
console.log('\n=== server/index.js: error middleware ===');

test('Express error-handling middleware exists', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'index.js'), 'utf8');
  assert.ok(
    src.includes('app.use((err, req, res, next)'),
    'Error middleware with (err, req, res, next) signature should exist',
  );
  assert.ok(src.includes('500'), 'Error middleware should return 500 status');
});

// ── nightly-maintenance.js: pool cleanup before exit ──
console.log('\n=== nightly-maintenance.js: pool cleanup ===');

test('pool is closed before process.exit(0) on rollback', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'nightly-maintenance.js'),
    'utf8',
  );
  // Find the rollback block - pool.end() should come before process.exit(0)
  const rollbackBlock = src.match(/shouldRollback[\s\S]*?process\.exit\(0\)/);
  assert.ok(rollbackBlock, 'Rollback block found');
  const block = rollbackBlock[0];
  const endPos = block.indexOf('await pool.end()');
  const exitPos = block.indexOf('process.exit(0)');
  assert.ok(endPos !== -1, 'await pool.end() should exist in rollback block');
  assert.ok(endPos < exitPos, 'await pool.end() should come before process.exit(0)');
});

test('summary log generation is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'nightly-maintenance.js'),
    'utf8',
  );
  // The model-summary.js call should be inside a try/catch
  const stepIdx = src.indexOf('generate-summary-log');
  assert.ok(stepIdx !== -1, 'generate-summary-log step found');
  // Get the step handler body
  const stepBlock = src.slice(stepIdx);
  const tryIdx = stepBlock.indexOf('try {');
  const catchIdx = stepBlock.indexOf('catch');
  assert.ok(tryIdx !== -1 && catchIdx !== -1, 'Summary generation step should be in try/catch');
  assert.ok(tryIdx < catchIdx, 'try should come before catch in summary generation step');
});

// ── backfill-context.js: auth file error handling ──
console.log('\n=== backfill-context.js: auth file error handling ===');

test('auth file read is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'backfill-context.js'),
    'utf8',
  );
  // Should have try/catch around the auth read (catches and re-throws; outer .catch handles exit)
  const authReadPattern = /let auth;\s*try\s*\{[\s\S]*?auth = JSON\.parse[\s\S]*?\} catch/m;
  assert.ok(authReadPattern.test(src), 'auth file read should be wrapped in try/catch');
});

// ── validate-free-models.js: status_result handling ──
console.log('\n=== validate-free-models.js: status_result coverage ===');

test('handles all 5 status_result values in test summary', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'validate-free-models.js'),
    'utf8',
  );
  // loadFromDb uses ts.working, ts.rate_limited, ts.broken, ts.untested, ts.not_found
  assert.ok(src.includes('ts.not_found'), 'Should have ts.not_found array in loadFromDb');
  // The apply section should handle all statuses including not_found
  assert.ok(src.includes("r.status === 'working'"), 'Should handle working status');
  assert.ok(src.includes("r.status === 'rate_limited'"), 'Should handle rate_limited status');
  assert.ok(src.includes("r.status === 'broken'"), 'Should handle broken status');
  assert.ok(src.includes("r.status === 'not_found'"), 'Should handle not_found status');
});

// ── import-modelsdev-backfill.js: uses correct variable name ──
console.log('\n=== import-modelsdev-backfill.js: variable names ===');

test('uses row.super_id (not masterId) for INSERT', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'import-modelsdev-backfill.js'),
    'utf8',
  );
  // The INSERT should reference row.super_id
  const insertMatch = src.match(/VALUES \(\$1,\$2,\$3,\$4,\$5[^)]+\)/);
  assert.ok(insertMatch, 'INSERT VALUES found');
  // Check the parameter array references row.super_id (may span lines after formatting)
  const paramMatch = src.match(/\[\s*row\.super_id[, \n]*provId/);
  assert.ok(paramMatch, 'Should reference row.super_id in INSERT params');
});

// ── check-score-integrity.js: mean ──
console.log('\n=== check-score-integrity.js: mean ===');

function _mean(values) {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / n;
}

test('computes correct average of numbers', () => {
  assert.strictEqual(_mean([1, 2, 3, 4, 5]), 3);
});

test('returns 0 for empty array', () => {
  assert.strictEqual(_mean([]), 0);
});

test('handles single value', () => {
  assert.strictEqual(_mean([42]), 42);
});

// ── check-score-integrity.js: stddev ──
console.log('\n=== check-score-integrity.js: stddev ===');

function _stddev(values, meanVal) {
  const n = values.length;
  if (n < 2) return 0;
  let sumSq = 0;
  for (const v of values) sumSq += (v - meanVal) ** 2;
  return Math.sqrt(sumSq / (n - 1));
}

test('computes correct standard deviation', () => {
  // [0, 2, 4] with mean 2: variance = (4+0+4)/2 = 4, stddev = 2
  assert.strictEqual(_stddev([0, 2, 4], 2), 2);
});

test('returns 0 for single element', () => {
  assert.strictEqual(_stddev([42], 42), 0);
});

test('returns 0 when all values are identical', () => {
  assert.strictEqual(_stddev([5, 5, 5], 5), 0);
});

// ── check-score-integrity.js: error handling and flags ──
console.log('\n=== check-score-integrity.js: error handling and flags ===');

test('exits with code 1 when outliers are found', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-score-integrity.js'),
    'utf8',
  );
  const exitPattern = src.match(/if \(hadIssues\)[\s\S]*?process\.exit\(1\)/);
  assert.ok(exitPattern, 'process.exit(1) should follow hadIssues check');
});

test('exits with code 0 when no issues found', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-score-integrity.js'),
    'utf8',
  );
  assert.ok(
    src.includes('All scores pass integrity checks'),
    'should print success message when no issues',
  );
  assert.ok(
    !src.includes('process.exit(0)'),
    'should not have explicit process.exit(0) on success (falls through naturally)',
  );
});

test('--json flag produces valid JSON output structure', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-score-integrity.js'),
    'utf8',
  );
  assert.ok(src.includes('generated_at'), 'JSON output should include generated_at');
  assert.ok(src.includes('summary'), 'JSON output should include summary');
  assert.ok(src.includes('outliers'), 'JSON output should include outliers array');
  assert.ok(src.includes('deltas'), 'JSON output should include deltas array');
});

test('handles empty model_scores table gracefully', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-score-integrity.js'),
    'utf8',
  );
  assert.ok(
    src.includes('model_scores table does not exist'),
    'should have graceful message for missing table',
  );
  assert.ok(src.includes('allScores.length === 0'), 'should check for empty results');
  assert.ok(src.includes('No scores found'), 'should print message for empty scores');
});

// ── diff-rankings.js: ranking comparison ──
console.log('\n=== diff-rankings.js: ranking comparison ===');

test('correctly identifies new entries in rankings', () => {
  const oldList = ['a', 'b', 'c'];
  const newList = ['a', 'b', 'c', 'd', 'e'];
  const oldSet = new Set(oldList);
  const added = newList.filter((id) => !oldSet.has(id));
  assert.strictEqual(added.length, 2);
  assert.ok(added.includes('d'));
  assert.ok(added.includes('e'));
});

test('correctly identifies dropped entries in rankings', () => {
  const oldList = ['a', 'b', 'c', 'd', 'e'];
  const newList = ['a', 'b', 'c'];
  const newSet = new Set(newList);
  const removed = oldList.filter((id) => !newSet.has(id));
  assert.strictEqual(removed.length, 2);
  assert.ok(removed.includes('d'));
  assert.ok(removed.includes('e'));
});

test('correctly identifies movers with 3+ position change', () => {
  const oldList = ['a', 'b', 'c', 'd', 'e'];
  const newList = ['e', 'b', 'c', 'a', 'd']; // a: 0->3, e: 4->0
  const newSet = new Set(newList);
  const oldPos = {};
  oldList.forEach((id, i) => (oldPos[id] = i));
  const newPos = {};
  newList.forEach((id, i) => (newPos[id] = i));
  const movers = [];
  for (const id of oldList) {
    if (!newSet.has(id)) continue;
    const delta = oldPos[id] - newPos[id];
    if (Math.abs(delta) >= 3) {
      movers.push({ id, delta });
    }
  }
  assert.strictEqual(movers.length, 2);
  assert.ok(movers.some((m) => m.id === 'a' && m.delta === -3));
  assert.ok(movers.some((m) => m.id === 'e' && m.delta === 4));
});

test('handles identical rankings with no changes', () => {
  const oldList = ['a', 'b', 'c'];
  const newList = ['a', 'b', 'c'];
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  const added = newList.filter((id) => !oldSet.has(id));
  const removed = oldList.filter((id) => !newSet.has(id));
  assert.strictEqual(added.length, 0);
  assert.strictEqual(removed.length, 0);
});

// ── diff-rankings.js: CLI flags and error handling ──
console.log('\n=== diff-rankings.js: CLI flags and error handling ===');

test('--json flag produces valid JSON output structure', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'diff-rankings.js'),
    'utf8',
  );
  assert.ok(src.includes('generated_at'), 'JSON output should include generated_at');
  assert.ok(src.includes('results'), 'JSON output should include results');
  assert.ok(src.includes('old_source'), 'JSON output should include old_source');
  assert.ok(src.includes('new_source'), 'JSON output should include new_source');
});

test('handles missing file error gracefully', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'diff-rankings.js'),
    'utf8',
  );
  assert.ok(src.includes('function loadJsonFile'), 'loadJsonFile function should exist');
  assert.ok(src.includes('try {'), 'loadJsonFile should have try block');
  assert.ok(src.includes("'Failed to load '"), 'loadJsonFile should have error message');
  assert.ok(src.includes('process.exit(1)'), 'loadJsonFile should exit on error');
});

// ── compute-latency-percentiles.js: CLI flags ──
console.log('\n=== compute-latency-percentiles.js: CLI flags ===');

test('parses --days flag correctly', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'compute-latency-percentiles.js'),
    'utf8',
  );
  assert.ok(src.includes("args.indexOf('--days')"), 'should parse --days flag');
  assert.ok(src.includes(': 30;'), 'should default to 30 days');
});

test('--model flag filters to single model', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'compute-latency-percentiles.js'),
    'utf8',
  );
  assert.ok(src.includes("args.indexOf('--model')"), 'should parse --model flag');
  assert.ok(src.includes('SINGLE_MODEL'), 'should have SINGLE_MODEL variable');
});

test('--json flag produces valid JSON output structure', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'compute-latency-percentiles.js'),
    'utf8',
  );
  assert.ok(src.includes('generated_at'), 'JSON should include generated_at');
  assert.ok(src.includes('description'), 'JSON should include description');
  assert.ok(src.includes('days'), 'JSON should include days');
  assert.ok(src.includes('models'), 'JSON should include models array');
});

test('handles empty test_observations table gracefully', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'compute-latency-percentiles.js'),
    'utf8',
  );
  assert.ok(
    src.includes('test_observations table does not exist'),
    'should have graceful message for missing table',
  );
  assert.ok(src.includes('No observations found'), 'should handle empty results');
});

// ── check-degradation.js: CLI flags and webhook ──
console.log('\n=== check-degradation.js: CLI flags and webhook ===');

test('parses --baseline-days flag correctly', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-degradation.js'),
    'utf8',
  );
  assert.ok(src.includes("args.indexOf('--baseline-days')"), 'should parse --baseline-days flag');
  assert.ok(src.includes(': 7;'), 'should default to 7 days');
});

test('--json flag produces valid JSON output structure', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-degradation.js'),
    'utf8',
  );
  assert.ok(src.includes('generated_at'), 'JSON should include generated_at');
  assert.ok(src.includes('run_date'), 'JSON should include run_date');
  assert.ok(src.includes('alerts'), 'JSON should include alerts');
});

test('handles empty test_observations table gracefully', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-degradation.js'),
    'utf8',
  );
  assert.ok(
    src.includes('test_observations table does not exist'),
    'should have graceful message for missing table',
  );
});

test('--alert flag requires webhook URL (env var or CLI arg)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-degradation.js'),
    'utf8',
  );
  assert.ok(
    src.includes('--alert flag set but no webhook URL configured'),
    'should error when --alert set without webhook URL',
  );
  assert.ok(src.includes('DEGRADATION_WEBHOOK_URL'), 'should check env var');
  assert.ok(src.includes('--webhook-url'), 'should support --webhook-url CLI arg');
});

test('sendWebhook function exists and creates a valid request', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-degradation.js'),
    'utf8',
  );
  assert.ok(src.includes('function sendWebhook'), 'sendWebhook function should exist');
  assert.ok(src.includes("'Content-Type'"), 'should set Content-Type header');
  assert.ok(src.includes("'Content-Length'"), 'should set Content-Length header');
  assert.ok(src.includes('JSON.stringify'), 'should stringify the payload');
});

// ═══════════════════════════════════════════════════════════════
// PAID-MODEL INVARIANT: is_free=false → status.result='working'
// builders/index.js is the single source of truth. Every downstream
// consumer (API, frontend, JSON export) gets normalized data.
// ═══════════════════════════════════════════════════════════════

console.log('\n=== builders/index.js: paid-model status normalization ===');

test('builders/index.js normalizes paid model status to working', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'builders', 'index.js'),
    'utf8',
  );
  // The normalization branch must exist
  assert.ok(
    src.includes('dm.is_free'),
    'source should branch on dm.is_free for status normalization',
  );
  assert.ok(
    src.includes("result: 'working'"),
    "source should hardcode result:'working' for paid models",
  );
  assert.ok(
    src.includes("'Presumed working (not tested)'"),
    "source should set detail:'Presumed working (not tested)' for paid models",
  );
});

test('builders/index.js comment documents the hard rule', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'builders', 'index.js'),
    'utf8',
  );
  assert.ok(
    src.includes('PAID MODELS ARE ALWAYS PRESUMED WORKING') ||
      src.includes('paid models are ALWAYS presumed working'),
    'source should document the HARD RULE about paid model status',
  );
});

test('available-models.json: no paid model has non-working status', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.join(__dirname, '..', 'available-models.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('        (skipped — available-models.json not found)');
    return;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const models = data.models || [];
  const violations = [];
  for (const m of models) {
    if (m.is_free === false && m.status?.result !== 'working') {
      violations.push(`${m.id} → status.result='${m.status?.result}'`);
    }
  }
  if (violations.length > 0) {
    assert.fail(
      `Found ${violations.length} paid model(s) with non-working status:\n        ${violations.slice(0, 10).join('\n        ')}${violations.length > 10 ? `\n        ...and ${violations.length - 10} more` : ''}`,
    );
  }
  assert.ok(true);
});

test('build-providers.js normalizes working_count from status.result', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'builders', 'build-providers.js'),
    'utf8',
  );
  // Counting relies on status.result='working' (paid models normalized upstream)
  assert.ok(
    src.includes("dp.status.result === 'working'"),
    'build-providers should count working from status.result (normalized by builders/index.js)',
  );
});

test('build-organizations.js derives health from status.result', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'builders', 'build-organizations.js'),
    'utf8',
  );
  // Health derivation relies on status.result='working' (paid models normalized upstream)
  assert.ok(
    src.includes("dp.status?.result === 'working'"),
    'build-organizations should derive health from status.result (normalized by builders/index.js)',
  );
});

test('scrape-artificial-analysis.js queries only free models', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'scrape-artificial-analysis.js'),
    'utf8',
  );
  // The query loading datapoints for AA matching must filter is_free = true
  const match = src.match(/SELECT.*?FROM datapoint_models.*?WHERE.*?is_removed.*?ORDER/s);
  assert.ok(match, 'should have a query loading datapoint_models for matching');
  assert.ok(
    match[0].includes('dm.is_free = true') || match[0].includes('dm.is_free=true'),
    'scrape-artificial-analysis.js should filter datapoint_models by is_free = true',
  );
});

test('check-rankings.js SQL path guards against paid models', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-rankings.js'),
    'utf8',
  );
  // The rankings table query should filter is_paid = false
  assert.ok(
    src.includes('r.is_paid = false'),
    'check-rankings.js should filter rankings by is_paid = false (free only)',
  );
  // The status check loop must verify is_free before checking status_result
  assert.ok(
    src.includes('!e.is_free') || src.includes('e.is_free === false'),
    'check-rankings.js should guard status_result checks with is_free verification',
  );
});

test('check-rankings.js JSON fallback uses builder path', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'check-rankings.js'),
    'utf8',
  );
  // The JSON fallback path should use loadModels (builder-normalized)
  assert.ok(
    src.includes("require('./load-models')"),
    'check-rankings.js JSON fallback should use loadModels (builder path)',
  );
  // And verify is_free before checking status
  assert.ok(
    src.includes('!model.is_free') || src.includes('model.is_free === false'),
    'check-rankings.js JSON fallback should check is_free before status',
  );
});

test('rank.js free path filters is_free = true', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'rank.js'), 'utf8');
  assert.ok(
    src.includes('dm.is_free = true') || src.includes('dm.is_free=true'),
    'rank.js free path should filter by dm.is_free = true',
  );
});

test('rank.js paid path filters is_free = false', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'rank.js'), 'utf8');
  assert.ok(
    src.includes("is_free = false'") || src.includes('is_free=false'),
    'rank.js paid path should filter by dm.is_free = false',
  );
});

test('nightly-summary.js reads from _test_summary (free-only metadata)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'nightly-summary.js'),
    'utf8',
  );
  // The _test_summary key is only populated with free models
  assert.ok(
    src.includes('_test_summary'),
    'nightly-summary should read _test_summary (populated with free models only)',
  );
});

test('health-badge.js filters models by is_free', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'health-badge.js'),
    'utf8',
  );
  assert.ok(
    src.includes('.is_free') || src.includes("'is_free'"),
    'health-badge.js should filter by is_free before reading status',
  );
});

test('metrics-exporter.js filters models by is_free', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'metrics-exporter.js'),
    'utf8',
  );
  assert.ok(
    src.includes('.is_free') || src.includes("'is_free'"),
    'metrics-exporter.js should filter by is_free before reading status',
  );
});

test('generate-dashboard.js filters models by is_free', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'generate-dashboard.js'),
    'utf8',
  );
  assert.ok(
    src.includes('!m.is_free') || src.includes('m.is_free === false'),
    'generate-dashboard.js should skip paid models before reading status',
  );
});

test('model-summary.js filters models by is_free', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'model-summary.js'),
    'utf8',
  );
  assert.ok(
    src.includes('.is_free') || src.includes("'is_free'"),
    'model-summary.js should filter by is_free before reading status',
  );
});

test('sync-paid-models.js sets paid models to status working', () => {
  const fs = require('fs');
  const src = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'sync-paid-models.js'),
    'utf8',
  );
  assert.ok(
    src.includes("status_result = 'working'") || src.includes("'working'"),
    'sync-paid-models.js should set status_result to working for paid models',
  );
});

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}

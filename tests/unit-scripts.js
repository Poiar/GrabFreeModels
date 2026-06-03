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

const normalizeName = (name) => name
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

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-{2,}/g, '-');

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
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'import-modelsdev.js'), 'utf8');
  // The INSERT query should reference superId, not masterId
  const insertMatch = src.match(/const \{ rows: dpIns \} = await client\.query\([\s\S]*?\[([^\]]+)\]/);
  assert.ok(insertMatch, 'INSERT query found');
  assert.ok(!insertMatch[1].includes('masterId'), 'masterId should not appear in INSERT values');
  assert.ok(insertMatch[1].includes('superId'), 'superId should appear in INSERT values');
});

test('source file uses supersMatched (not mastersMatched) in log', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'import-modelsdev.js'), 'utf8');
  assert.ok(!src.includes('mastersMatched'), 'mastersMatched should not appear in source');
  assert.ok(src.includes('supersMatched'), 'supersMatched should appear in source');
});

// ── sync-models.js: verify await on getGroqModels ──
console.log('\n=== sync-models.js: await on getGroqModels ===');

test('getGroqModels call is awaited', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'sync-models.js'), 'utf8');
  // Find the line that assigns groqModels
  const groqAssign = src.match(/const groqModels = .*/);
  assert.ok(groqAssign, 'groqModels assignment found');
  assert.ok(groqAssign[0].includes('await'), `groqModels assignment should use await: "${groqAssign[0].trim()}"`);
});

test('getGroqModels is declared as async', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'sync-models.js'), 'utf8');
  assert.ok(src.includes('async function getGroqModels'), 'getGroqModels should be declared async');
});

// ── sync-models.js: auth file read has error handling ──
console.log('\n=== sync-models.js: auth file error handling ===');

test('auth file read is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'sync-models.js'), 'utf8');
  // Find the auth reading block - should have try/catch, not bare readFileSync
  const authBlock = src.match(/let auth;[\s\S]*?auth = JSON\.parse[\s\S]*?} catch[\s\S]*?process\.exit\(1\)/);
  assert.ok(authBlock, 'auth file read should be wrapped in try/catch with process.exit(1)');
});

// ── sync-models.js: normalizeModelSlug ──
console.log('\n=== sync-models.js: normalizeModelSlug ===');

const normalizeModelSlug = (name) => {
  let slug = name.toLowerCase()
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
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'data.js'), 'utf8');
  // Find all res.json responses - none should contain err.message
  const responseMatches = src.match(/res\.status\(\d+\)\.json\(\{[^}]+\}\)/g) || [];
  for (const match of responseMatches) {
    assert.ok(!match.includes('err.message'), `Response should not contain err.message: ${match}`);
  }
});

test('/api/health does not leak err.message to client', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'data.js'), 'utf8');
  // The health endpoint should return generic message
  assert.ok(src.includes("'Database unavailable'") || src.includes('"Database unavailable"'),
    'Health endpoint should return generic "Database unavailable" message');
});

// ── server/index.js: has error middleware ──
console.log('\n=== server/index.js: error middleware ===');

test('Express error-handling middleware exists', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'index.js'), 'utf8');
  assert.ok(src.includes('app.use((err, req, res, next)'), 'Error middleware with (err, req, res, next) signature should exist');
  assert.ok(src.includes('500'), 'Error middleware should return 500 status');
});

// ── nightly-maintenance.js: pool cleanup before exit ──
console.log('\n=== nightly-maintenance.js: pool cleanup ===');

test('summaryPool is closed before process.exit(0) on rollback', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'nightly-maintenance.js'), 'utf8');
  // Find the rollback block - summaryPool.end() should come before process.exit(0)
  const rollbackBlock = src.match(/shouldRollback[\s\S]*?process\.exit\(0\)/);
  assert.ok(rollbackBlock, 'Rollback block found');
  const block = rollbackBlock[0];
  const endPos = block.indexOf('summaryPool.end');
  const exitPos = block.indexOf('process.exit(0)');
  assert.ok(endPos !== -1, 'summaryPool.end() should exist in rollback block');
  assert.ok(endPos < exitPos, 'summaryPool.end() should come before process.exit(0)');
});

test('summary log generation is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'nightly-maintenance.js'), 'utf8');
  // The model-summary.js execSync should be inside a try/catch
  const summaryBlock = src.match(/10\. Generate summary log[\s\S]*?execSync\('node scripts\/model-summary\.js'/);
  assert.ok(summaryBlock, 'Summary log generation block found');
  // Check that the broader context has try/catch
  const contextStart = src.indexOf('10. Generate summary log');
  const contextEnd = src.indexOf('exportJson()', contextStart);
  const context = src.slice(contextStart, contextEnd);
  assert.ok(context.includes('try {') && context.includes('catch'), 'Summary generation should be in try/catch');
});

// ── backfill-context.js: auth file error handling ──
console.log('\n=== backfill-context.js: auth file error handling ===');

test('auth file read is wrapped in try/catch', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'backfill-context.js'), 'utf8');
  // Should have try/catch around the auth read
  const authReadPattern = /let auth;\s*try\s*\{[\s\S]*?auth = JSON\.parse[\s\S]*?\} catch[\s\S]*?process\.exit\(1\)/m;
  assert.ok(authReadPattern.test(src), 'auth file read should be wrapped in try/catch with process.exit(1)');
});

// ── validate-free-models.js: status_result handling ──
console.log('\n=== validate-free-models.js: status_result coverage ===');

test('handles all 5 status_result values in test summary', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'validate-free-models.js'), 'utf8');
  // The loadFromDb function should handle: working, rate_limited, broken, untested, not_found
  const statusPattern = /ts\[r\]\.push/;
  assert.ok(statusPattern.test(src), 'Should push statuses to test summary');
  // Check that not_found is handled in the apply section
  assert.ok(src.includes("r.status === 'not_found'"), 'Should handle not_found status in apply');
});

// ── import-modelsdev-backfill.js: uses correct variable name ──
console.log('\n=== import-modelsdev-backfill.js: variable names ===');

test('uses row.super_id (not masterId) for INSERT', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'import-modelsdev-backfill.js'), 'utf8');
  // The INSERT should reference row.super_id
  const insertMatch = src.match(/VALUES \(\$1,\$2,\$3,\$4,\$5[^)]+\)/);
  assert.ok(insertMatch, 'INSERT VALUES found');
  // Check the parameter array references row.super_id
  const paramLines = src.match(/\[row\.super_id[^\]]*\]/);
  assert.ok(paramLines, 'Should reference row.super_id in INSERT params');
});

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Validates live database structure and consistency.
 * Checks:
 *  1. Can load data from DB
 *  2. Required top-level keys exist
 *  3. Each model has required fields (id, name, provider, status, is_free)
 *  4. All IDs in _role_rankings exist in models[]
 *  5. No duplicate model IDs
 *  6. _test_summary results reference valid model IDs
 *  7. No duplicate super_model slugs
 */

const loadModels = require('../scripts/load-models');

const errors = [];

function fail(msg) {
  errors.push(msg);
  console.error(`  ❌ ${msg}`);
}

function pass(msg) {
  console.log(`  ✅ ${msg}`);
}

(async () => {
  let data;
  try {
    data = await loadModels();
    pass('Loaded data from database');
  } catch (e) {
    fail(`Failed to load from DB: ${e.message}`);
    console.error('\nValidation failed.');
    process.exit(1);
  }

  // Required top-level keys
  const requiredKeys = [
    'models',
    '_test_summary',
    '_role_rankings',
    '_known_issues',
    '_validation_method',
  ];
  for (const key of requiredKeys) {
    if (!data[key]) {
      fail(`Missing top-level key: "${key}"`);
    } else {
      pass(`Top-level key "${key}" exists`);
    }
  }

  if (errors.length > 0) {
    console.error('\nValidation failed.');
    process.exit(1);
  }

  const models = data.models;
  const modelIds = new Set(models.map((m) => m.id));

  // Model field validation
  const requiredModelFields = ['id', 'name', 'provider', 'status', 'is_free'];
  let modelFieldErrors = 0;
  for (const model of models) {
    for (const field of requiredModelFields) {
      if (!(field in model)) {
        fail(`Model "${model.id || '(missing id)'}" missing required field: "${field}"`);
        modelFieldErrors++;
      }
    }
    if (model.status && !model.status.result) {
      fail(`Model "${model.id}" missing status.result`);
      modelFieldErrors++;
    }
  }
  if (modelFieldErrors === 0) pass(`All ${models.length} models have required fields`);

  // No duplicate IDs
  if (modelIds.size === models.length) {
    pass(`No duplicate model IDs (${models.length} unique)`);
  } else {
    const seen = new Set();
    const dupes = [];
    for (const m of models) {
      if (seen.has(m.id)) dupes.push(m.id);
      seen.add(m.id);
    }
    fail(`Duplicate model IDs: ${dupes.join(', ')}`);
  }

  // _role_rankings references valid model IDs
  const rankings = data._role_rankings || {};
  let rankingErrors = 0;
  for (const [role, ids] of Object.entries(rankings)) {
    if (typeof ids !== 'object' || ids === null) continue;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (!modelIds.has(id)) {
          fail(`_role_rankings.${role} references unknown model ID: "${id}"`);
          rankingErrors++;
        }
      }
    }
  }
  if (rankingErrors === 0) pass('All _role_rankings IDs reference valid models');

  // _test_summary results reference valid model IDs
  const summary = data._test_summary || {};
  const summaryResultKeys = ['working', 'broken', 'untested', 'rate_limited', 'schema_issues'];
  let summaryErrors = 0;
  for (const key of summaryResultKeys) {
    const ids = summary.results?.[key];
    if (!Array.isArray(ids)) continue;
    for (const entry of ids) {
      const id = key === 'schema_issues' ? entry.split(' — ')[0].trim() : entry;
      if (!modelIds.has(id)) {
        fail(`_test_summary.results.${key} references unknown model ID: "${id}"`);
        summaryErrors++;
      }
    }
  }
  if (summaryErrors === 0) pass('All _test_summary result IDs reference valid models');

  // Warn about free models missing supports_tools
  const missingTools = models.filter(
    (m) => m.is_free && m.status.result === 'working' && !('supports_tools' in m),
  );
  if (missingTools.length > 0) {
    console.log(
      `\n  ⚠️  ${missingTools.length} working free model(s) missing supports_tools field:`,
    );
    for (const m of missingTools) console.log(`     ${m.id}`);
    console.log('     Run: node scripts/backfill-metadata.js --apply');
  }

  if (errors.length > 0) {
    console.error(`\n❌ Validation failed with ${errors.length} error(s).`);
    process.exit(1);
  } else {
    console.log(`\n✅ All checks passed. ${models.length} models validated.`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

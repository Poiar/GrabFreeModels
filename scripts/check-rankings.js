#!/usr/bin/env node
/**
 * check-rankings.js
 * Verifies rankings integrity against the rankings table (migration 037).
 * Falls back to JSON-based check if rankings table doesn't exist yet.
 *
 * Checks:
 *   - All full_ids in rankings exist in datapoint_models (FK enforces this)
 *   - No duplicates (UNIQUE constraint enforces this)
 *   - All ranked models are free, working, not removed, and support tools
 *   - No used-up providers (current month from _provider_usage metadata)
 *
 * Usage: node scripts/check-rankings.js
 */

require('dotenv').config();
const pool = require('../server/db');

(async () => {
  let allGood = true;

  function fail(msg) {
    console.error(`  ❌ ${msg}`);
    allGood = false;
  }

  function ok(msg) {
    console.log(`  ✓ ${msg}`);
  }

  const client = await pool.connect();
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usedUpProviders = [];

    // Load used-up providers from metadata
    const { rows: usageRows } = await client.query(
      "SELECT value::text FROM metadata WHERE key = '_provider_usage'"
    );
    if (usageRows.length > 0) {
      const usage = JSON.parse(usageRows[0].value);
      console.log(`Checking _provider_usage for month ${currentMonth}...`);
      for (const [key, entry] of Object.entries(usage)) {
        if (key === 'description') continue;
        if (entry && entry.month === currentMonth) {
          usedUpProviders.push(key);
          console.log(`  Provider '${key}' marked as used-up: ${entry.reason}`);
        }
      }
      if (usedUpProviders.length === 0) {
        console.log('  No providers used-up this month.');
      }
      console.log('');
    }

    // ── Try rankings table first ──
    let rankingsRows;
    try {
      const { rows } = await client.query(`
        SELECT r.role, r.full_id, r.rank, r.variant, r.is_paid,
               dm.is_free, dm.is_removed, dm.status_result, dm.supports_tools,
               dp.slug AS provider_slug, dp.name AS provider_name
        FROM rankings r
        JOIN datapoint_models dm ON dm.full_id = r.full_id
        JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
        WHERE r.is_paid = false
        ORDER BY r.role, r.rank
      `);
      rankingsRows = rows;
      if (rows.length === 0) {
        console.log('Rankings table is empty — no rankings to check.');
        process.exit(0);
      }
      ok(`Loaded ${rows.length} ranking entries from rankings table`);
    } catch {
      console.log('Rankings table not available — falling back to JSON-based check.');
      await checkFromJson(usedUpProviders);
      return;
    }

    // Group by role
    const byRole = new Map();
    for (const r of rankingsRows) {
      if (r.variant !== 'combined') continue; // only check base rankings
      if (!byRole.has(r.role)) byRole.set(r.role, []);
      byRole.get(r.role).push(r);
    }

    for (const [role, entries] of byRole) {
      console.log(`\nChecking role: ${role} (${entries.length} models)`);

      // Check ordering: ranks should be 1,2,3,... without gaps
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].rank !== i + 1) {
          fail(`Rank gap at position ${i + 1}: expected rank ${i + 1}, got ${entries[i].rank} (${entries[i].full_id})`);
        }
      }

      for (const e of entries) {
        // Used-up provider check
        if (usedUpProviders.includes(e.provider_slug)) {
          fail(`${e.full_id} is from used-up provider '${e.provider_slug}' in ${role}`);
        }
        // Removed check
        if (e.is_removed) {
          fail(`${e.full_id} is removed in ${role}`);
        }
        // Free check
        if (!e.is_free) {
          fail(`${e.full_id} is not free in ${role}`);
        }
        // Status check
        if (e.status_result === 'broken') {
          fail(`${e.full_id} has status 'broken' in ${role}`);
        }
        if (e.status_result === 'rate_limited') {
          fail(`${e.full_id} has status 'rate_limited' in ${role}`);
        }
        // Tools check
        if (e.supports_tools !== true) {
          fail(`${e.full_id} lacks supports_tools=true in ${role}`);
        }
      }
    }

    if (allGood) {
      console.log('\nAll rankings are valid.');
    } else {
      process.exit(1);
    }
  } finally {
    client.release();
  }

  // ── Fallback: JSON-based check (legacy) ──
  async function checkFromJson(usedUpProviders) {
    const loadModels = require('./load-models');
    const json = await loadModels();
    const modelIds = json.models.map((m) => m.id);
    const modelIdSet = new Set(modelIds);

    const rankings = json._role_rankings;
    for (const role of Object.keys(rankings)) {
      if (role === 'description') continue;
      const list = rankings[role];
      if (!Array.isArray(list)) continue;

      console.log(`Checking role: ${role}`);

      for (const id of list) {
        if (!modelIdSet.has(id)) {
          fail(`Missing model ID: ${id}`);
        }
        const model = json.models.find((m) => m.id === id);
        const providerName = model
          ? model.provider
          : id.indexOf('/') === -1
            ? id
            : id.substring(0, id.indexOf('/'));
        if (usedUpProviders.includes(providerName)) {
          fail(`Model '${id}' is from used-up provider '${providerName}' in ${role}`);
        }
        if (model) {
          if (model._removed) fail(`Model '${id}' is removed in ${role}`);
          if (!model.is_free) fail(`Model '${id}' is not free in ${role}`);
          if (model.status.result === 'broken') fail(`Model '${id}' has status 'broken' in ${role}`);
          if (model.status.result === 'rate_limited') fail(`Model '${id}' has status 'rate_limited' in ${role}`);
          if (model.supports_tools !== true) fail(`Model '${id}' lacks supports_tools=true in ${role}`);
        }
      }

      const seen = new Set();
      for (const id of list) {
        if (seen.has(id)) {
          const count = list.filter((x) => x === id).length;
          fail(`Duplicate ID in ${role}: ${id} (appears ${count} times)`);
        }
        seen.add(id);
      }
    }

    if (allGood) console.log('All rankings are valid.');
    else process.exit(1);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

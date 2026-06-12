#!/usr/bin/env node
/**
 * backfill-derivations.js
 * Detects derivation methods and immediate parent models for all existing
 * super_models, then updates derivation_method and base_model columns.
 *
 * Usage:
 *   node scripts/backfill-derivations.js          # dry-run
 *   node scripts/backfill-derivations.js --apply  # write to DB
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { detectDerivationMethod, findImmediateParent } = require('./utils/derivation-detector');
const { wouldCreateCycle } = require('./utils/safe-chain-walker');

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
  connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();

  try {
    // Load all active super_models
    const { rows: models } = await client.query(`
      SELECT sm.id, sm.name, sm.slug, sm.creator, sm.derivation_method, sm.base_model
      FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
      ORDER BY sm.name
    `);

    console.log(`Loaded ${models.length} active super_models.\n`);

    // Build candidate map (all models can be parents)
    const candidates = new Map(models.map((m) => [m.slug, { name: m.name, slug: m.slug }]));

    const derivAssignments = []; // { id, name, old_method, new_method }
    const parentAssignments = []; // { id, name, old_base, new_base, parent_name }
    let derivChanges = 0;
    let parentChanges = 0;

    for (const model of models) {
      const newMethod = detectDerivationMethod(model.name);

      // Derivation method
      if (!model.derivation_method && newMethod) {
        derivAssignments.push({
          id: model.id,
          name: model.name,
          old_method: model.derivation_method,
          new_method: newMethod,
        });
        derivChanges++;
      }

      // Parent model
      if (newMethod) {
        const parent = findImmediateParent(model.name, candidates);
        const parentSlug = parent ? parent.parentSlug : null;

        if (!model.base_model && parentSlug) {
          parentAssignments.push({
            id: model.id,
            name: model.name,
            slug: model.slug,
            old_base: model.base_model,
            new_base: parentSlug,
            parent_name: parent.parentName,
          });
          parentChanges++;
        }
      }
    }

    // Summary
    const methodCounts = {};
    for (const a of derivAssignments) {
      methodCounts[a.new_method] = (methodCounts[a.new_method] || 0) + 1;
    }
    console.log('Derivation method assignments:');
    for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${method}: ${count}`);
    }
    console.log(`  Total: ${derivChanges} new derivations\n`);

    console.log(`Parent model assignments: ${parentChanges}`);
    const parentCounts = {};
    for (const a of parentAssignments) {
      parentCounts[a.parent_name] = (parentCounts[a.parent_name] || 0) + 1;
    }
    console.log('Top parent models:');
    const topParents = Object.entries(parentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [name, count] of topParents) {
      console.log(`  ${name}: ${count} derivatives`);
    }

    // Show sample derivations
    console.log('\nSample derivation assignments:');
    for (const a of derivAssignments.slice(0, 20)) {
      console.log(`  ${a.name} → ${a.new_method}`);
    }

    // Show sample parent mappings
    console.log('\nSample parent mappings:');
    for (const a of parentAssignments.slice(0, 20)) {
      console.log(`  ${a.name} → ${a.parent_name} (${a.new_base})`);
    }

    // Show models that got derivation method but no parent
    const noParent = derivAssignments.filter(a =>
      !parentAssignments.some(p => p.id === a.id)
    );
    if (noParent.length > 0) {
      console.log(`\nModels with derivation but no parent found: ${noParent.length}`);
      for (const a of noParent.slice(0, 15)) {
        console.log(`  ${a.name} (${a.new_method})`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Cycle guard: filter out parent assignments that would create cycles
    // ═══════════════════════════════════════════════════════════
    const existingParentMap = new Map();
    for (const m of models) {
      if (m.base_model) existingParentMap.set(m.slug, m.base_model);
    }
    // Include pending assignments in the map (only those that won't cycle)
    const safeParents = [];
    const cycleRejected = [];
    for (const a of parentAssignments) {
      if (a.slug === a.new_base) {
        cycleRejected.push({ ...a, reason: 'self-reference' });
        continue;
      }
      if (wouldCreateCycle(a.slug, a.new_base, existingParentMap)) {
        cycleRejected.push({ ...a, reason: 'would create cycle' });
        continue;
      }
      safeParents.push(a);
      // Add to parent map so subsequent checks in this batch see it
      existingParentMap.set(a.slug, a.new_base);
    }
    if (cycleRejected.length > 0) {
      console.log(`\n⛔ Cycle guard: rejected ${cycleRejected.length} parent assignments:`);
      for (const r of cycleRejected.slice(0, 10)) {
        console.log(`  ${r.name} → ${r.parent_name} (${r.reason})`);
      }
      if (cycleRejected.length > 10) console.log(`  ... and ${cycleRejected.length - 10} more`);
    }

    if (!APPLY) {
      console.log(`\nDry run — use --apply to write ${derivChanges + safeParents.length} updates${cycleRejected.length > 0 ? ` (${cycleRejected.length} rejected by cycle guard)` : ''}.`);
      return;
    }

    // Write derivation methods
    console.log('\nApplying...');
    let updated = 0;
    for (const a of derivAssignments) {
      await client.query(
        'UPDATE super_models SET derivation_method = $1 WHERE id = $2 AND derivation_method IS NULL',
        [a.new_method, a.id],
      );
      updated++;
    }

    // Write parent models (only safe ones)
    for (const a of safeParents) {
      await client.query(
        'UPDATE super_models SET base_model = $1 WHERE id = $2 AND base_model IS NULL',
        [a.new_base, a.id],
      );
      updated++;
    }

    console.log(`Applied ${updated} updates total (${derivChanges} derivation + ${parentChanges} base_model).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

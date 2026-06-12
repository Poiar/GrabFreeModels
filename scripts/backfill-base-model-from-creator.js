#!/usr/bin/env node
/**
 * backfill-base-model-from-creator.js
 * For models with base_creator but no base_model, tries to find the
 * specific parent super_model by matching the child name against
 * existing super_models using the derivation-detector's parent finder.
 *
 * Usage:
 *   node scripts/backfill-base-model-from-creator.js          # dry-run
 *   node scripts/backfill-base-model-from-creator.js --apply  # write to DB
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { findImmediateParent } = require('./utils/derivation-detector');
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
      SELECT sm.id, sm.name, sm.slug, sm.creator, sm.base_creator, sm.base_model
      FROM super_models sm
      WHERE sm.base_creator IS NOT NULL
        AND sm.base_model IS NULL
        AND EXISTS (
          SELECT 1 FROM datapoint_models dm
          WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
        )
      ORDER BY sm.name
    `);

    console.log(`Loaded ${models.length} models with base_creator but no base_model.\n`);

    // Build candidate map from ALL active models
    const { rows: allModels } = await client.query(`
      SELECT sm.name, sm.slug FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
    `);
    const candidates = new Map(allModels.map((m) => [m.slug, { name: m.name, slug: m.slug }]));

    const assignments = [];
    let found = 0;
    let notFound = 0;
    const skippedCycles = [];

    // Build existing parent map for cycle detection (only models that already have base_model)
    const existingParentMap = new Map();
    for (const m of models) {
      if (m.base_model) existingParentMap.set(m.slug, m.base_model);
    }

    for (const model of models) {
      const parent = findImmediateParent(model.name, candidates);
      if (parent) {
        // Self-reference guard
        if (model.slug === parent.parentSlug) {
          skippedCycles.push({ ...model, reason: 'self-reference' });
          continue;
        }
        // Direction heuristic: if the child appears to be a base/foundation model
        // and the parent appears to be a fine-tune/instruct/chat variant, the
        // actual relationship is reversed — the child is the parent in reality.
        const childLower = model.name.toLowerCase();
        const parentLower = parent.parentName.toLowerCase();
        const childIsBase = /\b(base|foundation|pretrain|pre-train)\b/i.test(childLower);
        const parentIsDerived = /\b(instruct|chat|dpo|sft|rlhf|lora|awq|gguf|quant|fp\d|int\d|imatrix)\b/i.test(parentLower);
        if (childIsBase && parentIsDerived) {
          skippedCycles.push({ ...model, reason: 'direction: child is base, parent is fine-tune' });
          continue;
        }
        // Cycle guard
        if (wouldCreateCycle(model.slug, parent.parentSlug, existingParentMap)) {
          skippedCycles.push({ ...model, reason: 'would create cycle' });
          continue;
        }
        assignments.push({
          id: model.id,
          name: model.name,
          slug: model.slug,
          base_creator: model.base_creator,
          new_base: parent.parentSlug,
          parent_name: parent.parentName,
        });
        // Track in the live map so subsequent assignments in this batch don't create cycles
        existingParentMap.set(model.slug, parent.parentSlug);
        found++;
      } else {
        notFound++;
      }
    }

    // Summary
    console.log(`Found parent for: ${found}`);
    console.log(`No parent found:  ${notFound}`);
    if (skippedCycles.length > 0) {
      console.log(`Cycle guard skipped: ${skippedCycles.length}`);
      for (const s of skippedCycles.slice(0, 5)) {
        console.log(`  ⛔ ${s.name} — ${s.reason}`);
      }
    }
    console.log();

    // Group by parent
    const parentCounts = {};
    for (const a of assignments) {
      parentCounts[a.parent_name] = (parentCounts[a.parent_name] || 0) + 1;
    }
    const topParents = Object.entries(parentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    console.log('Top parents:');
    for (const [name, count] of topParents) {
      console.log(`  ${name}: ${count}`);
    }

    console.log('\nSample mappings:');
    for (const a of assignments.slice(0, 25)) {
      console.log(`  ${a.name} (via ${a.base_creator}) → ${a.parent_name}`);
    }

    if (!APPLY) {
      console.log(`\nDry run — use --apply to write ${assignments.length} updates${skippedCycles.length > 0 ? ` (${skippedCycles.length} rejected by cycle guard)` : ''}.`);
      return;
    }

    console.log('\nApplying...');
    let updated = 0;
    for (const a of assignments) {
      await client.query(
        'UPDATE super_models SET base_model = $1 WHERE id = $2 AND base_model IS NULL',
        [a.new_base, a.id],
      );
      updated++;
    }
    console.log(`Applied ${updated} base_model updates.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

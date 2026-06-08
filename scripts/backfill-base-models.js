// Backfill base_model feature: link fine-tunes to their parent super_model.
// Detects fine-tunes by checking if a model's name contains another model's name.
// Longest substring match wins (most specific parent).
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();

  try {
    // Load all active super_models
    const { rows: models } = await client.query(`
      SELECT sm.id, sm.name, sm.slug, sm.creator
      FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
      ORDER BY sm.name DESC
    `);

    console.log(`Loaded ${models.length} active super_models.\n`);

    // Build lookup: slug → model info
    const bySlug = new Map();
    for (const m of models) {
      bySlug.set(m.slug, m);
    }

    // For each model, find the best parent by substring matching
    const assignments = []; // { child_id, child_name, parent_slug, parent_name, match_len }
    const noParent = [];

    // Compute slug the same way as build-models-data.js
    function nameToSlug(name) {
      return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    for (const child of models) {
      let bestParent = null;
      let bestLen = 0;
      const childNameLower = child.name.toLowerCase();

      for (const candidate of models) {
        if (candidate.id === child.id) continue;

        const candNameLower = candidate.name.toLowerCase();

        // Skip if both names normalize to the same slug (case difference only)
        if (candidate.slug === child.slug) continue;

        // Also skip when names are identical after normalization (case variants like "Voxtral-Small-24B-2507" vs "voxtral-small-24b-2507")
        if (nameToSlug(child.name) === nameToSlug(candidate.name)) continue;

        // Parent name must be a substring of the child name
        if (!childNameLower.includes(candNameLower)) continue;

        // Filter trivial matches: parent must contain a digit OR be >= 6 chars
        const hasDigit = /\d/.test(candNameLower);
        if (!hasDigit && candNameLower.length < 6) continue;

        // Skip if the candidate name is a common word that would cause false matches
        // (very short generic names)
        if (candNameLower.length < 4) continue;

        // Prefer longest match
        if (candNameLower.length > bestLen) {
          bestLen = candNameLower.length;
          bestParent = candidate;
        }
      }

      if (bestParent) {
        assignments.push({
          child_id: child.id,
          child_name: child.name,
          parent_slug: nameToSlug(bestParent.name),
          parent_name: bestParent.name,
          match_len: bestLen,
        });
      } else {
        noParent.push(child.name);
      }
    }

    console.log(`Matched: ${assignments.length}  No parent found: ${noParent.length}`);

    // Show stats by base model family
    const parentCounts = {};
    for (const a of assignments) {
      parentCounts[a.parent_name] = (parentCounts[a.parent_name] || 0) + 1;
    }
    console.log('\nTop parent models:');
    const topParents = Object.entries(parentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [name, count] of topParents) {
      console.log(`  ${name}: ${count} children`);
    }

    // Show some example assignments
    console.log('\nExample assignments:');
    for (const a of assignments.slice(0, 15)) {
      console.log(`  ${a.child_name}  →  ${a.parent_name}`);
    }

    // Show chains (models that are both parent and child)
    const childSlugs = new Set(assignments.map(a => bySlug.get(a.child_id)?.slug));
    const parentSlugs = new Set(assignments.map(a => a.parent_slug));
    const chainModels = [...childSlugs].filter(s => parentSlugs.has(s));
    if (chainModels.length > 0) {
      console.log(`\nChain models (both parent and child): ${chainModels.length}`);
      for (const s of chainModels.slice(0, 10)) {
        const children = assignments.filter(a => a.parent_slug === s);
        const parent = assignments.find(a => bySlug.get(a.child_id)?.slug === s);
        console.log(`  ${s}: parent=(${parent?.parent_name || 'none'}), children=(${children.map(c => c.child_name).join(', ')})`);
      }
    }

    const dryRun = !process.argv.includes('--apply');
    if (dryRun) {
      console.log(`\nDry run — use --apply to insert ${assignments.length} base_model features.`);
      return;
    }

    // Insert base_model features for each assignment
    let inserted = 0;
    for (const a of assignments) {
      // Get all active datapoints for this super_model
      const { rows: dps } = await client.query(
        'SELECT id FROM datapoint_models WHERE super_model_id = $1 AND NOT is_removed',
        [a.child_id]
      );
      if (dps.length === 0) continue;

      for (const dp of dps) {
        await client.query(
          'INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [dp.id, 'base_model', a.parent_slug]
        );
        inserted++;
      }
    }

    console.log(`\nInserted ${inserted} base_model features.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

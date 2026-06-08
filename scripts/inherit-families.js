// Inherit family from base_model parent chain.
// For models that have no family feature, walk up the base_model chain
// and inherit the first family found from an ancestor.
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });

function nameToSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const client = await pool.connect();

  try {
    // Load all active super_models
    const { rows: allModels } = await client.query(`
      SELECT sm.id, sm.name, sm.slug
      FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
      ORDER BY sm.name
    `);
    console.log(`Loaded ${allModels.length} active super_models.\n`);

    // Build parent lookups
    const modelByDbSlug = new Map();   // slug in DB → model
    const modelByNormSlug = new Map(); // nameToSlug(name) → model[]
    for (const m of allModels) {
      modelByDbSlug.set(m.slug, m);
      const ns = nameToSlug(m.name);
      if (!modelByNormSlug.has(ns)) modelByNormSlug.set(ns, []);
      modelByNormSlug.get(ns).push(m);
    }

    // Helper: resolve a base_model slug value to a super_model
    function resolveParent(slug) {
      const byDb = modelByDbSlug.get(slug);
      if (byDb) return byDb;
      const byNorm = modelByNormSlug.get(slug);
      if (byNorm && byNorm.length > 0) return byNorm[0];
      return null;
    }

    // Load all base_model features (parent links)
    const { rows: bmFeatures } = await client.query(`
      SELECT dm.super_model_id, df.value AS parent_slug
      FROM datapoint_model_features df
      JOIN datapoint_models dm ON dm.id = df.datapoint_model_id
      WHERE df.feature_type = 'base_model' AND NOT dm.is_removed
    `);
    console.log(`Loaded ${bmFeatures.length} base_model feature links.`);

    // Build child super_model_id → parent_slug (deduplicated)
    const baseModelMap = new Map();
    for (const f of bmFeatures) {
      if (!baseModelMap.has(f.super_model_id)) {
        baseModelMap.set(f.super_model_id, f.parent_slug);
      }
    }

    // Preload ALL existing family assignments from super_models
    const { rows: familyRows } = await client.query(`
      SELECT id AS super_model_id, family
      FROM super_models
      WHERE family IS NOT NULL
    `);
    const familyMap = new Map(familyRows.map(r => [r.super_model_id, r.family]));
    console.log(`Loaded ${familyMap.size} super_models with family.\n`);

    const dryRun = !process.argv.includes('--apply');

    // Multi-pass inheritance: each pass may resolve new assignments that
    // enable further resolutions in subsequent passes (handles 3-4 deep chains).
    let currentFamilyMap = new Map(familyRows.map(r => [r.super_model_id, r.family]));
    let pass = 0;
    const allPassAssignments = [];

    while (true) {
      pass++;

      // Find models WITHOUT family in the current state
      const noFamily = allModels.filter(m => !currentFamilyMap.has(m.id));
      if (noFamily.length === 0) {
        console.log(`Pass ${pass}: All models have family.`);
        break;
      }

      // Walk the base_model chain for each model without family
      const inheritAssignments = [];

      for (const child of noFamily) {
        if (!baseModelMap.has(child.id)) continue;

        let currentId = child.id;
        const visited = new Set();
        const chainNames = [child.name];
        let foundFamily = null;

        while (baseModelMap.has(currentId)) {
          if (visited.has(currentId)) break; // cycle guard
          visited.add(currentId);

          const parentSlug = baseModelMap.get(currentId);
          const parent = resolveParent(parentSlug);
          if (!parent) {
            chainNames.push(`(${parentSlug} — not found)`);
            break;
          }

          chainNames.push(parent.name);

          // Does this parent have a family?
          const pf = currentFamilyMap.get(parent.id);
          if (pf) {
            foundFamily = pf;
            break;
          }

          currentId = parent.id;
        }

        if (foundFamily) {
          inheritAssignments.push({
            child_id: child.id,
            child_name: child.name,
            family: foundFamily,
            chain: chainNames.join(' → '),
          });
        }
      }

      if (inheritAssignments.length === 0) {
        console.log(`Pass ${pass}: No new family assignments. ${noFamily.length} models still unresolvable.\n`);
        break;
      }

      // Log per-pass stats
      console.log(`\nPass ${pass}: ${inheritAssignments.length} models can inherit family.`);

      const familyCounts = {};
      for (const a of inheritAssignments) {
        familyCounts[a.family] = (familyCounts[a.family] || 0) + 1;
      }
      console.log('By family:');
      for (const [f, c] of Object.entries(familyCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${f}: ${c}`);
      }

      console.log('Example assignments:');
      for (const a of inheritAssignments.slice(0, 10)) {
        console.log(`  ${a.chain}  →  family: ${a.family}`);
      }
      if (inheritAssignments.length > 10) {
        console.log(`  ... and ${inheritAssignments.length - 10} more`);
      }

      allPassAssignments.push({ pass, assignments: inheritAssignments });

      // Update the in-memory family map so the next pass can use newly-assigned families
      for (const a of inheritAssignments) {
        currentFamilyMap.set(a.child_id, a.family);
      }

      if (dryRun) {
        console.log(`  (dry run — will apply in real run)`);
        continue;
      }

      // Update super_models.family
      let updated = 0;
      for (const a of inheritAssignments) {
        await client.query(
          'UPDATE super_models SET family = $1 WHERE id = $2 AND family IS NULL',
          [a.family, a.child_id]
        );
        updated++;
      }

      console.log(`  Updated ${updated} super_models with family.`);
    }

    // Final summary
    const totalAssignments = allPassAssignments.reduce((s, p) => s + p.assignments.length, 0);
    if (dryRun) {
      const uncovered = allModels.filter(m => !currentFamilyMap.has(m.id)).length;
      const couldStillUse = allModels.filter(m => !currentFamilyMap.has(m.id) && baseModelMap.has(m.id)).length;
      console.log(`\nDry run — total across ${pass} passes: ${totalAssignments} models would inherit family.`);
      console.log(`Models still without family: ${uncovered} (${couldStillUse} of those have base_model links — may resolve once parents get family).`);
      console.log('Use --apply to update super_models.family.');
    } else {
      // Verify: how many still don't have family?
      const { rows: stillMissing } = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM super_models sm
        WHERE EXISTS (
          SELECT 1 FROM datapoint_models dm WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
        )
        AND sm.family IS NULL
      `);
      const uncovered = stillMissing[0].cnt;

      // Of the remaining, how many have base_model links (could be resolved if parents get family later)?
      const { rows: couldStillUse } = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM super_models sm
        WHERE EXISTS (
          SELECT 1 FROM datapoint_models dm WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
        )
        AND sm.family IS NULL
        AND EXISTS (
          SELECT 1 FROM datapoint_models dm3
          JOIN datapoint_model_features df2 ON df2.datapoint_model_id = dm3.id AND df2.feature_type = 'base_model'
          WHERE dm3.super_model_id = sm.id
        )
      `);
      console.log(`\nModels still without family: ${uncovered} (${couldStillUse[0].cnt} of those have base_model links — may resolve once parents get family).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

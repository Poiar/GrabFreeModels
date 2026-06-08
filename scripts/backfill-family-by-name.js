// Backfill families for super_models by name-pattern matching against known families.
// For models without family, tokenizes both the model name and known family names
// and assigns the most prevalent family whose tokens appear consecutively in the model name.
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });

const EXCLUDED_WORDS = new Set([
  'small', 'large', 'mini', 'fast', 'pro', 'lite',
  'free', 'chat', 'vision', 'reasoning', 'tool', 'use',
  'model', 'models', 'open', 'source', 'weights',
]);

function familyMatchesName(family, modelName) {
  const famLower = family.toLowerCase();
  if (famLower.length < 4) return false;
  const modelTokens = modelName.toLowerCase().split(/[-_\s]+/);
  const familyTokens = famLower.split(/[-_\s]+/);
  for (let i = 0; i <= modelTokens.length - familyTokens.length; i++) {
    let match = true;
    for (let j = 0; j < familyTokens.length; j++) {
      if (modelTokens[i + j] !== familyTokens[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

async function main() {
  const client = await pool.connect();

  try {
    // Load known families with prevalence counts, excluding Uncategorized
    const { rows: familyRows } = await client.query(`
      SELECT df.value AS family, COUNT(DISTINCT dm.super_model_id) AS cnt
      FROM datapoint_model_features df
      JOIN datapoint_models dm ON dm.id = df.datapoint_model_id
      WHERE df.feature_type = 'family' AND df.value != 'Uncategorized' AND NOT dm.is_removed
      GROUP BY df.value
      ORDER BY cnt DESC
    `);
    console.log(`Loaded ${familyRows.length} known families (sorted by prevalence):\n`);
    for (const f of familyRows.slice(0, 20)) {
      console.log(`  ${f.family}: ${f.cnt} models`);
    }
    if (familyRows.length > 20) {
      console.log(`  ... and ${familyRows.length - 20} more`);
    }
    console.log('');

    const families = familyRows.map(r => r.family);

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
    console.log(`Loaded ${allModels.length} active super_models.`);

    // Load existing family assignments from super_models
    const { rows: existingFamilyRows } = await client.query(`
      SELECT id AS super_model_id, family
      FROM super_models
      WHERE family IS NOT NULL
    `);
    const existingFamilies = new Map(existingFamilyRows.map(r => [r.super_model_id, r.family]));
    console.log(`Loaded ${existingFamilies.size} super_models with existing family.\n`);

    // Find models without family
    const noFamily = allModels.filter(m => !existingFamilies.has(m.id));
    console.log(`Models without family: ${noFamily.length}`);

    if (noFamily.length === 0) {
      console.log('All models have family — nothing to do.');
      return;
    }

    // Build family prevalence lookup for tie-breaking
    const familyPrevalence = new Map(familyRows.map(r => [r.family.toLowerCase(), r.cnt]));

    // Match each model without family against known families
    const assignments = []; // { child_id, child_name, family }

    for (const model of noFamily) {
      const matched = [];

      for (const family of families) {
        if (EXCLUDED_WORDS.has(family.toLowerCase())) continue;
        if (familyMatchesName(family, model.name)) {
          matched.push(family);
        }
      }

      if (matched.length === 1) {
        assignments.push({ child_id: model.id, child_name: model.name, family: matched[0] });
      } else if (matched.length > 1) {
        // Pick the family with the highest prevalence
        let best = matched[0];
        let bestCnt = familyPrevalence.get(matched[0].toLowerCase()) || 0;
        for (let i = 1; i < matched.length; i++) {
          const cnt = familyPrevalence.get(matched[i].toLowerCase()) || 0;
          if (cnt > bestCnt) {
            best = matched[i];
            bestCnt = cnt;
          }
        }
        assignments.push({ child_id: model.id, child_name: model.name, family: best });
      }
    }

    // Build per-family breakdown sorted by count descending
    const familyCounts = {};
    for (const a of assignments) {
      familyCounts[a.family] = (familyCounts[a.family] || 0) + 1;
    }
    const sortedFamilies = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);

    console.log(`\nMatched by name: ${assignments.length} models`);
    if (assignments.length > 0) {
      console.log('Per-family breakdown:');
      for (const [f, c] of sortedFamilies) {
        console.log(`  ${f}: ${c}`);
      }

      console.log('\nExample assignments:');
      // Show up to 15 examples, sampling from different families
      const examples = [];
      for (const [f] of sortedFamilies) {
        const famExamples = assignments.filter(a => a.family === f);
        const take = Math.max(1, Math.round(15 * (famExamples.length / assignments.length)));
        for (const ex of famExamples.slice(0, take)) {
          examples.push(ex);
          if (examples.length >= 15) break;
        }
        if (examples.length >= 15) break;
      }
      for (const ex of examples) {
        console.log(`  ${ex.child_name}  →  ${ex.family}`);
      }
    }

    const noMatch = noFamily.length - assignments.length;
    if (noMatch > 0) {
      console.log(`\nUnmatched: ${noMatch} models — name did not match any known family.`);
    }

    const dryRun = !process.argv.includes('--apply');

    if (dryRun) {
      console.log(`\nDry run — use --apply to insert family features for ${assignments.length} super_models.`);
      return;
    }

    // Apply: update super_models.family directly
    let updated = 0;
    for (const a of assignments) {
      await client.query(
        'UPDATE super_models SET family = $1 WHERE id = $2 AND family IS NULL',
        [a.family, a.child_id]
      );
      updated++;
    }

    console.log(`\nUpdated ${updated} super_models with family.`);

    // Verification: how many active super_models still without family?
    const { rows: stillMissing } = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
      AND sm.family IS NULL
    `);
    console.log(`Models still without family: ${stillMissing[0].cnt}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

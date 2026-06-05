#!/usr/bin/env node
/**
 * import-openrouter-categories.js
 *
 * Imports OpenRouter model category/ranking data (from extract-openrouter-categories.js)
 * into the datapoint_model_features table as best_for entries.
 *
 * Usage: node scripts/import-openrouter-categories.js [--apply]
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const INPUT = path.join(__dirname, '..', 'data', 'openrouter-categories.json');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  if (!fs.existsSync(INPUT)) {
    console.error('Run extract-openrouter-categories.js first');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const scrapedModels = raw.models || [];

  console.log('=== Importing OpenRouter categories ===\n');
  console.log('Scraped models with categories:', scrapedModels.length);

  const client = await pool.connect();
  try {
    let newEntries = 0;
    let skipped = 0;

    for (const sm of scrapedModels) {
      // Scraped IDs have ":free" suffix; DB stores with "openrouter/" prefix
      const baseId = sm.modelId.replace(/:free$/, '');
      const candidates = [sm.modelId, 'openrouter/' + baseId, 'openrouter/' + sm.modelId, baseId];

      let dpId = null;
      for (const cid of candidates) {
        const { rows: dps } = await client.query(
          'SELECT id FROM datapoint_models WHERE full_id = $1 AND is_removed = false',
          [cid],
        );
        if (dps.length > 0) {
          dpId = dps[0].id;
          break;
        }
      }

      if (!dpId) {
        skipped++;
        console.log('  SKIP ' + sm.modelId + ' (not in DB)');
        continue;
      }

      // Get existing best_for entries for this model
      const { rows: existing } = await client.query(
        "SELECT value FROM datapoint_model_features WHERE datapoint_model_id = $1 AND feature_type = 'best_for'",
        [dpId],
      );
      const existingValues = new Set(existing.map((r) => r.value));

      // Strip ranking number: "Programming (#9)" -> "Programming"
      for (const cat of sm.categories) {
        const cleanName = cat.replace(/\s*\(#\d+\)\s*$/, '').trim();
        if (existingValues.has(cleanName)) continue;

        newEntries++;
        if (APPLY) {
          await client.query(
            "INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value) VALUES ($1, 'best_for', $2)",
            [dpId, cleanName],
          );
        }
        console.log('  + ' + sm.modelId + ' → ' + cleanName);
      }
    }

    console.log('\nResults:');
    console.log(
      '  New best_for entries: ' + newEntries + (APPLY ? ' (written)' : ' (would write)'),
    );
    console.log('  Skipped (not in DB): ' + skipped);
    console.log('  Total scraped:       ' + scrapedModels.length);

    if (!APPLY) {
      console.log('\nDry-run. Use --apply to write.');
    }
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();

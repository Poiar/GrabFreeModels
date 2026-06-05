#!/usr/bin/env node
/**
 * import-groq.js
 * Import scraped Groq models (from groq-models.json) into Neon PostgreSQL.
 *
 * Usage: node scripts/import-groq.js [--apply]
 *   --apply  : Write changes to PostgreSQL (default: dry-run / report only)
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

let connectionString = process.env.DATABASE_URL;
if (
  connectionString &&
  connectionString.includes('sslmode=require') &&
  !connectionString.includes('uselibpqcompat')
) {
  connectionString = connectionString.replace(
    'sslmode=require',
    'uselibpqcompat=true&sslmode=require',
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const GROQ_JSON = path.join(__dirname, '..', 'groq-models.json');

function normalizeModelSlug(name) {
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
}

(async () => {
  if (!fs.existsSync(GROQ_JSON)) {
    console.error('groq-models.json not found. Run scripts/extract-groq.js first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(GROQ_JSON, 'utf8'));
  const models = raw.models || [];

  // Filter to free models (no pricing = free listing, or explicitly free)
  const freeModels = models.filter((m) => {
    if (m.is_free) return true;
    if (m.input_price_per_million === null && m.output_price_per_million === null) return true;
    if (m.input_price_per_million === 0 || m.output_price_per_million === 0) return true;
    return false;
  });

  console.log(`=== Importing ${freeModels.length} free Groq models (${models.length} total) ===\n`);

  const client = await pool.connect();
  try {
    // Ensure groq provider exists
    await client.query(
      `INSERT INTO datapoint_providers (slug, name, base_url) VALUES ('groq', 'Groq', 'https://api.groq.com') ON CONFLICT (slug) DO NOTHING`,
    );

    const { rows: provRows } = await client.query(
      "SELECT id FROM datapoint_providers WHERE slug = 'groq'",
    );
    const providerId = provRows[0].id;

    // Get existing groq datapoints
    const { rows: existingRows } = await client.query(
      'SELECT full_id FROM datapoint_models WHERE datapoint_provider_id = $1',
      [providerId],
    );
    const existingIds = new Set(existingRows.map((r) => r.full_id));

    const newModels = [];
    const modelCounts = { new: 0, existing: 0 };

    for (const m of freeModels) {
      const fullId = `groq/${m.model_id}`;
      if (existingIds.has(fullId)) {
        modelCounts.existing++;
        continue;
      }

      newModels.push(m);
      modelCounts.new++;
    }

    console.log(`  Free models found:     ${freeModels.length}`);
    console.log(`  Already in DB:         ${modelCounts.existing}`);
    console.log(`  New to import:         ${modelCounts.new}`);

    for (const n of newModels) {
      console.log(`    + groq/${n.model_id}`);
    }

    if (!APPLY) {
      console.log('\nDry-run mode. Use --apply to update PostgreSQL');
    } else if (newModels.length === 0) {
      console.log('\nNo new models to import.');
    } else {
      console.log('\nApplying changes...');
      await client.query('BEGIN');
      try {
        for (const m of newModels) {
          const fullId = `groq/${m.model_id}`;
          const remoteId = m.model_id;
          const superSlug = normalizeModelSlug(m.display_name || m.model_id);
          const modelName = m.display_name || m.model_id;

          // Upsert super model
          const { rows: smRows } = await client.query(
            `INSERT INTO super_models (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [modelName, superSlug],
          );
          const superId = smRows[0].id;

          // Upsert datapoint model
          await client.query(
            `INSERT INTO datapoint_models (super_model_id, datapoint_provider_id, remote_id, full_id, context_length, is_free, status_result, status_detail)
             VALUES ($1, $2, $3, $4, $5, true, 'untested', 'Discovered via Groq docs scrape')
             ON CONFLICT (datapoint_provider_id, remote_id) DO UPDATE SET
               context_length = EXCLUDED.context_length,
               is_removed = false,
               updated_at = now()`,
            [superId, providerId, remoteId, fullId, m.context_length],
          );
        }

        await client.query('COMMIT');
        console.log(`  Imported ${newModels.length} Groq models to PostgreSQL`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error applying changes:', err.message);
        process.exitCode = 1;
      }
    }

    // Also show paid models that were skipped
    const paidModels = models.filter(
      (m) => !m.is_free && m.input_price_per_million !== null && m.input_price_per_million > 0,
    );
    if (paidModels.length > 0) {
      console.log(`\n  Paid models skipped:   ${paidModels.length}`);
      for (const m of paidModels)
        console.log(
          `    - groq/${m.model_id} ($${m.input_price_per_million}/$${m.output_price_per_million})`,
        );
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

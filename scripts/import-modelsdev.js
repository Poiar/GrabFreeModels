#!/usr/bin/env node
/**
 * import-modelsdev.js
 * Upsert super_models from models.dev (canonical source), then create
 * a modelsdev datapoint for each.
 *
 * Usage: node scripts/import-modelsdev.js [--apply]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const MODELSDEV_FILE = path.join(__dirname, '..', 'modelsdev-free-models.json');
const raw = JSON.parse(fs.readFileSync(MODELSDEV_FILE, 'utf8'));
const modelsdevModels = raw.models;

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 })
  : new Pool({ host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432', 10), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, max: 3 });

function normalizeName(name) {
  return name
    .replace(/\s*\(free\)\s*/gi, '')
    .replace(/\s*\(free tier\)\s*/gi, '')
    .replace(/^coding[-_]/i, '')
    .replace(/^xiaomi[-_]/i, '')
    .trim();
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-{2,}/g, '-');
}

(async () => {
  const client = await pool.connect();
  try {
    console.log(`=== Processing ${modelsdevModels.length} models from models.dev ===\n`);

    // 1. Ensure modelsdev provider
    await client.query(
      `INSERT INTO datapoint_providers (slug, name, base_url) VALUES ('modelsdev','models.dev','https://models.dev') ON CONFLICT (slug) DO NOTHING`
    );
    const { rows: pr } = await client.query("SELECT id FROM datapoint_providers WHERE slug = 'modelsdev'");
    const provId = pr[0].id;

    // 2. Build existing lookups
    const { rows: existingMm } = await client.query('SELECT id, name, slug FROM super_models');
    const bySlug = new Map();
    const byNorm = new Map();
    for (const mm of existingMm) {
      bySlug.set(mm.slug, mm);
      const n = normalizeName(mm.name).toLowerCase();
      if (!byNorm.has(n)) byNorm.set(n, mm);
      // Also index by the lowercased raw name
      if (!byNorm.has(mm.name.toLowerCase())) byNorm.set(mm.name.toLowerCase(), mm);
    }
    console.log(`Existing supers: ${existingMm.length}`);

    let supersCreated = 0, supersMatched = 0, dpsCreated = 0, dpsSkipped = 0, errors = 0;

    for (const m of modelsdevModels) {
      const cleanName = normalizeName(m.modelName);
      const slug = slugify(cleanName);
      const fullId = `modelsdev/${m.modelId}`;
      const ctxLen = m.contextLimit && m.contextLimit > 0 ? m.contextLimit : null;

      try {
        // Check if this modelsdev datapoint already inserted
        const { rows: existDp } = await client.query('SELECT 1 FROM datapoint_models WHERE full_id = $1', [fullId]);
        if (existDp.length > 0) { dpsSkipped++; continue; }

        // Find or create super
        let super_ = bySlug.get(slug) || byNorm.get(cleanName.toLowerCase());
        let superId;

        if (super_) {
          superId = super_.id;
          supersMatched++;
        } else {
          if (!APPLY) { supersCreated++; continue; }
          const { rows: ins } = await client.query(
            `INSERT INTO super_models (name, slug) VALUES ($1,$2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [cleanName, slug]
          );
          superId = ins[0].id;
          bySlug.set(slug, { id: superId });
          byNorm.set(cleanName.toLowerCase(), { id: superId });
          supersCreated++;
        }

        if (!APPLY) continue;

        // Insert datapoint
        const { rows: dpIns } = await client.query(
          `INSERT INTO datapoint_models
             (super_model_id, datapoint_provider_id, remote_id, full_id,
              context_length, input_price_per_million, output_price_per_million,
              is_free, supports_tools, status_result, status_detail)
           VALUES ($1,$2,$3,$4,$5,0::numeric,0::numeric,true,$6,'untested','From models.dev')
           ON CONFLICT (datapoint_provider_id, remote_id) DO NOTHING
           RETURNING id`,
          [masterId, provId, m.modelId, fullId, ctxLen, m.toolCall ? true : null]
        );

        if (dpIns.length === 0) { dpsSkipped++; continue; }
        const dpId = dpIns[0].id;

        // Features
        const featRows = [];
        if (m.family) featRows.push(['family', m.family]);
        if (m.releaseDate) featRows.push(['release_date', m.releaseDate]);
        if (m.lastUpdated) featRows.push(['last_updated', m.lastUpdated]);
        if (m.reasoning) featRows.push(['supports_reasoning', 'true']);
        if (m.temperature) featRows.push(['temperature', 'true']);
        if (m.openWeights) featRows.push(['open_weights', 'true']);
        if (m.outputLimit) featRows.push(['output_limit', String(m.outputLimit)]);
        for (const [ft, fv] of featRows) {
          await client.query(
            'INSERT INTO datapoint_model_features (datapoint_model_id, feature_type, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [dpId, ft, fv]
          );
        }

        // Input/output types
        if (Array.isArray(m.input)) {
          for (const it of m.input) {
            await client.query(
              'INSERT INTO datapoint_model_input_types (datapoint_model_id, input_type) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [dpId, it]
            );
          }
        }
        if (Array.isArray(m.output)) {
          for (const ot of m.output) {
            await client.query(
              'INSERT INTO datapoint_model_output_types (datapoint_model_id, output_type) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [dpId, ot]
            );
          }
        }

        dpsCreated++;
      } catch (err) {
        errors++;
        if (errors <= 10) console.error(`  Error ${m.modelId}: ${err.message}`);
      }
    }

    console.log(`\nSupers matched: ${mastersMatched}`);
    console.log(`Supers created: ${mastersCreated}`);
    console.log(`Datapoints created: ${dpsCreated}`);
    console.log(`Datapoints skipped (already exist): ${dpsSkipped}`);
    if (errors) console.log(`Errors: ${errors}`);

    if (!APPLY) {
      console.log('\nDry-run. Use --apply to write.');
    } else {
      // Final counts
      const { rows: cnt } = await client.query(
        "SELECT COUNT(DISTINCT mm.id) FROM super_models mm JOIN datapoint_models dm ON dm.super_model_id = mm.id JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id WHERE dp.slug = 'modelsdev'"
      );
      console.log(`\nSupers with modelsdev datapoint: ${cnt[0].count}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

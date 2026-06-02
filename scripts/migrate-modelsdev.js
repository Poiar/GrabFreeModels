const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, '..', 'modelsdev-free-models.json');

function normalizeDate(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}$/.test(v)) return v + '-01';
  return v;
}

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'gfm',
  password: process.env.PGPASSWORD || 'gfm',
  database: process.env.PGDATABASE || 'grabfreemodels',
});

async function migrate() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const { models } = raw;
  console.log(`Loading ${models.length} models from models.dev...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pre-load existing providers
    const existingProviders = new Map(); // slug -> id
    const rp = await client.query('SELECT id, slug FROM providers');
    for (const r of rp.rows) existingProviders.set(r.slug, r.id);

    // Pre-load existing modelsdev by name for dedup
    const existingModelsdev = new Map(); // name_lower -> id
    const rm = await client.query('SELECT id, name FROM modelsdev');
    for (const r of rm.rows) existingModelsdev.set((r.name || '').toLowerCase(), r.id);

    // Pre-load existing full_ids
    const seenFullIds = new Set();
    const sp = await client.query('SELECT full_id FROM modelsdev_provider_models');
    for (const r of sp.rows) seenFullIds.add(r.full_id);

    let inserted = { providers: 0, models: 0, pm: 0, inputs: 0, outputs: 0, features: 0, skipped_dup: 0, skipped_cost: 0 };

    for (const m of models) {
      const fullId = m.providerId + '/' + m.modelId;
      if (seenFullIds.has(fullId)) {
        inserted.skipped_dup++;
        continue;
      }

      // --- upsert provider ---
      let providerId = existingProviders.get(m.providerId);
      if (!providerId) {
        const res = await client.query(
          `INSERT INTO providers (slug, name) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [m.providerId, m.providerName]
        );
        providerId = res.rows[0].id;
        existingProviders.set(m.providerId, providerId);
        inserted.providers++;
      }

      // --- upsert modelsdev entry ---
      const cleanName = m.modelName.replace(/\s*\(free\)\s*$/i, '').trim();
      const nameKey = cleanName.toLowerCase();
      let modelsdevId = existingModelsdev.get(nameKey);
      if (!modelsdevId) {
        const res = await client.query(
          `INSERT INTO modelsdev (name, context_length,
             input_price_per_million, output_price_per_million, is_free,
             supports_tools, supports_reasoning, output_limit, temperature,
             open_weights, family, knowledge_cutoff, release_date, last_updated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (name) DO UPDATE SET
             context_length     = GREATEST(COALESCE(modelsdev.context_length, 0), COALESCE(EXCLUDED.context_length, 0)),
             supports_tools     = COALESCE(modelsdev.supports_tools, EXCLUDED.supports_tools),
             supports_reasoning = COALESCE(modelsdev.supports_reasoning, EXCLUDED.supports_reasoning),
             output_limit       = GREATEST(COALESCE(modelsdev.output_limit, 0), COALESCE(EXCLUDED.output_limit, 0)),
             release_date       = COALESCE(modelsdev.release_date, EXCLUDED.release_date),
             last_updated       = GREATEST(COALESCE(modelsdev.last_updated, '1970-01-01'), COALESCE(EXCLUDED.last_updated, '1970-01-01'))
           RETURNING id`,
          [
            cleanName,
            m.contextLimit || null,
            m.inputCost ?? 0,
            m.outputCost ?? 0,
            (m.inputCost ?? 0) === 0 && (m.outputCost ?? 0) === 0,
            m.toolCall ?? null,
            m.reasoning ?? null,
            m.outputLimit || null,
            m.temperature ?? null,
            m.openWeights ?? null,
            m.family || null,
            null,
            normalizeDate(m.releaseDate),
            normalizeDate(m.lastUpdated),
          ]
        );
        modelsdevId = res.rows[0].id;
        existingModelsdev.set(nameKey, modelsdevId);
        inserted.models++;
      }

      // --- insert modelsdev_provider_models ---
      await client.query(
        `INSERT INTO modelsdev_provider_models (modelsdev_id, provider_id, remote_id, full_id,
           status_result, status_tested, status_detail, last_success)
         VALUES ($1,$2,$3,$4,'untested',NULL,NULL,NULL)
         ON CONFLICT (full_id) DO NOTHING`,
        [modelsdevId, providerId, m.modelId, fullId]
      );
      inserted.pm++;
      seenFullIds.add(fullId);

      // --- input_types ---
      if (Array.isArray(m.input)) {
        for (const t of m.input) {
          await client.query(
            `INSERT INTO modelsdev_input_types (modelsdev_id, input_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelsdevId, t]
          );
          inserted.inputs++;
        }
      }

      // --- output_types ---
      if (Array.isArray(m.output)) {
        for (const t of m.output) {
          await client.query(
            `INSERT INTO modelsdev_output_types (modelsdev_id, output_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelsdevId, t]
          );
          inserted.outputs++;
        }
      }

      // --- features (best_for, tags) ---
      if (Array.isArray(m.bestFor)) {
        for (const t of m.bestFor) {
          await client.query(
            `INSERT INTO modelsdev_features (modelsdev_id, feature_type, value) VALUES ($1,'best_for',$2)
             ON CONFLICT DO NOTHING`,
            [modelsdevId, t]
          );
          inserted.features++;
        }
      }
      if (Array.isArray(m.tags)) {
        for (const t of m.tags) {
          await client.query(
            `INSERT INTO modelsdev_features (modelsdev_id, feature_type, value) VALUES ($1,'tag',$2)
             ON CONFLICT DO NOTHING`,
            [modelsdevId, t]
          );
          inserted.features++;
        }
      }
    }

    await client.query('COMMIT');

    console.log('\nMigration complete:');
    for (const [k, v] of Object.entries(inserted)) {
      console.log(`  ${k}: ${v}`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

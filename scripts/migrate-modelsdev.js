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

    // Pre-load existing providers, authors, models for matching
    const existingProviders = new Map(); // slug -> id
    const rp = await client.query('SELECT id, slug FROM providers');
    for (const r of rp.rows) existingProviders.set(r.slug, r.id);

    const existingAuthors = new Map(); // name -> id
    const ra = await client.query('SELECT id, name FROM authors');
    for (const r of ra.rows) existingAuthors.set(r.name, r.id);

    const existingModels = new Map(); // name_lower+authorId -> { id, ... }
    const rm = await client.query('SELECT id, name, author_id FROM models');
    for (const r of rm.rows) {
      const key = (r.name || '').toLowerCase() + '|' + (r.author_id || '');
      if (!existingModels.has(key)) existingModels.set(key, r);
      // Also index by name alone for authorless matching
      const nameOnly = (r.name || '').toLowerCase() + '|';
      if (!existingModels.has(nameOnly)) existingModels.set(nameOnly, r);
    }

    const seenFullIds = new Set();
    const sp = await client.query('SELECT full_id FROM provider_models');
    for (const r of sp.rows) seenFullIds.add(r.full_id);

    let inserted = { providers: 0, models: 0, pm: 0, inputs: 0, outputs: 0, skipped_dup: 0, skipped_cost: 0 };

    for (const m of models) {
      // Skip non-free models
      if (m.inputCost > 0 || m.outputCost > 0) {
        inserted.skipped_cost++;
        continue;
      }

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

      // --- find or create canonical model ---
      const cleanName = m.modelName.replace(/\s*\(free\)\s*$/i, '').trim();
      const modelKey = cleanName.toLowerCase() + '|'; // authorless lookup
      let modelRow = existingModels.get(modelKey);
      if (!modelRow) {
        const res = await client.query(
          `INSERT INTO models (name, context_length,
             input_price_per_million, output_price_per_million, is_free,
             supports_tools, supports_reasoning, output_limit, temperature,
             open_weights, family, knowledge_cutoff, release_date, last_updated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (name, author_id) DO UPDATE SET
             context_length     = GREATEST(COALESCE(models.context_length, 0), COALESCE(EXCLUDED.context_length, 0)),
             supports_tools     = COALESCE(models.supports_tools, EXCLUDED.supports_tools),
             supports_reasoning = COALESCE(models.supports_reasoning, EXCLUDED.supports_reasoning),
             output_limit       = GREATEST(COALESCE(models.output_limit, 0), COALESCE(EXCLUDED.output_limit, 0)),
             release_date       = COALESCE(models.release_date, EXCLUDED.release_date),
             last_updated       = GREATEST(COALESCE(models.last_updated, '1970-01-01'), COALESCE(EXCLUDED.last_updated, '1970-01-01'))
           RETURNING id`,
          [
            cleanName,
            m.contextLimit || null,
            m.inputCost ?? 0,
            m.outputCost ?? 0,
            true,
            m.toolCall ?? null,
            m.reasoning ?? null,
            m.outputLimit || null,
            m.temperature ?? null,
            m.openWeights ?? null,
            m.family || null,
            null, // knowledge_cutoff
            normalizeDate(m.releaseDate),
            normalizeDate(m.lastUpdated),
          ]
        );
        modelRow = { id: res.rows[0].id };
        existingModels.set(modelKey, modelRow);
        inserted.models++;
      }

      // --- insert provider_models ---
      const remoteId = m.modelId;
      await client.query(
        `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id, source,
           status_result, status_tested, status_detail, last_success)
         VALUES ($1,$2,$3,$4,'models.dev','untested',NULL,NULL,NULL)
         ON CONFLICT (full_id) DO NOTHING`,
        [modelRow.id, providerId, remoteId, fullId]
      );
      inserted.pm++;
      seenFullIds.add(fullId);

      // --- input_types ---
      if (Array.isArray(m.input)) {
        for (const t of m.input) {
          await client.query(
            `INSERT INTO model_input_types (model_id, input_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelRow.id, t]
          );
          inserted.inputs++;
        }
      }

      // --- output_types ---
      if (Array.isArray(m.output)) {
        for (const t of m.output) {
          await client.query(
            `INSERT INTO model_output_types (model_id, output_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelRow.id, t]
          );
          inserted.outputs++;
        }
      }
    }

    await client.query('COMMIT');

    console.log('\nMigration complete:');
    for (const [k, v] of Object.entries(inserted)) {
      console.log(`  ${k}: ${v}`);
    }
    console.log(`\nTotal provider_models in DB: ${inserted.pm + (seenFullIds.size - inserted.pm)}`);

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

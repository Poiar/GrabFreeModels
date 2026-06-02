const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, '..', 'available-models.json');

function normalizeDate(v) {
  if (!v) return null;
  // "YYYY-MM" -> "YYYY-MM-01"
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
  console.log(`Loading ${models.length} models...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- metadata blobs ---
    const metaKeys = ['_role_rankings', '_provider_usage', '_known_issues', '_validation_method'];
    for (const key of metaKeys) {
      if (raw[key]) {
        await client.query(
          `INSERT INTO metadata (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, JSON.stringify(raw[key])]
        );
      }
    }

    // Track lookups to avoid duplicates
    const authorIds = new Map();
    const providerIds = new Map();
    const modelIds = new Map(); // name+author_id -> model_id

    let inserted = { authors: 0, providers: 0, models: 0, pm: 0, inputs: 0, outputs: 0, features: 0 };

    for (const m of models) {
      // --- upsert author ---
      if (m.author && !authorIds.has(m.author)) {
        const res = await client.query(
          `INSERT INTO authors (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [m.author]
        );
        authorIds.set(m.author, res.rows[0].id);
        inserted.authors++;
      }
      const authorId = m.author ? authorIds.get(m.author) : null;

      // --- upsert provider ---
      if (m.provider && !providerIds.has(m.provider)) {
        const slug = m.id.split('/')[0];
        const res = await client.query(
          `INSERT INTO providers (slug, name) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [slug, m.provider]
        );
        providerIds.set(m.provider, res.rows[0].id);
        inserted.providers++;
      }
      const providerId = m.provider ? providerIds.get(m.provider) : null;

      // --- upsert canonical model (name + author) ---
      const modelKey = (m.name || '') + '|' + (authorId || '');
      let modelId = modelIds.get(modelKey);
      if (!modelId) {
        const res = await client.query(
          `INSERT INTO models (name, author_id, context_length,
             input_price_per_million, output_price_per_million, is_free,
             supports_tools, supports_reasoning, output_limit, temperature,
             open_weights, family, knowledge_cutoff, release_date, last_updated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (name, author_id) DO UPDATE SET
             context_length       = GREATEST(COALESCE(models.context_length, 0), COALESCE(EXCLUDED.context_length, 0)),
             supports_tools       = COALESCE(models.supports_tools, EXCLUDED.supports_tools),
             supports_reasoning   = COALESCE(models.supports_reasoning, EXCLUDED.supports_reasoning),
             output_limit         = GREATEST(COALESCE(models.output_limit, 0), COALESCE(EXCLUDED.output_limit, 0)),
             release_date         = COALESCE(models.release_date, EXCLUDED.release_date),
             last_updated         = GREATEST(COALESCE(models.last_updated, '1970-01-01'), COALESCE(EXCLUDED.last_updated, '1970-01-01'))
           RETURNING id`,
          [
            m.name, authorId,
            m.context_length || null,
            m.input_price_per_million ?? 0,
            m.output_price_per_million ?? 0,
            m.is_free ?? true,
            m.supports_tools ?? null,
            m.supports_reasoning ?? null,
            m.output_limit ?? null,
            m.temperature ?? null,
            m.open_weights ?? null,
            m.family ?? null,
            m.knowledge_cutoff ?? null,
            normalizeDate(m.releaseDate),
            normalizeDate(m.lastUpdated),
          ]
        );
        modelId = res.rows[0].id;
        modelIds.set(modelKey, modelId);
        inserted.models++;
      }

      // --- upsert provider_models ---
      const ep = m.id.split('/')[0];
      const remoteId = m.id.slice(ep.length + 1);
      let pmRes = await client.query(
        `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id,
           status_result, status_tested, status_detail, last_success)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (full_id) DO UPDATE SET
           status_result = EXCLUDED.status_result,
           status_tested = EXCLUDED.status_tested,
           status_detail = EXCLUDED.status_detail,
           last_success  = EXCLUDED.last_success
         RETURNING id`,
        [
          modelId, providerId, remoteId, m.id,
          m.status?.result || null,
          m.status?.tested || null,
          m.status?.detail || null,
          m.last_success || null,
        ]
      );
      inserted.pm++;

      // --- input_types ---
      if (m.input_types) {
        for (const t of m.input_types) {
          await client.query(
            `INSERT INTO model_input_types (model_id, input_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelId, t]
          );
          inserted.inputs++;
        }
      }

      // --- output_types ---
      if (m.output_types) {
        for (const t of m.output_types) {
          await client.query(
            `INSERT INTO model_output_types (model_id, output_type) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [modelId, t]
          );
          inserted.outputs++;
        }
      }

      // --- features (tags, best_for) ---
      if (m.tags) {
        for (const tag of m.tags) {
          await client.query(
            `INSERT INTO model_features (model_id, feature_type, value) VALUES ($1,'tag',$2)
             ON CONFLICT DO NOTHING`,
            [modelId, tag]
          );
          inserted.features++;
        }
      }
      if (m.best_for) {
        for (const bf of m.best_for) {
          await client.query(
            `INSERT INTO model_features (model_id, feature_type, value) VALUES ($1,'best_for',$2)
             ON CONFLICT DO NOTHING`,
            [modelId, bf]
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

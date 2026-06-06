#!/usr/bin/env node
/**
 * import-external-models.js
 * Cross-references external_sources.models_data against datapoint_models
 * and imports missing models from community-curated lists.
 *
 * Usage: node scripts/import-external-models.js [--apply]
 *   --apply  : Create super_models + datapoint_models entries (default: dry-run)
 */

require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

// Map external provider names to our datapoint_provider slugs
const PROVIDER_MAP = {
  'openrouter': 'openrouter',
  'google ai studio': 'google',
  'cerebras': 'cerebras',
  'nvidia nim': 'nvidia',
  'deepseek': 'deepseek',
  'groq': 'groq',
  'huggingface inference providers': 'huggingface',
  'opencode zen': 'opencode-zen',
  'mistral (la plateforme)': 'mistral',
  'mistral (codestral)': 'mistral',
  'cohere': 'cohere',
  'github models': 'github-models',
  'cloudflare workers ai': 'cloudflare',
  'together': 'together',
  'fireworks': 'fireworks',
  'vercel ai gateway': 'vercel',
};

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

function fuzzyMatch(name, existingNames) {
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const ename of existingNames) {
    const eclean = ename.replace(/[^a-z0-9]/g, '');
    if (clean === eclean) return true;
    if (clean.length > 8 && eclean.length > 8) {
      if (clean.includes(eclean) || eclean.includes(clean)) return true;
    }
  }
  return false;
}

(async () => {
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
    max: 3,
  });

  const client = await pool.connect();
  try {
    // Load external source data
    const { rows: extRows } = await client.query(
      'SELECT source_name, models_data FROM external_sources ORDER BY fetched_at DESC LIMIT 1',
    );
    if (extRows.length === 0) {
      logger.info('No external source data found. Run fetch-external-sources.js --apply first.');
      return;
    }

    const extProviders = extRows[0].models_data;
    logger.info(`Loaded external data from "${extRows[0].source_name}"`);

    // Load existing datapoint_models
    const { rows: existing } = await client.query(`
      SELECT dm.remote_id, dm.full_id, dp.slug AS provider_slug
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true AND dm.is_removed = false
    `);
    const existingByProvider = {};
    for (const r of existing) {
      if (!existingByProvider[r.provider_slug]) existingByProvider[r.provider_slug] = new Set();
      existingByProvider[r.provider_slug].add(r.remote_id.toLowerCase());
    }

    // Get provider IDs
    const { rows: providerRows } = await client.query('SELECT id, slug FROM datapoint_providers');
    const providerIdMap = new Map(providerRows.map((r) => [r.slug, r.id]));

    // Cross-reference and find missing
    const missing = [];
    for (const p of extProviders) {
      const slug = PROVIDER_MAP[p.provider.toLowerCase()];
      if (!slug) continue; // skip providers we don't have in DB
      if (!providerIdMap.has(slug)) continue; // skip if not in datapoint_providers

      const existingSet = existingByProvider[slug] || new Set();
      for (const m of p.models) {
        // Skip generic/placeholder entries
        if (/^various|^free tier|^currently free|requires phone|open and proprietary/i.test(m.name)) continue;
        if (!fuzzyMatch(m.name, existingSet)) {
          missing.push({ provider: slug, name: m.name, limits: m.limits });
        }
      }
    }

    // Group by provider
    const byProvider = {};
    for (const m of missing) {
      if (!byProvider[m.provider]) byProvider[m.provider] = [];
      byProvider[m.provider].push(m);
    }

    logger.info('\n=== Cross-reference results ===');
    let totalMissing = 0;
    for (const [slug, models] of Object.entries(byProvider)) {
      logger.info(`  ${slug}: ${models.length} missing`);
      totalMissing += models.length;
    }
    logger.info(`  Total: ${totalMissing} models to import`);

    if (totalMissing === 0) {
      logger.info('\nNothing to import — all external models already in DB.');
      return;
    }

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to import.');
      logger.info('\nSample (first 10):');
      for (const m of missing.slice(0, 10)) {
        logger.info(`  + ${m.provider}/${m.name}`);
      }
      return;
    }

    // Apply: insert missing models
    logger.info('\nImporting...');
    let imported = 0;
    let skipped = 0;

    for (const m of missing) {
      const providerId = providerIdMap.get(m.provider);
      if (!providerId) {
        skipped++;
        continue;
      }

      const superSlug = normalizeModelSlug(m.name);
      const remoteId = m.name;
      const fullId = `${m.provider}/${m.name}`;

      try {
        const { rows: smRows } = await client.query(
          `INSERT INTO super_models (name, slug) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [m.name, superSlug],
        );
        const superId = smRows[0].id;

        await client.query(
          `INSERT INTO datapoint_models
           (super_model_id, datapoint_provider_id, remote_id, full_id, is_free, status_result, status_detail)
           VALUES ($1, $2, $3, $4, true, 'untested', $5)
           ON CONFLICT (datapoint_provider_id, remote_id) DO UPDATE SET
             full_id = EXCLUDED.full_id,
             is_removed = false,
             updated_at = now()`,
          [superId, providerId, remoteId, fullId, 'Imported from community list (free-llm-api-resources)'],
        );
        imported++;
      } catch (err) {
        logger.info(`  SKIP ${fullId}: ${err.message}`);
        skipped++;
      }
    }

    logger.info(`  Imported: ${imported}`);
    logger.info(`  Skipped:  ${skipped}`);
    logger.info('Done.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

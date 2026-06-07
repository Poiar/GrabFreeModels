#!/usr/bin/env node
/**
 * import-external-models.js
 * Cross-references external_source_models against datapoint_models
 * and imports missing models from community-curated lists.
 *
 * Reads from normalized tables (external_source_providers, external_source_models)
 * instead of the old JSONB models_data blob.
 *
 * Usage: node scripts/import-external-models.js [--apply]
 *   --apply  : Create super_models + datapoint_models entries (default: dry-run)
 */

require('dotenv').config();
const pool = require('../server/db');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

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
  const client = await pool.connect();
  try {
    // Load external model data from normalized tables
    const { rows: extModels } = await client.query(`
      SELECT s.id AS source_id, esp.mapped_slug, esp.external_name, esm.model_name, esm.model_limits
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      JOIN sources s ON s.id = esm.source_id
      WHERE esp.mapped_slug IS NOT NULL
    `);
    if (extModels.length === 0) {
      logger.info('No normalized external source data found. Run fetch-external-sources.js --apply first.');
      return;
    }
    logger.info(`Loaded ${extModels.length} external model entries from normalized tables`);

    // Group by mapped_slug (provider slug)
    const extBySlug = {};
    for (const m of extModels) {
      if (!extBySlug[m.mapped_slug]) extBySlug[m.mapped_slug] = [];
      extBySlug[m.mapped_slug].push(m);
    }

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

    // Get source names for status_detail
    const { rows: sourceRows } = await client.query('SELECT id, name FROM sources');
    const sourceNameMap = new Map(sourceRows.map((r) => [r.id, r.name]));

    // Cross-reference and find missing
    const missing = [];
    for (const [slug, models] of Object.entries(extBySlug)) {
      if (!providerIdMap.has(slug)) continue; // skip if not in datapoint_providers

      const existingSet = existingByProvider[slug] || new Set();
      for (const m of models) {
        // Skip generic/placeholder entries
        if (/^various|^free tier|^currently free|requires phone|open and proprietary/i.test(m.model_name)) continue;
        if (!fuzzyMatch(m.model_name, existingSet)) {
          missing.push({ provider: slug, externalName: m.external_name, name: m.model_name, limits: m.model_limits, source_id: m.source_id });
        }
      }
    }

    // Group by provider for reporting
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

    // Apply: insert missing models and record provenance
    logger.info('\nImporting...');
    let imported = 0;
    let skipped = 0;

    try {
      await client.query('BEGIN');

      for (const m of missing) {
        const providerId = providerIdMap.get(m.provider);
        if (!providerId) {
          skipped++;
          continue;
        }

        // Strip external provider prefix from model name if present.
        // External sources use their own naming conventions (e.g. models.dev uses
        // "x-ai/grok-4.3" while our provider slug is "xai").
        let modelName = m.name;
        if (m.externalName && modelName.startsWith(`${m.externalName}/`)) {
          modelName = modelName.slice(m.externalName.length + 1);
        } else if (modelName.startsWith(`${m.provider}/`)) {
          modelName = modelName.slice(m.provider.length + 1);
        }
        const superSlug = normalizeModelSlug(modelName);
        const remoteId = modelName;
        const fullId = `${m.provider}/${modelName}`;

        // Parse context_length and limits from model_limits JSON
        let contextLength = null;
        let limitations = null;
        if (m.limits) {
          try {
            const parsed = JSON.parse(m.limits);
            if (parsed.contextWindow != null) contextLength = parsed.contextWindow;
            limitations = m.limits;
          } catch {
            limitations = m.limits;
          }
        }

        const sourceName = sourceNameMap.get(m.source_id) || 'community list';
        const statusDetail = `Imported from community list (${sourceName})`;

        try {
          const { rows: smRows } = await client.query(
            `INSERT INTO super_models (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [modelName, superSlug],
          );
          const superId = smRows[0].id;

          const { rows: newDmRows } = await client.query(
            `INSERT INTO datapoint_models
             (super_model_id, datapoint_provider_id, remote_id, full_id,
              is_free, context_length, limitations, status_result, status_detail)
             VALUES ($1, $2, $3, $4, true, $5, $6, 'untested', $7)
             ON CONFLICT (datapoint_provider_id, remote_id) DO UPDATE SET
               full_id = EXCLUDED.full_id,
               context_length = COALESCE(EXCLUDED.context_length, datapoint_models.context_length),
               limitations = COALESCE(EXCLUDED.limitations, datapoint_models.limitations),
               is_removed = false,
               updated_at = now()
             RETURNING id`,
            [superId, providerId, remoteId, fullId, contextLength, limitations, statusDetail],
          );
          const newDmId = newDmRows[0].id;

          // Record provenance for newly imported model
          await client.query(
            `INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [newDmId, m.source_id],
          );

          imported++;
        } catch (err) {
          logger.info(`  SKIP ${fullId}: ${err.message}`);
          skipped++;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.info(`  ROLLBACK: ${err.message}`);
      throw err;
    }

    logger.info(`\n  Imported: ${imported}`);
    logger.info(`  Skipped:  ${skipped}`);
    logger.info('  Run backfill-provenance.js --apply to link all community-imported models to their sources.');
    logger.info('Done.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

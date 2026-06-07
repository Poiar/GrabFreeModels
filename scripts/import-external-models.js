#!/usr/bin/env node
/**
 * import-external-models.js
 * Cross-references external_source_models against super_models and imports
 * matching models as datapoint_models rows with source provenance links.
 *
 * Matching passes (run in DB for performance):
 *   1. Direct: normalize_model_slug(model_name) = super_models.slug
 *   2. Provider-stripped: for provider/model format, strip first segment,
 *      normalize the rest, match against super_models.slug
 *
 * For each match the script finds or creates the right datapoint_models row
 * (keyed on super_model_id + datapoint_provider_id), then adds a provenance
 * link in datapoint_model_sources.
 *
 * Usage: node scripts/import-external-models.js [--apply]
 *   --apply  : Create datapoint_models + source links (default: dry-run)
 */

require('dotenv').config();
const pool = require('../server/db');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

(async () => {
  const client = await pool.connect();
  try {
    // ── Load external models (only with mapped providers) ──
    const { rows: extRows } = await client.query(`
      SELECT esm.id AS ext_id, esm.model_name, esm.source_id,
             esp.external_name AS ext_provider, esp.mapped_slug,
             s.name AS source_name
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      JOIN sources s ON s.id = esm.source_id
      WHERE esp.mapped_slug IS NOT NULL
    `);
    logger.info(`Loaded ${extRows.length} external models with mapped providers`);

    // ── Pass 1: Direct slug match ──
    const { rows: p1 } = await client.query(`
      SELECT esm.id AS ext_id, esm.model_name, esm.source_id,
             sm.id AS super_id, sm.slug AS super_slug, sm.name AS super_name,
             dp.id AS dp_id, dp.slug AS dp_slug
      FROM external_source_models esm
      JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
      JOIN super_models sm ON sm.slug = normalize_model_slug(esm.model_name)
      JOIN datapoint_providers dp ON dp.slug = esp.mapped_slug
    `);
    logger.info(`Pass 1 (direct slug): ${p1.length} matched`);

    // ── Pass 2: Provider-stripped match ──
    const { rows: p2 } = await client.query(`
      WITH unmatched AS (
        SELECT esm.id AS ext_id, esm.model_name, esm.source_id, esp.mapped_slug,
               regexp_replace(esm.model_name, '^[^/]+/', '') AS model_part
        FROM external_source_models esm
        JOIN external_source_providers esp ON esp.id = esm.external_source_provider_id
        WHERE esp.mapped_slug IS NOT NULL
          AND esm.model_name LIKE '%/_%' ESCAPE '\\'
          AND NOT EXISTS (
            SELECT 1 FROM super_models sm2
            WHERE sm2.slug = normalize_model_slug(esm.model_name)
          )
      )
      SELECT u.ext_id, u.model_name, u.source_id, u.model_part, u.mapped_slug,
             sm.id AS super_id, sm.slug AS super_slug, sm.name AS super_name,
             dp.id AS dp_id, dp.slug AS dp_slug
      FROM unmatched u
      JOIN super_models sm ON sm.slug = normalize_model_slug(u.model_part)
      JOIN datapoint_providers dp ON dp.slug = u.mapped_slug
    `);
    logger.info(`Pass 2 (stripped prefix): ${p2.length} additional matched`);

    const matched = [...p1, ...p2];
    const unmatched = extRows.length - matched.length;
    logger.info(`Total matched: ${matched.length}  Unmatched: ${unmatched}`);

    if (matched.length === 0) {
      logger.info('Nothing to import.');
      return;
    }

    // ── Check existing datapoint_models ──
    const superIds = [...new Set(matched.map((r) => r.super_id))];
    const { rows: existingDps } = await client.query(`
      SELECT dm.id, dm.super_model_id, dm.datapoint_provider_id
      FROM datapoint_models dm
      WHERE dm.super_model_id = ANY($1) AND dm.is_removed = false
    `, [superIds]);

    const dpByKey = new Map();
    for (const r of existingDps) {
      dpByKey.set(`${r.super_model_id}|${r.datapoint_provider_id}`, r.id);
    }

    // ── Check existing source links ──
    const allDpIds = existingDps.map((r) => r.id);
    const existingLinks = new Set();
    if (allDpIds.length > 0) {
      const { rows: links } = await client.query(
        'SELECT datapoint_model_id, source_id FROM datapoint_model_sources WHERE datapoint_model_id = ANY($1)',
        [allDpIds],
      );
      for (const l of links) {
        existingLinks.add(`${l.datapoint_model_id}|${l.source_id}`);
      }
    }

    // ── Categorize matches ──
    const needDp = [];
    const needLink = [];
    let haveBoth = 0;

    for (const m of matched) {
      const key = `${m.super_id}|${m.dp_id}`;
      const dmId = dpByKey.get(key);
      if (dmId) {
        if (existingLinks.has(`${dmId}|${m.source_id}`)) {
          haveBoth++;
        } else {
          needLink.push({ dm_id: dmId, source_id: m.source_id, ...m });
        }
      } else {
        needDp.push(m);
      }
    }

    logger.info(`\nSummary:`);
    logger.info(`  Already complete (dp + link): ${haveBoth}`);
    logger.info(`  Need source link only:        ${needLink.length}`);
    logger.info(`  Need new datapoint + link:    ${needDp.length}`);

    if (needDp.length > 0) {
      logger.info(`\n  Models needing new datapoint_models (up to 30):`);
      for (const m of needDp.slice(0, 30)) {
        logger.info(`    + ${m.dp_slug}/${m.model_name || m.ext_id}  →  ${m.super_name}`);
      }
      if (needDp.length > 30) logger.info(`    ... and ${needDp.length - 30} more`);
    }

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to apply.');
      return;
    }

    // ── Apply ──
    const { rows: provRows } = await client.query('SELECT id, slug FROM datapoint_providers');
    const provMap = new Map(provRows.map((r) => [r.slug, r.id]));

    let createdDp = 0;
    let createdLinks = 0;

    await client.query('BEGIN');

    try {
      // Create datapoint_models for needed
      for (const m of needDp) {
        const providerId = provMap.get(m.dp_slug);
        if (!providerId) continue;

        const remoteId = m.model_name || m.ext_id;
        const fullId = `${m.dp_slug}/${remoteId}`;
        try {
          await client.query(`
            INSERT INTO datapoint_models
              (super_model_id, datapoint_provider_id, remote_id, full_id, is_free, is_removed)
            VALUES ($1, $2, $3, $4, true, false)
            ON CONFLICT (datapoint_provider_id, remote_id) DO NOTHING
          `, [m.super_id, providerId, remoteId, fullId]);
          createdDp++;
        } catch (e) {
          logger.error(`  Failed datapoint ${fullId}: ${e.message}`);
        }
      }

      // Refresh dp lookup after inserts
      const { rows: freshDps } = await client.query(`
        SELECT dm.id, dm.super_model_id, dm.datapoint_provider_id
        FROM datapoint_models dm
        WHERE dm.super_model_id = ANY($1) AND dm.is_removed = false
      `, [superIds]);

      const freshByKey = new Map();
      for (const r of freshDps) {
        freshByKey.set(`${r.super_model_id}|${r.datapoint_provider_id}`, r.id);
      }

      // Create source links
      const allNeedsLinks = [
        ...needLink.map((m) => ({ dm_id: m.dm_id, source_id: m.source_id })),
        ...needDp.map((m) => {
          const key = `${m.super_id}|${provMap.get(m.dp_slug)}`;
          return { dm_id: freshByKey.get(key), source_id: m.source_id };
        }).filter((l) => l.dm_id),
      ];

      for (const l of allNeedsLinks) {
        try {
          const res = await client.query(`
            INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
            VALUES ($1, $2)
            ON CONFLICT (datapoint_model_id, source_id) DO NOTHING
          `, [l.dm_id, l.source_id]);
          if (res.rowCount > 0) createdLinks++;
        } catch (e) {
          logger.error(`  Failed link dm=${l.dm_id} src=${l.source_id}: ${e.message}`);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    logger.info(`\nCreated ${createdDp} new datapoint_models`);
    logger.info(`Created ${createdLinks} new source links`);

    const { rows: verify } = await client.query('SELECT COUNT(*) AS n FROM datapoint_model_sources');
    logger.info(`Total provenance links in DB: ${verify[0].n}`);
    logger.info('Done.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

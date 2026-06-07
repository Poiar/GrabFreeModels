#!/usr/bin/env node
/**
 * backfill-provenance.js
 * Idempotent script that links all existing datapoint_models to their sources.
 *
 * API providers: linked via datapoint_provider_id matching sources.datapoint_provider_id.
 * Community sources: linked via status_detail LIKE '%Imported from community list%'.
 *
 * Usage: node scripts/backfill-provenance.js [--apply]
 *   --apply  : Create provenance links in PostgreSQL (default: dry-run / count only)
 */

require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

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
    logger.info('=== Backfill Provenance Links ===\n');

    // Count API provider sources linkable via datapoint_provider_id
    const { rows: apiCountRows } = await client.query(`
      SELECT COUNT(*) AS total
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      JOIN sources s ON s.datapoint_provider_id = dp.id
      WHERE s.source_type = 'api_provider'
        AND dm.is_removed = false
        AND NOT EXISTS (
          SELECT 1 FROM datapoint_model_sources dms
          WHERE dms.datapoint_model_id = dm.id AND dms.source_id = s.id
        )
    `);
    const apiMissing = parseInt(apiCountRows[0].total, 10);

    // Count community source models linkable via status_detail
    const { rows: communityCountRows } = await client.query(`
      SELECT COUNT(*) AS total
      FROM datapoint_models dm
      WHERE dm.status_detail LIKE '%Imported from community list%'
        AND dm.is_removed = false
        AND NOT EXISTS (
          SELECT 1 FROM datapoint_model_sources dms
          JOIN sources s ON s.id = dms.source_id
          WHERE dms.datapoint_model_id = dm.id AND s.source_type = 'community_list'
        )
    `);
    const communityMissing = parseInt(communityCountRows[0].total, 10);

    const totalMissing = apiMissing + communityMissing;

    logger.info('Links needed:');
    logger.info(`  API providers:       ${apiMissing}`);
    logger.info(`  Community sources:   ${communityMissing}`);
    logger.info(`  Total:               ${totalMissing}`);

    if (totalMissing === 0) {
      logger.info('\nAll provenance links already exist — nothing to do.');
      return;
    }

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to create these links.');
      return;
    }

    // Apply: create API provider links
    logger.info('\nCreating API provider provenance links...');
    const apiResult = await client.query(`
      INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
      SELECT dm.id, s.id
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      JOIN sources s ON s.datapoint_provider_id = dp.id
      WHERE s.source_type = 'api_provider'
        AND dm.is_removed = false
        AND NOT EXISTS (
          SELECT 1 FROM datapoint_model_sources dms
          WHERE dms.datapoint_model_id = dm.id AND dms.source_id = s.id
        )
      ON CONFLICT DO NOTHING
    `);
    logger.info(`  Created ${apiResult.rowCount} API provider links`);

    // Apply: create community source links
    logger.info('Creating community source provenance links...');
    const communityResult = await client.query(`
      INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
      SELECT dm.id, s.id
      FROM datapoint_models dm
      CROSS JOIN sources s
      WHERE s.source_type = 'community_list'
        AND dm.status_detail LIKE '%Imported from community list%'
        AND dm.is_removed = false
        AND NOT EXISTS (
          SELECT 1 FROM datapoint_model_sources dms
          WHERE dms.datapoint_model_id = dm.id AND dms.source_id = s.id
        )
      ON CONFLICT DO NOTHING
    `);
    logger.info(`  Created ${communityResult.rowCount} community source links`);

    const totalCreated = apiResult.rowCount + communityResult.rowCount;
    logger.info(`\nTotal links created: ${totalCreated}`);

    // Verify
    const { rows: verifyRows } = await client.query('SELECT COUNT(*) AS total FROM datapoint_model_sources');
    logger.info(`Total provenance links in DB: ${verifyRows[0].total}`);

    logger.info('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

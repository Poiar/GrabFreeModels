#!/usr/bin/env node
/**
 * migrate-add-external-sources.js
 * Creates the external_sources table for community model data.
 *
 * Usage: node scripts/migrate-add-external-sources.js [--apply]
 *   --apply  : Execute the migration (default: dry-run / print SQL only)
 */

require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

const SQL = `
CREATE TABLE IF NOT EXISTS external_sources (
    id              SERIAL PRIMARY KEY,
    source_name     VARCHAR(128) NOT NULL UNIQUE,
    source_url      VARCHAR(512),
    raw_data        JSONB,
    models_data     JSONB,
    model_count     INTEGER DEFAULT 0,
    fetched_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`.trim();

(async () => {
  if (!APPLY) {
    logger.info('Dry-run mode. Would execute:\n');
    console.log(SQL);
    logger.info('\nUse --apply to execute the migration.');
    return;
  }

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
    await client.query(SQL);
    logger.info('Migration applied: external_sources table created.');
  } catch (err) {
    logger.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

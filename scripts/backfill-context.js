#!/usr/bin/env node
/**
 * backfill-context.js
 *
 * Fetches context_length for models where it's null, using the OpenRouter model catalog
 * (which includes full metadata for NVIDIA/other models routed through OpenRouter).
 *
 * Usage:
 *   node scripts/backfill-context.js          # dry-run
 *   node scripts/backfill-context.js --apply  # write changes
 */

require('dotenv').config();
const https = require('https');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function getOpenRouterContext(modelId) {
  try {
    const r = await httpsGet(`https://openrouter.ai/api/v1/models`);
    const found = r.data?.find((m) => m.id === modelId);
    return found?.context_length ?? null;
  } catch {
    return null;
  }
}

const KNOWN_CONTEXT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'known-context.json'), 'utf8'),
);


(async () => {
  const client = await pool.connect();
  try {
    const { rows: targets } = await client.query(`
      SELECT dm.id, dm.full_id
      FROM datapoint_models dm
      JOIN super_models mm ON mm.id = dm.super_model_id
      WHERE dm.context_length IS NULL
        AND dm.is_free = true
        AND dm.status_result = 'working'
        AND dm.is_removed = false
      ORDER BY dm.full_id
    `);

logger.info(`Models with null context_length: ${targets.length}`);

    /* eslint-disable no-unused-vars */
    let auth;
    try {
      auth = JSON.parse(
        fs.readFileSync(
          process.env.GFM_AUTH_FILE ||
            path.join(
              process.env.XDG_DATA_HOME ||
                path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'),
              'opencode',
              'auth.json',
            ),
          'utf8',
        ),
      );
    } catch (e) {
      logger.error(`Failed to read auth file: ${e.message}`);
      throw e;
    }
    /* eslint-enable no-unused-vars */

    let updated = 0;
    for (const m of targets) {
      let ctx = null;

      const orId = m.full_id.startsWith('nvidia/') ? m.full_id.replace('nvidia/', '') : m.full_id;
      ctx = await getOpenRouterContext(orId);
      if (ctx) {
        logger.info(`  ${m.full_id}: ${ctx} (from OpenRouter)`);
      }

      if (!ctx && KNOWN_CONTEXT[m.full_id]) {
        ctx = KNOWN_CONTEXT[m.full_id];
        logger.info(`  ${m.full_id}: ${ctx} (from known catalog)`);
      }

      if (ctx) {
        if (APPLY) {
          await client.query('UPDATE datapoint_models SET context_length = $1 WHERE id = $2', [
            ctx,
            m.id,
          ]);
        }
        updated++;
      } else {
        logger.warn(`  ${m.full_id}: still null (no source)`);
      }
    }

    logger.info(`\n${updated}/${targets.length} models ${APPLY ? 'updated' : 'would be updated'}`);
    if (APPLY && updated > 0) {
      const exportData = require('./export-from-pg');
      await exportData(pool);
      logger.info('Exported to available-models.json');
    } else if (!APPLY) {
      logger.info('Dry-run. Use --apply to write.');
    }
  } catch (err) {
    logger.error('Backfill failed: ' + err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  logger.error(e.message);
  process.exit(1);
});

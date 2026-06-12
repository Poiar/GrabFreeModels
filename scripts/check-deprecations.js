#!/usr/bin/env node
/**
 * check-deprecations.js
 *
 * Checks provider APIs for deprecated free models and updates `deprecated_at`
 * in the database so the frontend can surface deprecation status.
 *
 * Currently checks:
 *  - OpenRouter model listing (deprecated flag)
 *  - HuggingFace model listing (gated/disabled models)
 *
 * Usage:
 *   node scripts/check-deprecations.js           # dry-run, human output
 *   node scripts/check-deprecations.js --apply   # write deprecated_at to DB
 *   node scripts/check-deprecations.js --json    # machine-readable JSON output
 *   node scripts/check-deprecations.js --apply --json
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');

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
});

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    mod
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Fetch deprecated model IDs from OpenRouter.
 * OpenRouter's /api/v1/models returns a `deprecated` boolean per model.
 */
async function getOpenRouterDeprecated() {
  const { data } = await httpGet('https://openrouter.ai/api/v1/models');
  const models = data.data || [];
  return models.filter((m) => m.deprecated === true).map((m) => `openrouter/${m.id}`);
}

/**
 * Fetch deprecated model IDs from HuggingFace.
 * Checks for models that are disabled, deprecated, or have
 * a `deprecated` flag in their cardData.
 */
async function getHuggingFaceDeprecated() {
  // HF models endpoint — fetch models sorted by likes, looking for deprecated ones
  const { data } = await httpGet(
    'https://huggingface.co/api/models?direction=-1&sort=likes&full=true&config=false&cardData=true',
  );
  const models = Array.isArray(data) ? data : [];
  const deprecated = [];

  for (const m of models) {
    const isDeprecated =
      m.disabled === true ||
      m.gated === true ||
      m.cardData?.deprecated === true ||
      m.cardData?.baseModel === 'deprecated' ||
      m.pipeline_tag === 'deprecated';

    if (isDeprecated && m.id) {
      deprecated.push(`huggingface/${m.id}`);
    }
  }

  // Also explicitly mark models tagged as deprecated by HF's `safetensors` or model card
  return deprecated;
}

/**
 * Fetch deprecated model IDs from NVIDIA.
 * NVIDIA's NIM catalog may deprecate models over time.
 * Checks if the model is no longer listed in the models endpoint.
 */
async function getNvidiaDeprecated() {
  // NVIDIA does not have a deprecation flag, so we return an empty array.
  // NVIDIA models are handled by the sync script's removal detection instead.
  return [];
}

(async () => {
  const client = await pool.connect();
  try {
    const results = {
      newly_deprecated: [],
      still_active: [],
      errors: [],
      source_counts: {},
    };

    // ── Fetch deprecated models from all sources ──
    logger.info('=== Checking model deprecations ===\n');

    const [orDeprecated, hfDeprecated, nvDeprecated] = await Promise.allSettled([
      (async () => {
        logger.info('[OpenRouter] Checking deprecated models...');
        const ids = await getOpenRouterDeprecated();
        logger.info(`  Found ${ids.length} deprecated models`);
        results.source_counts.openrouter = ids.length;
        return ids;
      })(),
      (async () => {
        logger.info('\n[HuggingFace] Checking deprecated models...');
        const ids = await getHuggingFaceDeprecated();
        logger.info(`  Found ${ids.length} deprecated models`);
        results.source_counts.huggingface = ids.length;
        return ids;
      })(),
      (async () => {
        logger.info('\n[NVIDIA] Checking deprecated models...');
        const ids = await getNvidiaDeprecated();
        logger.info(`  Found ${ids.length} deprecated models`);
        results.source_counts.nvidia = ids.length;
        return ids;
      })(),
    ]);

    const deprecatedFullIds = new Set();
    if (orDeprecated.status === 'fulfilled') {
      for (const id of orDeprecated.value) deprecatedFullIds.add(id);
    } else {
      results.errors.push('OpenRouter: ' + orDeprecated.reason.message);
      logger.error('  ERROR: ' + orDeprecated.reason.message);
    }
    if (hfDeprecated.status === 'fulfilled') {
      for (const id of hfDeprecated.value) deprecatedFullIds.add(id);
    } else {
      results.errors.push('HuggingFace: ' + hfDeprecated.reason.message);
      logger.error('  ERROR: ' + hfDeprecated.reason.message);
    }
    if (nvDeprecated.status === 'fulfilled') {
      for (const id of nvDeprecated.value) deprecatedFullIds.add(id);
    } else {
      results.errors.push('NVIDIA: ' + nvDeprecated.reason.message);
    }

    if (deprecatedFullIds.size === 0) {
      logger.info('\nNo deprecated models found from any source.');
      if (JSON_OUTPUT) {
        console.log(JSON.stringify(results, null, 2));
      }
      return;
    }

    // ── Find matches in our DB ──
    logger.info(`\nCross-referencing ${deprecatedFullIds.size} deprecated models against DB...`);

    const { rows: dbModels } = await client.query(
      `
      SELECT dm.id, dm.full_id, dm.deprecated_at
      FROM datapoint_models dm
      WHERE dm.full_id = ANY($1)
        AND dm.is_removed = false
      ORDER BY dm.full_id
    `,
      [[...deprecatedFullIds]],
    );

    logger.info(`  ${dbModels.length} deprecated models found in DB`);

    // Separate newly deprecated from already-deprecated
    const toDeprecate = [];
    for (const m of dbModels) {
      if (m.deprecated_at === null) {
        toDeprecate.push(m);
        results.newly_deprecated.push(m.full_id);
      } else {
        results.still_active.push(m.full_id);
      }
    }

    // Log results
    logger.info(`\nNewly deprecated: ${toDeprecate.length}`);
    for (const m of toDeprecate) {
      logger.info(`  DEPRECATED  ${m.full_id}`);
    }

    logger.info(`\nAlready deprecated (no change): ${results.still_active.length}`);

    if (results.errors.length > 0) {
      logger.warn(`\nErrors (${results.errors.length}):`);
      for (const err of results.errors) {
        logger.warn(`  ${err}`);
      }
    }

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to update deprecated_at in PostgreSQL');
    } else if (toDeprecate.length > 0) {
      logger.info('\nUpdating deprecated_at in DB...');
      const ids = toDeprecate.map((m) => m.id);
      await client.query(
        `UPDATE datapoint_models
         SET deprecated_at = now(), updated_at = now()
         WHERE id = ANY($1)`,
        [ids],
      );
      logger.info(`  Set deprecated_at for ${toDeprecate.length} models`);
    } else {
      logger.info('\nNo new deprecations to apply.');
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (err) {
    console.error('check-deprecations failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

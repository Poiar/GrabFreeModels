#!/usr/bin/env node
/**
 * fetch-modelsdev-models.js
 * Fetches models.dev's models.json (comprehensive model catalog with pricing,
 * context windows, modalities, and supported parameters) and imports into
 * the sources → external_source_providers → external_source_models pipeline.
 *
 * Usage: node scripts/fetch-modelsdev-models.js [--apply]
 *   --apply  : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const logger = require('./utils/logger');
const { PROVIDER_MAP } = require('./utils/provider-map');

const APPLY = process.argv.includes('--apply');

const RAW_URL = 'https://raw.githubusercontent.com/sst/models.dev/dev/models.json';
const SOURCE_SLUG = 'modelsdev';
const SOURCE_NAME = 'models.dev Catalog';
const SOURCE_URL = 'https://models.dev';
const SOURCE_TYPE = 'community_list';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  logger.info('Fetching models.dev catalog...');
  let catalog;
  try {
    catalog = await httpsGet(RAW_URL);
  } catch (e) {
    logger.error(`Failed to fetch: ${e.message}`);
    process.exit(1);
  }

  const models = catalog.data || [];
  logger.info(`  ${models.length} models total`);

  // Check which are free
  const freeModels = models.filter(
    (m) => parseFloat(m.pricing?.prompt) === 0 && parseFloat(m.pricing?.completion) === 0,
  );
  logger.info(`  ${freeModels.length} free models`);

  // Group by provider prefix from model ID
  const byProvider = {};
  for (const m of models) {
    const prov = m.id.split('/')[0];
    if (!byProvider[prov]) byProvider[prov] = [];
    byProvider[prov].push(m);
  }

  // Map to our datapoint_providers slugs
  const mapped = {};
  const unmapped = {};
  for (const [slug, modelList] of Object.entries(byProvider)) {
    const mappedSlug = PROVIDER_MAP[slug] ?? null;
    if (mappedSlug) {
      mapped[slug] = { count: modelList.length, mappedSlug };
    } else {
      unmapped[slug] = { count: modelList.length };
    }
  }

  const mappedSlugs = Object.keys(mapped);
  const unmappedSlugs = Object.keys(unmapped);
  const mappedModelCount = mappedSlugs.reduce((s, k) => s + mapped[k].count, 0);
  const unmappedModelCount = unmappedSlugs.reduce((s, k) => s + unmapped[k].count, 0);

  logger.info('\n=== Summary ===');
  logger.info(`  Total providers in catalog:     ${Object.keys(byProvider).length}`);
  logger.info(`  Mapped to our providers:        ${mappedSlugs.length} (${mappedModelCount} models)`);
  logger.info(`  Unmapped (need PROVIDER_MAP):   ${unmappedSlugs.length} (${unmappedModelCount} models)`);

  for (const [slug, info] of Object.entries(mapped)) {
    logger.info(`  ✓ ${slug} → ${info.mappedSlug} (${info.count} models)`);
  }
  if (unmappedSlugs.length > 0) {
    logger.info('\n  Unmapped providers:');
    for (const [slug, info] of Object.entries(unmapped)) {
      logger.info(`  ? ${slug} (${info.count} models)`);
    }
  }

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to persist to PostgreSQL.');
    process.exit(0);
  }

  // --- --apply: persist to DB ---
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
    await client.query('BEGIN');

    const { rows: srcRows } = await client.query(
      `INSERT INTO sources (slug, name, source_type, source_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         source_url = EXCLUDED.source_url,
         name = EXCLUDED.name
       RETURNING id`,
      [SOURCE_SLUG, SOURCE_NAME, SOURCE_TYPE, SOURCE_URL],
    );
    const sourceId = srcRows[0].id;
    logger.info(`  Source ID: ${sourceId} (${SOURCE_SLUG})`);

    let totalInserted = 0;
    for (const [slug, modelList] of Object.entries(byProvider)) {
      const mappedSlug = PROVIDER_MAP[slug] ?? null;

      const { rows: espRows } = await client.query(
        `INSERT INTO external_source_providers (source_id, external_name, mapped_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, external_name) DO UPDATE SET
           mapped_slug = EXCLUDED.mapped_slug
         RETURNING id`,
        [sourceId, slug, mappedSlug],
      );
      const espId = espRows[0].id;

      for (const model of modelList) {
        const limits = JSON.stringify({
          contextWindow: model.context_length,
          maxCompletionTokens: model.top_provider?.max_completion_tokens,
          inputModalities: model.architecture?.input_modalities || [],
          outputModalities: model.architecture?.output_modalities || [],
          promptPrice: model.pricing?.prompt,
          completionPrice: model.pricing?.completion,
          webSearchPrice: model.pricing?.web_search,
          cacheReadPrice: model.pricing?.input_cache_read,
          cacheWritePrice: model.pricing?.input_cache_write,
          isModerated: model.top_provider?.is_moderated,
          supportedParameters: model.supported_parameters || [],
          description: model.description,
          isFree: parseFloat(model.pricing?.prompt) === 0 && parseFloat(model.pricing?.completion) === 0,
        });

        await client.query(
          `INSERT INTO external_source_models (source_id, external_source_provider_id, model_name, model_limits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (source_id, external_source_provider_id, model_name) DO UPDATE SET
             model_limits = EXCLUDED.model_limits`,
          [sourceId, espId, model.id, limits],
        );
        totalInserted++;
      }
    }

    await client.query('COMMIT');
    logger.info(`  Stored ${Object.keys(byProvider).length} providers with ${totalInserted} models`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`DB error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

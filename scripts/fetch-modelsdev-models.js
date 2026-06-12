#!/usr/bin/env node
/**
 * fetch-modelsdev-models.js
 * Fetches models.dev's catalog.json (comprehensive model catalog with pricing,
 * context windows, modalities, capabilities, and benchmarks) and imports into
 * the sources -> external_source_providers -> external_source_models pipeline.
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

const CATALOG_URL = 'https://models.dev/catalog.json';
const SOURCE_SLUG = 'modelsdev';
const SOURCE_NAME = 'models.dev Catalog';
const SOURCE_URL = 'https://models.dev';
const SOURCE_TYPE = 'community_list';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
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
      })
      .on('error', reject);
  });
}

(async () => {
  logger.info('Fetching models.dev catalog.json...');
  let catalog;
  try {
    catalog = await httpsGet(CATALOG_URL);
  } catch (e) {
    logger.error(`Failed to fetch: ${e.message}`);
    process.exit(1);
  }

  const providers = catalog.providers || {};

  // Count total and free models across all providers
  let totalModels = 0;
  let freeModels = 0;
  const byProvider = {};

  for (const [provId, provData] of Object.entries(providers)) {
    const providerModels = provData.models || {};
    const modelEntries = Object.entries(providerModels);
    totalModels += modelEntries.length;

    for (const [, modelData] of modelEntries) {
      const cost = modelData.cost || {};
      if (parseFloat(cost.input ?? 1) === 0 && parseFloat(cost.output ?? 1) === 0) {
        freeModels++;
      }
    }

    byProvider[provId] = { models: providerModels, providerName: provData.name || provId };
  }

  const providerIds = Object.keys(byProvider);
  logger.info(
    `  ${totalModels} models total (${freeModels} free) across ${providerIds.length} providers`,
  );

  // Map to our datapoint_providers slugs
  const mapped = {};
  const unmapped = {};
  for (const [slug, info] of Object.entries(byProvider)) {
    const modelCount = Object.keys(info.models).length;
    const mappedSlug = PROVIDER_MAP[slug] ?? null;
    if (mappedSlug) {
      mapped[slug] = { count: modelCount, mappedSlug };
    } else {
      unmapped[slug] = { count: modelCount };
    }
  }

  const mappedSlugs = Object.keys(mapped);
  const unmappedSlugs = Object.keys(unmapped);
  const mappedModelCount = mappedSlugs.reduce((s, k) => s + mapped[k].count, 0);
  const unmappedModelCount = unmappedSlugs.reduce((s, k) => s + unmapped[k].count, 0);

  logger.info('\n=== Summary ===');
  logger.info(`  Total providers in catalog:     ${providerIds.length}`);
  logger.info(
    `  Mapped to our providers:        ${mappedSlugs.length} (${mappedModelCount} models)`,
  );
  logger.info(
    `  Unmapped (need PROVIDER_MAP):   ${unmappedSlugs.length} (${unmappedModelCount} models)`,
  );

  for (const [slug, info] of Object.entries(mapped)) {
    logger.info(`  ✓ ${slug} -> ${info.mappedSlug} (${info.count} models)`);
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
    for (const [provId, provData] of Object.entries(byProvider)) {
      const mappedSlug = PROVIDER_MAP[provId] ?? null;

      const { rows: espRows } = await client.query(
        `INSERT INTO external_source_providers (source_id, external_name, mapped_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, external_name) DO UPDATE SET
           mapped_slug = EXCLUDED.mapped_slug
         RETURNING id`,
        [sourceId, provId, mappedSlug],
      );
      const espId = espRows[0].id;

      for (const [, modelData] of Object.entries(provData.models)) {
        const cost = modelData.cost || {};
        const limit = modelData.limit || {};
        const modalities = modelData.modalities || {};

        const modelName = modelData.id.includes('/') ? modelData.id : `${provId}/${modelData.id}`;

        // Interleaved can be an object { field: '...' } or a boolean
        let interleavedVal = modelData.interleaved;
        if (interleavedVal && typeof interleavedVal === 'object') {
          interleavedVal = true;
        }

        const limits = JSON.stringify({
          contextWindow: limit.context,
          maxCompletionTokens: limit.output,
          inputModalities: modalities.input || [],
          outputModalities: modalities.output || [],
          promptPrice: cost.input,
          completionPrice: cost.output,
          cacheReadPrice: cost.cache_read,
          cacheWritePrice: cost.cache_write,
          isFree: parseFloat(cost.input ?? 1) === 0 && parseFloat(cost.output ?? 1) === 0,
          family: modelData.family,
          attachment: modelData.attachment,
          reasoning: modelData.reasoning,
          toolCall: modelData.tool_call,
          temperature: modelData.temperature,
          knowledge: modelData.knowledge,
          releaseDate: modelData.release_date,
          lastUpdated: modelData.last_updated,
          openWeights: modelData.open_weights,
          structuredOutput: modelData.structured_output,
          interleaved: interleavedVal,
        });

        await client.query(
          `INSERT INTO external_source_models (source_id, external_source_provider_id, model_name, model_limits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (source_id, external_source_provider_id, model_name) DO UPDATE SET
             model_limits = EXCLUDED.model_limits`,
          [sourceId, espId, modelName, limits],
        );
        totalInserted++;
      }
    }

    await client.query('COMMIT');
    logger.info(
      `  Stored ${Object.keys(byProvider).length} providers with ${totalInserted} models`,
    );
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

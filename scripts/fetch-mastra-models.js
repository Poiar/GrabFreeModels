#!/usr/bin/env node
/**
 * fetch-mastra-models.js
 * Fetches Mastra.ai's model directory from their GitHub repo, parses
 * <ProviderModelsTable> JSON arrays from .mdx files, and maps providers
 * to our datapoint_providers slugs.
 *
 * Usage: node scripts/fetch-mastra-models.js [--apply]
 *   --apply  : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const logger = require('./utils/logger');
const { PROVIDER_MAP } = require('./utils/provider-map');

const APPLY = process.argv.includes('--apply');

const GITHUB_API_BASE = 'api.github.com';
const REPO_OWNER = 'mastra-ai';
const REPO_NAME = 'mastra';
const PROVIDERS_PATH = 'docs/src/content/en/models/providers';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${PROVIDERS_PATH}`;

const SOURCE_SLUG = 'mastra';
const SOURCE_NAME = 'Mastra Model Directory';
const SOURCE_URL = 'https://mastra.ai/models';
const SOURCE_TYPE = 'community_list';

/**
 * Perform an HTTPS GET request returning the response body as a string.
 */
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : require('http');
    mod
      .get(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers: { 'User-Agent': 'GrabFreeModels/1.0', ...headers },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(httpsGet(res.headers.location, headers));
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            } else {
              resolve(data);
            }
          });
        },
      )
      .on('error', reject);
  });
}

/**
 * Fetch the contents listing of the providers directory via GitHub API.
 * Returns an array of file objects with { name, download_url }.
 */
async function fetchProviderFiles() {
  logger.info('Fetching provider file list from GitHub API...');
  const json = await httpsGet(
    `https://${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PROVIDERS_PATH}`,
    { Accept: 'application/vnd.github.v3+json' },
  );
  const files = JSON.parse(json);

  const mdxFiles = files.filter(
    (f) => f.name.endsWith('.mdx') && f.name !== 'index.mdx' && f.name !== '_meta.ts',
  );

  logger.info(
    `  Found ${mdxFiles.length} provider .mdx files (skipped index.mdx, _meta.ts, non-mdx)`,
  );
  return mdxFiles;
}

/**
 * Extract the provider slug from a filename (e.g. "deepseek.mdx" → "deepseek").
 */
function slugFromFilename(filename) {
  return filename.replace(/\.mdx$/, '').toLowerCase();
}

/**
 * Parse a single .mdx file content to extract models from <ProviderModelsTable>.
 *
 * The expected format is a JSX component with a models prop containing a JSON array:
 *   <ProviderModelsTable
 *     models={[{ "model": "...", "contextWindow": ..., ... }]}
 *   />
 *
 * Returns the parsed JSON array, or an empty array if not found.
 */
function parseProviderModelsTable(mdxContent) {
  // Match the models={...} prop from <ProviderModelsTable ... />
  // The JSON array is inside braces after models=
  const regex = /<ProviderModelsTable[\s\S]*?models=\{(\[[\s\S]*?\])\}\s*\/?>/;
  const match = mdxContent.match(regex);

  if (!match) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) {
      logger.warn(`  Parsed models value is not an array, got ${typeof parsed}`);
      return [];
    }
    return parsed;
  } catch (e) {
    logger.warn(`  Failed to parse models JSON: ${e.message}`);
    return [];
  }
}

/**
 * Fetch and parse a single .mdx file, returning provider info + model entries.
 */
async function fetchProviderMdx(file) {
  const providerSlug = slugFromFilename(file.name);
  const rawUrl = `${RAW_BASE}/${file.name}`;

  logger.info(`  [${providerSlug}] Fetching ${rawUrl}...`);

  let content;
  try {
    content = await httpsGet(rawUrl);
  } catch (e) {
    logger.error(`  [${providerSlug}] Failed to fetch: ${e.message}`);
    return { providerSlug, models: [], error: e.message };
  }

  const models = parseProviderModelsTable(content);
  logger.info(`    Parsed ${models.length} models`);

  return { providerSlug, models, error: null };
}

(async () => {
  // --- GitHub API: list provider files ---
  let mdxFiles;
  try {
    mdxFiles = await fetchProviderFiles();
  } catch (e) {
    logger.error(`Failed to fetch provider file list: ${e.message}`);
    process.exit(1);
  }

  if (mdxFiles.length === 0) {
    logger.warn('No provider .mdx files found. Nothing to do.');
    process.exit(0);
  }

  // --- Fetch and parse each .mdx file ---
  const results = [];
  for (const file of mdxFiles) {
    const result = await fetchProviderMdx(file);
    results.push(result);
    // Small delay to avoid GitHub rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  // --- Filter to providers that had models ---
  const providersWithModels = results.filter((r) => r.models.length > 0);
  const failedProviders = results.filter((r) => r.error);

  // --- Map to our provider slugs ---
  const mappedResults = providersWithModels.map((r) => {
    const mappedSlug = PROVIDER_MAP[r.providerSlug] || null;
    return { ...r, mappedSlug };
  });

  // --- Dry-run summary ---
  const totalModels = mappedResults.reduce((sum, r) => sum + r.models.length, 0);
  const mappedCount = mappedResults.filter((r) => r.mappedSlug).length;
  const unmappedCount = mappedResults.filter((r) => !r.mappedSlug).length;

  logger.info('\n=== Summary ===');
  logger.info(`  Total providers with models: ${providersWithModels.length}`);
  logger.info(`  Total models:                ${totalModels}`);
  logger.info(`  Mapped to our providers:     ${mappedCount}`);
  logger.info(`  Unmapped (need PROVIDER_MAP): ${unmappedCount}`);
  if (failedProviders.length > 0) {
    logger.info(`  Failed to fetch:             ${failedProviders.length}`);
  }

  logger.info('\n=== Provider Breakdown ===');
  for (const r of mappedResults) {
    const status = r.mappedSlug ? `→ ${r.mappedSlug}` : '(no mapping)';
    logger.info(`  ${r.providerSlug}: ${r.models.length} models ${status}`);
    for (const m of r.models.slice(0, 3)) {
      const tools = m.toolUsage ? 'tools' : 'no-tools';
      const reasoning = m.reasoning ? 'reasoning' : '';
      const tags = [tools, reasoning].filter(Boolean).join(', ');
      logger.info(`    - ${m.model} (ctx: ${m.contextWindow || '?'}, ${tags})`);
    }
    if (r.models.length > 3) {
      logger.info(`    ... and ${r.models.length - 3} more`);
    }
  }

  if (unmappedCount > 0) {
    logger.info('\n=== Unmapped Providers (need PROVIDER_MAP entries) ===');
    for (const r of mappedResults) {
      if (!r.mappedSlug) {
        logger.info(`  ${r.providerSlug} (${r.models.length} models)`);
      }
    }
  }

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to persist to PostgreSQL.');
    process.exit(0);
  }

  // --- --apply mode: persist to DB ---
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

    // Ensure the mastra source row exists in the sources table
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

    // Insert or update each provider
    let totalInsertedModels = 0;
    for (const r of mappedResults) {
      const { rows: espRows } = await client.query(
        `INSERT INTO external_source_providers (source_id, external_name, mapped_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, external_name) DO UPDATE SET
           mapped_slug = EXCLUDED.mapped_slug
         RETURNING id`,
        [sourceId, r.providerSlug, r.mappedSlug],
      );
      const espId = espRows[0].id;

      for (const model of r.models) {
        // Build model_limits JSON with the Mastra fields
        const limits = JSON.stringify({
          contextWindow: model.contextWindow,
          maxOutput: model.maxOutput,
          toolUsage: model.toolUsage,
          reasoning: model.reasoning,
          inputCost: model.inputCost,
          outputCost: model.outputCost,
          imageInput: model.imageInput,
          audioInput: model.audioInput,
          videoInput: model.videoInput,
        });

        await client.query(
          `INSERT INTO external_source_models (source_id, external_source_provider_id, model_name, model_limits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (source_id, external_source_provider_id, model_name) DO UPDATE SET
             model_limits = EXCLUDED.model_limits`,
          [sourceId, espId, model.model, limits],
        );
        totalInsertedModels++;
      }
    }

    await client.query('COMMIT');
    logger.info(
      `  Stored ${mappedResults.length} providers with ${totalInsertedModels} models to DB`,
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

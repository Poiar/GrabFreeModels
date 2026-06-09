#!/usr/bin/env node
/**
 * fetch-huggingface-hub.js
 * Fetches text-generation models with warm (free) inference from HuggingFace Hub
 * and imports into sources → external_source_providers → external_source_models.
 *
 * Uses the public HF Hub API: /api/models with inference=warm filter.
 * Warm inference = active hosted inference endpoints available (free tier).
 * Pagination: cursor-based via Link header (rel="next").
 *
 * Usage: node scripts/fetch-huggingface-hub.js [--apply]
 *   --apply  : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

const API_BASE = 'https://huggingface.co/api/models';
const PAGE_SIZE = 100;
const MAX_MODELS = 600;
const REQUEST_DELAY_MS = 300;

const SOURCE_SLUG = 'huggingface-hub';
const SOURCE_NAME = 'HuggingFace Model Hub (Free Inference)';
const SOURCE_URL = 'https://huggingface.co/models?inference=warm&pipeline_tag=text-generation';
const SOURCE_TYPE = 'community_list';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGetWithHeaders(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGetWithHeaders(res.headers.location));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        } else {
          try {
            resolve({ data: JSON.parse(data), link: res.headers.link || null });
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        }
      });
    }).on('error', reject);
  });
}

// Parse RFC 5988 Link header to extract next cursor
function extractNextCursor(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  const nextUrl = new URL(match[1]);
  return nextUrl.searchParams.get('cursor');
}

async function fetchModels(limit) {
  const models = [];
  let cursor = null;

  while (models.length < limit) {
    const params = new URLSearchParams({
      inference: 'warm',
      filter: 'text-generation',
      sort: 'downloads',
      direction: '-1',
      limit: String(PAGE_SIZE),
      full: 'true',
      config: 'true',
    });
    if (cursor) params.set('cursor', cursor);
    const url = `${API_BASE}?${params.toString()}`;

    await sleep(REQUEST_DELAY_MS);
    try {
      const { data, link } = await httpsGetWithHeaders(url);
      if (!data || data.length === 0) break;
      models.push(...data);
      logger.info(`  Fetched ${models.length} models...`);
      if (data.length < PAGE_SIZE) break;
      cursor = extractNextCursor(link);
      if (!cursor) break;
    } catch (e) {
      logger.error(`  Error: ${e.message}`);
      break;
    }
  }
  return models.slice(0, limit);
}

// Map HF Hub author to our datapoint_providers slug
function mapAuthorToProvider(author) {
  const MAP = {
    'meta-llama': 'openrouter',
    'mistralai': 'mistral',
    'deepseek-ai': 'deepseek',
    'google': 'google',
    'Qwen': 'openrouter',
    '01-ai': 'openrouter',
    'NousResearch': 'openrouter',
    'cognitivecomputations': 'openrouter',
    'HuggingFaceH4': 'huggingface',
    'CohereForAI': 'cohere',
    'microsoft': 'openrouter',
    'nvidia': 'nvidia',
    'ibm-granite': 'openrouter',
    'THUDM': 'openrouter',
    'tiiuae': 'openrouter',
    'bigscience': 'huggingface',
    'EleutherAI': 'huggingface',
    'ai21labs': 'openrouter',
    'baichuan-inc': 'openrouter',
    'internlm': 'openrouter',
    'togethercomputer': 'together',
    'Writer': 'openrouter',
    'HuggingFaceTB': 'huggingface',
    'databricks': 'openrouter',
    'openbmb': 'openrouter',
    'Salesforce': 'openrouter',
    'upstage': 'openrouter',
    'BAAI': 'openrouter',
    'mistral-community': 'mistral',
    'llama-community': 'openrouter',
    'openai': 'openai',
    'xai-org': 'openrouter',
    'Gryphe': 'openrouter',
    'Undi95': 'openrouter',
    'Sao10K': 'openrouter',
    'TheDrummer': 'openrouter',
    'Arcee-Vision': 'openrouter',
    'anthracite-org': 'openrouter',
  };
  return MAP[author] || null;
}

(async () => {
  logger.info(`Fetching top ${MAX_MODELS} HF Hub models with warm inference...`);

  let models;
  try {
    models = await fetchModels(MAX_MODELS);
  } catch (e) {
    logger.error(`Failed to fetch: ${e.message}`);
    process.exit(1);
  }
  logger.info(`  Total fetched: ${models.length}`);

  // Group by author → our provider
  const byProvider = {};
  let unmapped = 0;
  for (const m of models) {
    const mapped = mapAuthorToProvider(m.author);
    if (mapped) {
      if (!byProvider[mapped]) byProvider[mapped] = [];
      byProvider[mapped].push(m);
    } else {
      unmapped++;
    }
  }

  const mappedTotal = Object.values(byProvider).reduce((s, a) => s + a.length, 0);
  logger.info(`  Mapped: ${mappedTotal} across ${Object.keys(byProvider).length} providers`);
  logger.info(`  Unmapped authors: ${unmapped}`);

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to persist.');
    const sorted = Object.entries(byProvider).sort((a, b) => b[1].length - a[1].length);
    logger.info('\nProvider distribution:');
    for (const [slug, mdl] of sorted) {
      logger.info(`  ${slug}: ${mdl.length} models`);
    }
    logger.info('\nTop models:');
    for (const [slug, mdl] of sorted.slice(0, 5)) {
      for (const m of mdl.slice(0, 3)) {
        logger.info(`  ${slug}/${m.id} — DL: ${m.downloads?.toLocaleString()}, Likes: ${m.likes}`);
      }
    }
    process.exit(0);
  }

  // --apply: persist to DB
  let connStr = process.env.DATABASE_URL;
  if (connStr && connStr.includes('sslmode=require') && !connStr.includes('uselibpqcompat')) {
    connStr = connStr.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
  }

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: srcRows } = await client.query(
      `INSERT INTO sources (slug, name, source_type, source_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET source_url = EXCLUDED.source_url, name = EXCLUDED.name
       RETURNING id`,
      [SOURCE_SLUG, SOURCE_NAME, SOURCE_TYPE, SOURCE_URL],
    );
    const sourceId = srcRows[0].id;
    logger.info(`  Source ID: ${sourceId}`);

    let totalInserted = 0;
    for (const [mappedSlug, mdl] of Object.entries(byProvider)) {
      const { rows: espRows } = await client.query(
        `INSERT INTO external_source_providers (source_id, external_name, mapped_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, external_name) DO UPDATE SET mapped_slug = EXCLUDED.mapped_slug
         RETURNING id`,
        [sourceId, mappedSlug, mappedSlug],
      );
      const espId = espRows[0].id;

      for (const m of mdl) {
        const limits = JSON.stringify({
          downloads: m.downloads,
          likes: m.likes,
          tags: m.tags || [],
          pipelineTag: m.pipeline_tag,
          libraryName: m.library_name,
          createdAt: m.createdAt,
          updatedAt: m.lastModified,
          sha: m.sha,
          gated: m.gated,
          isFreeInference: true,
          author: m.author,
          cardData: m.cardData || null,
        });

        await client.query(
          `INSERT INTO external_source_models (source_id, external_source_provider_id, model_name, model_limits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (source_id, external_source_provider_id, model_name) DO UPDATE SET
             model_limits = EXCLUDED.model_limits`,
          [sourceId, espId, m.id, limits],
        );
        totalInserted++;
      }
    }

    await client.query('COMMIT');
    logger.info(`  Stored ${totalInserted} models across ${Object.keys(byProvider).length} providers`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`DB error: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

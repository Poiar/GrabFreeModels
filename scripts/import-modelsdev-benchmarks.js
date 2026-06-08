#!/usr/bin/env node
/**
 * import-modelsdev-benchmarks.js
 * Reads models.dev catalog.json and imports benchmark scores into model_scores.
 *
 * Matches catalog models to modelsdev datapoint_models by:
 *   1. Exact remote_id match
 *   2. Name-only match (catalog ID after the '/')
 *   3. Normalized name match (dots→hyphens, strip date suffixes)
 *   4. Manual override map for edge cases
 *
 * Usage: node scripts/import-modelsdev-benchmarks.js [--apply]
 *   --apply : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

// Manual overrides for catalog model IDs that don't auto-match to modelsdev remote_ids
const REMOTE_ID_OVERRIDES = {
  // Anthropic: catalog uses hyphens (claude-3-5-sonnet), modelsdev uses dots (claude-3.5-sonnet)
  'anthropic/claude-3-5-haiku-20241022': 'claude-3.5-haiku',
  'anthropic/claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
  'anthropic/claude-3-7-sonnet-20250219': 'claude-3.7-sonnet',
  'anthropic/claude-sonnet-4-0': 'claude-4.0-sonnet',
  'anthropic/claude-opus-4-0': 'claude-4.0-opus',
  'anthropic/claude-sonnet-4-20250514': 'claude-sonnet-4-5',
  'anthropic/claude-opus-4-20250514': 'anthropic/claude-opus-4-6',
  'anthropic/claude-opus-4-5-20251101': 'duo-chat-opus-4-5',
  'anthropic/claude-opus-4-8': 'duo-chat-opus-4-8',
  // OpenAI: version-specific entries map to the base model
  'openai/gpt-4o-2024-05-13': 'openai/gpt-4o',
  'openai/gpt-4o-2024-08-06': 'openai/gpt-4o',
  'openai/gpt-4o-2024-11-20': 'openai/gpt-4o',
  'openai/gpt-4-turbo': null,  // no modelsdev entry
  'openai/gpt-4': null,       // no modelsdev entry
  'openai/gpt-3.5-turbo': null, // no modelsdev entry
  'openai/gpt-5-codex': 'openai-gpt-5',
  'openai/gpt-5.2-codex': 'openai-gpt-5',
  'openai/gpt-5.3-codex': 'openai-gpt-5',
  'openai/gpt-5.5': 'openai-gpt-5',
  'openai/o3-pro': 'openai-o3',
  // Mistral
  'mistral/mistral-medium-latest': 'mistral-medium-3-5-128b',
  'mistral/mistral-small-2603': 'mistral-small-4-119b-2603-2',
  'mistral/mistral-medium-2604': 'mistral-medium-3-5-128b',
  'mistral/devstral-small-2507': 'devstral-small-2512',
  'mistral/codestral-latest': 'mistral-ai/codestral-2501',
  'mistral/devstral-medium-2507': 'devstral-2',
  // Others
  'cohere/command-a-03-2025': 'cohere/cohere-command-a',
  'perplexity/sonar': 'perplexity/sonar-pro',
  'zhipuai/glm-4.5v': 'glm-4.5-master',
  'meta/llama-4-maverick-17b-instruct': 'llama-4-maverick',
  'stepfun/step-3.5-flash-2603': 'stepfun/step-3.5-flash-free',
  'google/gemini-3.1-pro-preview': 'gemini-3-flash-preview',
  'alibaba/qwen3-coder-30b-a3b-instruct': 'qwen/qwen3-coder-30b',
  'alibaba/qwen3.6-27b': 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  'alibaba/qwen3.6-35b-a3b': 'umans-qwen3.6-35b-a3b',
  'alibaba/qwen-max': 'qwen3-max',
  'alibaba/qwen3.7-235b-a22b': 'Qwen/Qwen3-235B-A22B',
};

const CATALOG_URL = 'https://models.dev/catalog.json';

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

/**
 * Build a lookup map from modelsdev datapoint_models by candidate keys.
 * Returns Map<candidateKey, { id, remote_id, full_id, super_name }>
 */
async function buildModelsdevLookup(client) {
  const { rows } = await client.query(`
    SELECT dm.id, dm.remote_id, dm.full_id, sm.name AS super_name
    FROM datapoint_models dm
    JOIN super_models sm ON sm.id = dm.super_model_id
    WHERE dm.datapoint_provider_id = (SELECT id FROM datapoint_providers WHERE slug = 'modelsdev')
  `);

  const lookup = new Map();
  for (const r of rows) {
    // Key by remote_id as-is
    lookup.set(r.remote_id, r);
    // Key by full_id as-is
    lookup.set(r.full_id, r);
    // Key by just the name part (after last /)
    const namePart = r.remote_id.split('/').pop();
    if (namePart && !lookup.has(namePart)) {
      lookup.set(namePart, r);
    }
    // Key by normalized name: dots to hyphens, strip master suffix
    const normalized = r.remote_id
      .replace(/\./g, '-')
      .replace(/-master$/, '');
    if (normalized !== r.remote_id && !lookup.has(normalized)) {
      lookup.set(normalized, r);
    }
  }
  return { lookup, rows };
}

(async () => {
  logger.info('Fetching catalog.json from models.dev...');
  let catalog;
  try {
    catalog = await httpsGet(CATALOG_URL);
  } catch (e) {
    logger.error(`Failed to fetch catalog.json: ${e.message}`);
    process.exit(1);
  }

  // Extract models with benchmarks
  const benchmarkModels = [];
  for (const [catId, model] of Object.entries(catalog.models)) {
    if (model.benchmarks && model.benchmarks.length > 0) {
      benchmarkModels.push({ catId, model, benchmarks: model.benchmarks });
    }
  }
  logger.info(`  ${Object.keys(catalog.models).length} total models`);
  logger.info(`  ${benchmarkModels.length} models with benchmarks`);
  logger.info(`  ${benchmarkModels.reduce((s, m) => s + m.benchmarks.length, 0)} total benchmark entries`);

  // --- DB connection ---
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
    connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  const client = await pool.connect();

  try {
    const { lookup } = await buildModelsdevLookup(client);

    // Match each catalog model to a modelsdev datapoint
    const matched = [];
    const unmatched = [];

    for (const { catId, model, benchmarks } of benchmarkModels) {
      let dm = null;
      const override = REMOTE_ID_OVERRIDES[catId];

      // null override means explicitly skip (no modelsdev entry exists)
      if (override === null) {
        unmatched.push({ catId, name: model.name });
        continue;
      }

      // Strategy 1: manual override
      if (override) {
        dm = lookup.get(override) || null;
      }

      // Strategy 2: exact catalog ID as remote_id or full_id
      if (!dm) {
        dm = lookup.get(catId) || lookup.get('modelsdev/' + catId) || null;
      }

      // Strategy 3: name-only (after the /)
      if (!dm) {
        const namePart = catId.split('/').pop();
        dm = lookup.get(namePart) || null;
      }

      // Strategy 4: normalize (dots to hyphens, strip dates)
      if (!dm) {
        const normalized = catId
          .split('/').pop()
          .replace(/-latest$/, '')
          .replace(/-\d{8}$/, '')
          .replace(/-\d{6}$/, '');
        dm = lookup.get(normalized) || null;
      }

      if (dm) {
        matched.push({ catId, dm, benchmarks, name: model.name });
      } else {
        unmatched.push({ catId, name: model.name });
      }
    }

    logger.info(`\n=== Matching Results ===`);
    logger.info(`  Matched:   ${matched.length}`);
    logger.info(`  Unmatched: ${unmatched.length}`);

    if (!APPLY) {
      logger.info('\nMatched models:');
      for (const m of matched) {
        logger.info(`  ${m.catId} → ${m.dm.full_id} (${m.benchmarks.length} benchmarks)`);
      }
      if (unmatched.length > 0) {
        logger.info('\nUnmatched models (need override):');
        for (const u of unmatched) {
          logger.info(`  ${u.catId} (${u.name})`);
        }
      }
      logger.info('\nDry-run mode. Use --apply to persist to PostgreSQL.');
      process.exit(0);
    }

    // --- --apply: persist benchmark scores ---
    await client.query('BEGIN');

    const SCORE_TYPE_MAP = {
      'Aider Polyglot': 'aider-polyglot',
      'Artificial Analysis Coding Index': 'artificial-analysis-coding',
      'Artificial Analysis Coding Agent Index': 'artificial-analysis-coding-agent',
      'SWE-Bench Verified': 'swe-bench-verified',
      'SWE-Bench Pro': 'swe-bench-pro',
      'SWE-Atlas Codebase QnA': 'swe-atlas-codebase-qna',
      'SWE-Atlas Refactoring': 'swe-atlas-refactoring',
      'SWE-Atlas Test Writing': 'swe-atlas-test-writing',
      'SciCode': 'scicode',
      'Terminal-Bench': 'terminal-bench',
      'Terminal-Bench Hard': 'terminal-bench-hard',
      'Terminal Bench 2.0': 'terminal-bench-2.0',
    };

    let inserted = 0;
    let updated = 0;
    for (const { dm, benchmarks } of matched) {
      for (const b of benchmarks) {
        const scoreType = SCORE_TYPE_MAP[b.name] || b.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const rawData = JSON.stringify({
          metric: b.metric,
          source_url: b.source,
          date: b.date,
          benchmark_name: b.name,
        });

        await client.query(`
          INSERT INTO model_scores (datapoint_model_id, source, score_type, score_value, raw_data, fetched_at)
          VALUES ($1, 'modelsdev', $2, $3, $4, NOW())
          ON CONFLICT (datapoint_model_id, source, score_type)
          DO UPDATE SET score_value = EXCLUDED.score_value,
                        raw_data = EXCLUDED.raw_data,
                        fetched_at = NOW()
        `, [dm.id, scoreType, b.score, rawData]);

        updated++;
      }
      inserted++;
    }

    await client.query('COMMIT');
    logger.info(`\n  Imported ${inserted} models with ${updated} benchmark scores`);

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`DB error: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

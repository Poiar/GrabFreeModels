#!/usr/bin/env node
/**
 * fetch-openllm-leaderboard.js
 * Fetches model benchmark scores from the Open LLM Leaderboard v2 on HuggingFace
 * and imports into sources → external_source_providers → external_source_models.
 *
 * Data source: open-llm-leaderboard/contents dataset (~4,576 evaluated models)
 * Fields: IFEval, BBH, MATH-Lvl5, GPQA, MuSR, MMLU-PRO scores + params + license
 *
 * Usage: node scripts/fetch-openllm-leaderboard.js [--apply]
 *   --apply  : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

const DATASET = 'open-llm-leaderboard/contents';
const API_BASE = 'https://datasets-server.huggingface.co';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 500; // avoid 429 from HF datasets-server

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_SLUG = 'openllm-leaderboard';
const SOURCE_NAME = 'Open LLM Leaderboard v2';
const SOURCE_URL = 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard';
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
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON: ${e.message}`));
            }
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchAllRows() {
  const rows = [];
  let offset = 0;

  // First, get total size
  let total = 0;
  try {
    const sizeRes = await httpsGet(`${API_BASE}/size?dataset=${DATASET}&config=default`);
    total = sizeRes.size?.dataset?.num_rows || 0;
    logger.info(`  Total rows: ${total}`);
  } catch (e) {
    logger.warn(`  Could not get size: ${e.message}, will fetch until empty`);
  }

  while (true) {
    const url = `${API_BASE}/rows?dataset=${DATASET}&config=default&split=train&offset=${offset}&length=${PAGE_SIZE}`;
    await sleep(REQUEST_DELAY_MS);
    try {
      const res = await httpsGet(url);
      if (!res.rows || res.rows.length === 0) break;
      for (const r of res.rows) {
        rows.push(r.row);
      }
      offset += res.rows.length;
      if (offset % 500 === 0) logger.info(`  Fetched ${offset}...`);
      if (total && offset >= total) break;
    } catch (e) {
      logger.error(`  Error at offset ${offset}: ${e.message}`);
      break;
    }
  }
  return rows;
}

// Map HF org to our datapoint_providers slugs
// Well-known labs map to direct providers; community orgs default to huggingface
function mapOrgToProvider(org) {
  const DIRECT = {
    google: 'google',
    'google-deepmind': 'google',
    mistralai: 'mistral',
    'mistral-community': 'mistral',
    'deepseek-ai': 'deepseek',
    nvidia: 'nvidia',
    cohere: 'cohere',
    CohereForAI: 'cohere',
    openai: 'openai',
    togethercomputer: 'together',
    'meta-llama': 'openrouter',
    Qwen: 'openrouter',
    '01-ai': 'openrouter',
    NousResearch: 'openrouter',
    cognitivecomputations: 'openrouter',
    allenai: 'openrouter',
    microsoft: 'openrouter',
    'ibm-granite': 'openrouter',
    THUDM: 'openrouter',
    tiiuae: 'openrouter',
    ai21labs: 'openrouter',
    'baichuan-inc': 'openrouter',
    internlm: 'openrouter',
    upstage: 'openrouter',
    Writer: 'openrouter',
    databricks: 'openrouter',
    'xai-org': 'openrouter',
    Salesforce: 'openrouter',
    BAAI: 'openrouter',
    inclusionai: 'openrouter',
    abacusai: 'openrouter',
    openbmb: 'openrouter',
    'shenzhi-wang': 'openrouter',
    'AIDC-AI': 'openrouter',
    mosaicml: 'openrouter',
    stabilityai: 'openrouter',
    'deci-ai': 'openrouter',
    'h2o-ai': 'openrouter',
    teknium: 'openrouter',
    lmsys: 'openrouter',
    argilla: 'openrouter',
    'nomic-ai': 'openrouter',
  };
  if (DIRECT[org]) return DIRECT[org];
  // Default: models are ON HuggingFace, so map to huggingface provider
  return 'huggingface';
}

(async () => {
  logger.info('Fetching Open LLM Leaderboard dataset...');

  let rows;
  try {
    rows = await fetchAllRows();
  } catch (e) {
    logger.error(`Failed to fetch: ${e.message}`);
    process.exit(1);
  }
  logger.info(`  Fetched ${rows.length} total rows`);

  // Group by model name (take the most recent eval for each)
  const byModel = {};
  for (const r of rows) {
    if (r.Flagged) continue;
    const name = r.fullname;
    if (!name) continue;
    if (!byModel[name] || r['Submission Date'] > byModel[name]['Submission Date']) {
      byModel[name] = r;
    }
  }
  const uniqueModels = Object.entries(byModel);
  logger.info(`  ${uniqueModels.length} unique non-flagged models`);

  // Group by HF org → our provider
  const byProvider = {};
  let unmappedCount = 0;
  for (const [name, r] of uniqueModels) {
    const org = name.split('/')[0];
    const mapped = mapOrgToProvider(org);
    if (mapped) {
      if (!byProvider[mapped]) byProvider[mapped] = [];
      byProvider[mapped].push({ name, row: r, org });
    } else {
      unmappedCount++;
    }
  }

  const mappedTotal = Object.values(byProvider).reduce((s, a) => s + a.length, 0);
  logger.info(
    `  Mapped to providers: ${mappedTotal} models across ${Object.keys(byProvider).length} providers`,
  );
  logger.info(`  Unmapped: ${unmappedCount}`);

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to persist.');
    logger.info('\nProvider distribution (top 20):');
    const sorted = Object.entries(byProvider).sort((a, b) => b[1].length - a[1].length);
    for (const [slug, models] of sorted.slice(0, 20)) {
      logger.info(`  ${slug}: ${models.length} models`);
    }
    logger.info('\nSample entries:');
    for (const [slug, models] of sorted.slice(0, 3)) {
      for (const m of models.slice(0, 3)) {
        logger.info(
          `  ${slug}/${m.name} — Avg: ${m.row['Average ⬆️']?.toFixed(2)}, Params: ${m.row['#Params (B)']}B`,
        );
      }
    }
    process.exit(0);
  }

  // --apply: persist to DB
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

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
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
    for (const [mappedSlug, models] of Object.entries(byProvider)) {
      // Upsert external_source_provider
      const { rows: espRows } = await client.query(
        `INSERT INTO external_source_providers (source_id, external_name, mapped_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_id, external_name) DO UPDATE SET mapped_slug = EXCLUDED.mapped_slug
         RETURNING id`,
        [sourceId, mappedSlug, mappedSlug],
      );
      const espId = espRows[0].id;

      for (const m of models) {
        const row = m.row;
        const limits = JSON.stringify({
          avgScore: row['Average ⬆️'],
          paramsB: row['#Params (B)'],
          precision: row['Precision'],
          architecture: row['Architecture'],
          license: row['Hub License'],
          hubLikes: row['Hub ❤️'],
          moe: row['MoE'],
          benchmarks: {
            ifeval: row['IFEval'],
            ifevalRaw: row['IFEval Raw'],
            bbh: row['BBH'],
            bbhRaw: row['BBH Raw'],
            mathLvl5: row['MATH Lvl 5'],
            mathLvl5Raw: row['MATH Lvl 5 Raw'],
            gpqa: row['GPQA'],
            gpqaRaw: row['GPQA Raw'],
            musr: row['MUSR'],
            musrRaw: row['MUSR Raw'],
            mmluPro: row['MMLU-PRO'],
            mmluProRaw: row['MMLU-PRO Raw'],
          },
          hfOrg: m.org,
          submissionDate: row['Submission Date'],
          generation: row['Generation']?.toString(),
          externalName: row.fullname,
        });

        await client.query(
          `INSERT INTO external_source_models (source_id, external_source_provider_id, model_name, model_limits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (source_id, external_source_provider_id, model_name) DO UPDATE SET
             model_limits = EXCLUDED.model_limits`,
          [sourceId, espId, m.name, limits],
        );
        totalInserted++;
      }
    }

    await client.query('COMMIT');
    logger.info(
      `  Stored ${Object.keys(byProvider).length} provider mappings with ${totalInserted} models`,
    );
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

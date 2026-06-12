#!/usr/bin/env node
/**
 * validate-free-models.js
 * Re-tests free models (rate-limited and untested) via burst + delayed request phases.
 * By default skips models marked as working (6-day cache). Rate-limited models are re-tested
 * unless tested within the last 24 hours. Use --force to re-test all.
 *
 * Usage: node scripts/validate-free-models.js [--models id1,id2] [--apply] [--force] [--coding-only] [--compare]
 *   --models       : Specific model IDs to test (comma-separated)
 *   --apply        : Write results to available-models.json (default: report only)
 *   --force        : Re-test all models, skipping the 6-day working model cache
 *   --coding-only  : Only test models whose best_for tags match coding/agentic/reasoning patterns
 *   --compare      : After testing, compare results against the previous run and print changes
 */

require('dotenv').config();
const https = require('https');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const DB_POOL = require('../server/db');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const CODING_ONLY = args.includes('--coding-only');
const COMPARE = args.includes('--compare');
let specificModels = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--models' && args[i + 1]) {
    specificModels = args[++i].split(',').map((s) => s.trim());
  }
}

// Graceful exit that closes the DB pool
async function die(code) {
  try {
    await DB_POOL.end();
  } catch {}
  process.exit(code);
}

const PROVIDER_CONFIG = require('./provider-config.json');

/** Check if a model's provider is health-trackable (DB-driven, not hardcoded) */
function isInferenceProvider(fullId) {
  const providerSlug = fullId.split('/')[0];
  return healthTrackableProviders.has(providerSlug);
}

// Loaded at startup from DB datapoint_providers.is_health_trackable
let healthTrackableProviders = new Set();

/** Categorize a validation failure from status + detail into a structured category */
function categorizeFailure(status, detail) {
  if (status === 'working' || status === 'untested') return null;
  const d = (detail || '').toLowerCase();
  if (status === 'not_found' || d.includes('not found') || d.includes('404')) return 'not_found';
  if (
    d.includes('timeout') ||
    d.includes('timed out') ||
    d.includes('ETIMEDOUT') ||
    status === 'timeout'
  )
    return 'timeout';
  if (
    d.includes('401') ||
    d.includes('403') ||
    d.includes('unauthorized') ||
    d.includes('forbidden') ||
    d.includes('auth') ||
    d.includes('key') ||
    d.includes('expired')
  )
    return 'auth_error';
  if (status === 'rate_limited' || d.includes('429') || d.includes('rate limit'))
    return 'rate_limited';
  if (d.includes('500') || d.includes('502') || d.includes('503') || d.includes('server error'))
    return 'server_error';
  if (
    d.includes('ECONNREFUSED') ||
    d.includes('ECONNRESET') ||
    d.includes('ENOTFOUND') ||
    d.includes('network') ||
    d.includes('DNS')
  )
    return 'network_error';
  return 'unknown';
}

/** Compute average latency from burst + delayed request results */
function computeAverageLatency(result) {
  const allLatencies = [
    ...(result.burst || []).map((r) => r.latencyMs),
    ...(result.delayed || []).map((r) => r.latencyMs),
  ].filter((l) => l !== null && l !== undefined);
  if (allLatencies.length === 0) return null;
  return Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length);
}

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');

/** Parse rate limit string like "20 RPM / 1,000 TPM" into delay config */
function parseRateLimit(str) {
  if (!str) return { rpm: null, delayMs: 3000 };
  const match = str.match(/(\d+)\s*RPM/);
  if (!match) return { rpm: null, delayMs: 3000 };
  const rpm = parseInt(match[1], 10);
  const delayMs = Math.ceil(60000 / rpm);
  return { rpm, delayMs };
}

/** Get pre-computed rate limit config for an endpoint */
const rateLimitCache = {};
function getRateLimit(endpoint) {
  if (rateLimitCache[endpoint]) return rateLimitCache[endpoint];
  const cfg = PROVIDER_CONFIG[endpoint];
  const rl = parseRateLimit(cfg ? cfg.rateLimit : null);
  rateLimitCache[endpoint] = rl;
  return rl;
}
const AUTH_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\pc',
  '.local',
  'share',
  'opencode',
  'auth.json',
);
let auth;

// Load data from PostgreSQL
let json = null;

const buildModelsData = require('./build-models-data');

async function loadFromDb() {
  const client = await DB_POOL.connect();
  try {
    json = await buildModelsData(client, DB_POOL);
  } finally {
    client.release();
  }
}

async function loadHealthTrackableProviders() {
  try {
    const { rows } = await DB_POOL.query(
      `SELECT slug FROM datapoint_providers WHERE is_health_trackable = true OR is_health_trackable IS NULL`,
    );
    healthTrackableProviders = new Set(rows.map((r) => r.slug));
    logger.info(
      `Health-trackable providers: ${rows.length} (${[...healthTrackableProviders].join(', ')})`,
    );
  } catch (e) {
    // Fallback to empty set if column doesn't exist yet
    logger.warn(`Could not load health-trackable providers: ${e.message}`);
    healthTrackableProviders = new Set();
  }
}

async function saveToDbAndExport(observations = [], healthSnapshots = []) {
  const client = await DB_POOL.connect();
  try {
    // Snapshot current test_summary as "previous" before overwriting
    const { rows: prevRows } = await client.query(
      `SELECT value::text FROM metadata WHERE key = '_test_summary'`,
    );
    const prevValue = prevRows.length > 0 ? prevRows[0].value : null;

    await client.query('BEGIN');
    for (const m of json.models) {
      await client.query(
        `UPDATE datapoint_models SET
           status_result = $1, status_tested = $2, status_detail = $3, last_success = $4,
           failure_category = $6
         WHERE full_id = $5`,
        [
          m.status.result,
          m.status.tested,
          m.status.detail,
          m.last_success || null,
          m.id,
          categorizeFailure(m.status.result, m.status.detail),
        ],
      );
    }
    await client.query(
      `INSERT INTO metadata (key, value) VALUES ('_test_summary', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(json._test_summary)],
    );
    if (prevValue) {
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_test_summary_previous', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [prevValue],
      );
    }
    // Persist key health data for historical monitoring
    if (json._key_health) {
      await client.query(
        `INSERT INTO metadata (key, value) VALUES ('_key_health', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(json._key_health)],
      );
    }
    await client.query('COMMIT');

    // Health snapshots now derived from test_observations (migration 041).
    // model_health_snapshots writes are deprecated — observations below provide
    // the per-request data that build-models-data.js aggregates into snapshots.

    // Insert observations after commit (non-critical, best-effort)
    if (observations.length > 0) {
      try {
        const BATCH_SIZE = 100;
        for (let i = 0; i < observations.length; i += BATCH_SIZE) {
          const batch = observations.slice(i, i + BATCH_SIZE);
          const placeholders = [];
          const params = [];
          let idx = 1;
          for (const obs of batch) {
            placeholders.push(
              `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`,
            );
            params.push(
              obs.datapoint_model_id,
              obs.full_id,
              obs.provider,
              obs.model_name,
              obs.status,
              obs.latency_ms,
              obs.error_type,
              obs.metadata || null,
            );
            idx += 8;
          }
          await client.query(
            `INSERT INTO test_observations (datapoint_model_id, full_id, provider, model_name, status, latency_ms, error_type, metadata) VALUES ${placeholders.join(', ')}`,
            params,
          );
        }
        logger.info(`Recorded ${observations.length} test observations`);
      } catch (e) {
        logger.error(`Failed to record test observations: ${e.message}`);
      }
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback error */
    }
    throw e;
  } finally {
    client.release();
  }
  const exporter = require('./export-from-pg');
  await exporter(DB_POOL);
  logger.info(`Exported to ${MODELS_FILE}`);
}

// --- Result tracking ---
const endpointStats = {};
const endpointHttpErrors = {}; // endpoint -> { httpStatus: count }

function initEndpointStat(ep) {
  if (!endpointStats[ep]) {
    endpointStats[ep] = { tested: 0, passed: 0, failed: 0, timedOut: 0, failures: [] };
  }
}

function recordEndpointHttpError(ep, httpStatus) {
  if (!endpointHttpErrors[ep]) endpointHttpErrors[ep] = {};
  if (!endpointHttpErrors[ep][httpStatus]) endpointHttpErrors[ep][httpStatus] = 0;
  endpointHttpErrors[ep][httpStatus]++;
}

function recordModelResult(ep, modelId, status, error) {
  initEndpointStat(ep);
  const s = endpointStats[ep];
  s.tested++;
  if (status === 'working') s.passed++;
  else if (status === 'timeout') s.timedOut++;
  else s.failed++;
  if (status !== 'working') {
    s.failures.push({ model: modelId, status, error });
  }
}

/** Print formatted per-endpoint results table */
function printResultsTable() {
  logger.info('\n─── Validation Results ───');
  logger.info(
    `  ${'Endpoint'.padEnd(16)} ${'Tested'.padEnd(8)} ${'Passed'.padEnd(8)} ${'Failures'.padEnd(10)} ${'Pass Rate'}`,
  );
  logger.info('  ' + '─'.repeat(70));
  for (const [ep, s] of Object.entries(endpointStats)) {
    const rate = s.tested > 0 ? `${Math.round((s.passed / s.tested) * 100)}%` : 'N/A';
    const flag = s.tested > 0 && s.passed / s.tested < 0.5 ? ' ⚠ PROVIDER OUTAGE?' : '';
    logger.info(
      `  ${ep.padEnd(16)} ${String(s.tested).padEnd(8)} ${String(s.passed).padEnd(8)} ${String(s.failed).padEnd(10)} ${rate}${flag}`,
    );
    for (const f of s.failures.slice(0, 5)) {
      logger.info(`    → ${f.model}: ${f.status}${f.error ? ` (${f.error})` : ''}`);
    }
    if (s.failures.length > 5) {
      logger.info(`    ... and ${s.failures.length - 5} more`);
    }
  }
  const totalTested = Object.values(endpointStats).reduce((n, s) => n + s.tested, 0);
  const totalPassed = Object.values(endpointStats).reduce((n, s) => n + s.passed, 0);
  const overallRate = totalTested > 0 ? `${Math.round((totalPassed / totalTested) * 100)}%` : 'N/A';
  logger.info('  ' + '─'.repeat(70));
  logger.info(`  Total: ${totalTested} tested, ${totalPassed} passed, rate: ${overallRate}`);
  logger.info('────────────────────────\n');
}

// --- Helpers ---
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { ...headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Cooldown state per endpoint (Item 9) ──
const cooldownState = new Map(); // endpoint → { until: epochMs, reason: string }
const COOLDOWN_FILE = path.join(REPO_ROOT, '.cooldown-state.json');

function loadCooldownState() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
      const now = Date.now();
      for (const [ep, val] of Object.entries(data)) {
        if (val.until > now) cooldownState.set(ep, val);
      }
    }
  } catch {
    /* cooldown file is advisory */
  }
}

function saveCooldownState() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [ep, val] of cooldownState.entries()) {
      if (val.until > now) obj[ep] = val;
    }
    if (Object.keys(obj).length > 0) {
      fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(obj, null, 2));
    } else {
      try {
        fs.unlinkSync(COOLDOWN_FILE);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* cooldown persistence is best-effort */
  }
}

function cooldownTTL(errorType) {
  switch (errorType) {
    case 'auth_error':
      return 30 * 60 * 1000; // 30 min — broken key
    case 'rate_limited':
      return 60 * 1000; // 1 min — back off
    case 'server_error':
      return 5 * 60 * 1000; // 5 min — transient
    case 'timeout':
      return 2 * 60 * 1000; // 2 min — network blip
    case 'network_error':
      return 10 * 60 * 1000; // 10 min — connectivity
    default:
      return 0; // no cooldown
  }
}

function isInCooldown(endpoint) {
  const cd = cooldownState.get(endpoint);
  if (!cd) return false;
  if (Date.now() >= cd.until) {
    cooldownState.delete(endpoint);
    return false;
  }
  return true;
}

function applyCooldown(endpoint, errorType) {
  const ttl = cooldownTTL(errorType);
  if (ttl <= 0) return; // client_error (except 429) doesn't cooldown
  cooldownState.set(endpoint, { until: Date.now() + ttl, reason: errorType });
  saveCooldownState();
}

// --- Provider configuration ---
function getEndpoint(modelId) {
  if (modelId.startsWith('cerebras/')) return 'cerebras';
  if (modelId.startsWith('nvidia/')) return 'nvidia';
  if (modelId.startsWith('huggingface/')) return 'huggingface';
  if (modelId.startsWith('llmgateway/')) return 'llmgateway';
  if (modelId.startsWith('deepseek/')) return 'deepseek';
  if (modelId.startsWith('opencode/')) return 'opencode';
  if (modelId.startsWith('alibaba/')) return 'alibaba';
  if (modelId.startsWith('google/')) return 'google';
  if (modelId.startsWith('groq/')) return 'groq';
  if (modelId.startsWith('deepinfra/')) return 'deepinfra';
  if (modelId.startsWith('novitaai/')) return 'novitaai';
  if (modelId.startsWith('siliconflow/')) return 'siliconflow';
  if (modelId.startsWith('cloudflare/')) return 'cloudflare';
  if (modelId.startsWith('xai/')) return 'xai';
  if (modelId.startsWith('zhipuai/')) return 'zhipuai';
  return 'openrouter';
}

const ENDPOINT_CONFIG = {
  alibaba: {
    url: 'https://dashscope.aliyuncs.com/api/v1/chat/completions',
    key: () => auth.alibaba?.DASHSCOPE_API_KEY,
    modelsUrl: 'https://dashscope.aliyuncs.com/api/v1/models',
    fetchIds: async (k) => parseSimpleModels(k, 'https://dashscope.aliyuncs.com/api/v1/models'),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: () => auth.openrouter.key,
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    fetchIds: async (k) => parseOpenRouterModels(k),
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    key: () => auth.cerebras.key,
    modelsUrl: 'https://api.cerebras.ai/v1/models',
    fetchIds: async (k) => parseSimpleModels(k, 'https://api.cerebras.ai/v1/models'),
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: () => auth.nvidia.key,
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    fetchIds: async (k) => parseSimpleModels(k, 'https://integrate.api.nvidia.com/v1/models'),
  },
  huggingface: {
    url: 'https://router.huggingface.co/v1/chat/completions',
    key: () => auth.huggingface.key,
    fetchIds: async () => null,
  },
  llmgateway: {
    url: 'https://api.llmgateway.io/v1/chat/completions',
    key: () => auth.llmgateway.key,
    fetchIds: async () => null,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: () => auth.deepseek.key,
    fetchIds: async () => null,
  },
  opencode: {
    url: 'https://opencode.ai/zen/v1/chat/completions',
    key: () => auth.opencode.key,
    fetchIds: async () => null,
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: () => auth.google.key,
    fetchIds: async () => parseGoogleModels(auth.google.key),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => auth.groq?.key,
    fetchIds: async () => null,
  },
  deepinfra: {
    url: 'https://api.deepinfra.com/v1/openai/chat/completions',
    key: () => auth.deepinfra?.key,
    fetchIds: async () => null,
  },
  novitaai: {
    url: 'https://api.novita.ai/v3/openai/chat/completions',
    key: () => auth.novitaai?.key,
    fetchIds: async () => null,
  },
  siliconflow: {
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    key: () => auth.siliconflow?.key,
    fetchIds: async () => null,
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    key: () => auth.xai?.key,
    modelsUrl: 'https://api.x.ai/v1/models',
    fetchIds: async (k) => parseSimpleModels(k, 'https://api.x.ai/v1/models'),
  },
  zhipuai: {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: () => auth.zhipuai?.key,
    modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    fetchIds: async (k) => parseSimpleModels(k, 'https://open.bigmodel.cn/api/paas/v4/models'),
  },
};

async function parseOpenRouterModels(key) {
  const data = await httpsGet('https://openrouter.ai/api/v1/models', {
    Authorization: `Bearer ${key}`,
  });
  const parsed = JSON.parse(data);
  return new Set(
    parsed.data
      .filter((m) => {
        if (m.id.endsWith(':free')) return true;
        // Also include zero-priced models (like openrouter/owl-alpha)
        const p = m.pricing || {};
        if (typeof p === 'string') return p === '0';
        return parseFloat(p.prompt ?? p.input) === 0 && parseFloat(p.completion ?? p.output) === 0;
      })
      .map((m) => m.id.replace(/^openrouter\//, '')),
  ); // strip prefix for comparison
}

async function parseSimpleModels(key, url) {
  if (!key) return null;
  const data = await httpsGet(url, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed.data)) return null;
  return new Set(parsed.data.map((m) => m.id));
}

async function parseGoogleModels(key) {
  const data = await httpsGet(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const parsed = JSON.parse(data);
  return new Set(
    parsed.models
      .filter((m) => m.name.startsWith('models/gemini-'))
      .map((m) => m.name.replace('models/', '')),
  );
}

// Convert stored model ID → API-expected model ID, using the known-valid set
function resolveApiModelId(modelId, endpoint, validIds) {
  if (endpoint === 'openrouter') {
    // Strip openrouter/ prefix
    const stripped = modelId.replace(/^openrouter\//, '');
    // Try as-is first, then with :free suffix
    if (validIds.has(stripped)) return stripped;
    if (!stripped.endsWith(':free') && validIds.has(stripped + ':free')) return stripped + ':free';
    return stripped; // return it anyway, will fail validation
  }
  // Google AI: strip google/ prefix
  if (endpoint === 'google') {
    const bare = modelId.replace(/^google\//, '');
    if (validIds.has(bare)) return bare;
    return bare;
  }
  // Non-OpenRouter: strip the provider prefix
  const slash = modelId.indexOf('/');
  const bare = slash !== -1 ? modelId.slice(slash + 1) : modelId;
  if (validIds.has(bare)) return bare;
  // For NVIDIA: if bare doesn't exist, try with nvidia/ prefix (NVIDIA-native models)
  if (endpoint === 'nvidia' && !bare.startsWith('nvidia/') && validIds.has('nvidia/' + bare))
    return 'nvidia/' + bare;
  return bare;
}

async function testModel(apiModelId, phase, apiKey, apiUrl, burstDelay = 1500, normalDelay = 3000) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://opencode.ai',
    'X-Title': 'opencode',
  };
  const body = {
    model: apiModelId,
    messages: [{ role: 'user', content: 'Reply with OK' }],
    max_tokens: 10,
  };
  const results = [];
  for (let i = 0; i < 3; i++) {
    let obs;
    let retries = 0;
    while (retries <= 1) {
      try {
        const startMs = Date.now();
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ETIMEDOUT')), 30000),
        );
        const res = await Promise.race([httpsPost(apiUrl, body, headers), timeout]);
        const latencyMs = Date.now() - startMs;

        if (res.status === 429 && retries === 0) {
          // Retry once on rate-limit with backoff
          const delay = phase === 'burst' ? 2000 : 5000;
          logger.info(`    Request ${i + 1}: 429, retrying in ${delay / 1000}s...`);
          await sleep(delay);
          retries++;
          continue;
        }
        if (res.status >= 500 && retries === 0) {
          // Retry once on server error
          await sleep(2000);
          retries++;
          continue;
        }
        const isOk = res.status >= 200 && res.status < 300;
        obs = {
          status: isOk ? 'OK' : String(res.status),
          latencyMs,
          errorType: isOk
            ? null
            : res.status === 429
              ? 'rate_limited'
              : res.status >= 500
                ? 'server_error'
                : 'client_error',
        };
        break;
      } catch (e) {
        const isTimeout =
          e.message === 'ETIMEDOUT' || e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET';
        if (isTimeout && retries === 0) {
          logger.info(`    Request ${i + 1}: timeout, retrying in 3s...`);
          await sleep(3000);
          retries++;
          continue;
        }
        obs = {
          status: isTimeout ? 'TIMEOUT' : 'ERR',
          latencyMs: isTimeout ? 30000 : null,
          errorType: isTimeout
            ? 'timeout'
            : e.code === 'ECONNRESET'
              ? 'network_error'
              : 'client_error',
        };
        break;
      }
    }
    results.push(obs);
    if (phase === 'burst') await sleep(burstDelay);
    else await sleep(normalDelay);
  }
  return results;
}

// --- Load from DB ---
(async () => {
  try {
    auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    loadCooldownState(); // Load persisted cooldown state (Item 9)
    await loadFromDb();
    await loadHealthTrackableProviders();
  } catch (e) {
    logger.error(`Failed to load from DB: ${e.message}\n${e.stack}`);
    await die(1);
  }

  if (!json || !Array.isArray(json.models)) {
    logger.error('Failed to load models data');
    await die(1);
  }
  logger.info(`Loaded ${json.models.length} models from PostgreSQL`);

  // ── Pre-validation key health check (#5) ──
  // Test one known-working model per provider before running the full suite.
  // If too many providers have dead keys (401/403), stop and report instead
  // of burning quota on thousands of doomed requests.
  const KEY_CHECK_MAX_FAILURES = 3; // abort if this many providers have dead keys
  {
    logger.info('\n─── Pre-validation Key Health Check ───');
    // For each endpoint that has an API key, find one known-working model
    const epModels = {};
    for (const ep of Object.keys(ENDPOINT_CONFIG)) {
      const cfg = ENDPOINT_CONFIG[ep];
      let key;
      try {
        key = cfg.key();
      } catch {
        key = null;
      }
      if (!key) {
        logger.info(`  ${ep}: no API key configured — skipping pre-check`);
        continue;
      }
      // Find a model that's currently marked as working for this endpoint
      const workingModel = json.models.find((m) => {
        if (!m.is_free || m._removed) return false;
        const modelEp = getEndpoint(m.id);
        return modelEp === ep && m.status.result === 'working';
      });
      if (!workingModel) {
        logger.info(`  ${ep}: no working model found for pre-check — skipping`);
        continue;
      }
      epModels[ep] = workingModel;
    }

    if (Object.keys(epModels).length === 0) {
      logger.info('  No providers to pre-check.\n');
    } else {
      // Test each provider's known-working model with a single quick request
      const preCheckResults = [];
      for (const [ep, model] of Object.entries(epModels)) {
        const cfg = ENDPOINT_CONFIG[ep];
        // Use model ID directly — pre-check runs before full validIds fetch
        // and we only care about auth errors (401/403), not 404s
        const apiId = resolveApiModelId(model.id, ep, new Set());
        logger.info(`  [${ep}] checking key with ${model.id} → ${apiId}`);
        try {
          const results = await testModel(apiId, 'pre-check', cfg.key(), cfg.url, 0, 0);
          const ok = results.filter((r) => r.status === 'OK').length;
          const authErrors = results.filter((r) => r.status === '401' || r.status === '403').length;
          const rateLimited = results.filter((r) => r.status === '429').length;

          if (authErrors > 0) {
            logger.info(`    ⚠ KEY DEAD: auth errors`);
            preCheckResults.push({ ep, status: 'dead', model: model.id });
          } else if (ok > 0) {
            logger.info(`    ✓ key working`);
            preCheckResults.push({ ep, status: 'ok', model: model.id });
          } else if (rateLimited > 0) {
            logger.info(`    ⚐ rate limited — key likely valid`);
            preCheckResults.push({ ep, status: 'rate_limited', model: model.id });
          } else {
            logger.info(`    ? unexpected: ${results.map((r) => r.status).join(', ')}`);
            preCheckResults.push({ ep, status: 'unknown', model: model.id });
          }
        } catch (e) {
          logger.info(`    ⚠ pre-check error: ${e.message}`);
          preCheckResults.push({ ep, status: 'error', model: model.id, error: e.message });
        }
      }

      const deadKeys = preCheckResults.filter((r) => r.status === 'dead');
      if (deadKeys.length >= KEY_CHECK_MAX_FAILURES) {
        logger.info(
          `\n⛔ ABORTING: ${deadKeys.length} providers have dead API keys (threshold: ${KEY_CHECK_MAX_FAILURES})`,
        );
        for (const dk of deadKeys) {
          logger.info(`  • ${dk.ep}: ${dk.model}`);
        }
        logger.info('Fix expired keys before running full validation.\n');
        await die(1);
      }
      if (deadKeys.length > 0) {
        logger.info(
          `\n⚠ Warning: ${deadKeys.length} dead key(s) detected — proceeding but these providers will fail:`,
        );
        for (const dk of deadKeys) {
          logger.info(`  • ${dk.ep}: ${dk.model}`);
        }
      } else {
        logger.info(`  All ${preCheckResults.length} providers passed pre-check.`);
      }
      logger.info('────────────────────────\n');
    }
  }

  // Capture previous test summary for --compare
  let previousSummary = null;
  if (COMPARE) {
    try {
      const { rows } = await DB_POOL.query(
        "SELECT value::text FROM metadata WHERE key = '_test_summary'",
      );
      if (rows.length > 0) {
        previousSummary = JSON.parse(rows[0].value);
        logger.info(`Captured previous summary from ${previousSummary.date} for comparison`);
      }
    } catch (e) {
      logger.info(`Could not read previous summary: ${e.message}`);
    }
  }

  // --- Determine which models to test ---
  const TEST_AGAIN_AFTER_DAYS = 6;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TEST_AGAIN_AFTER_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let toTest;
  if (specificModels && specificModels.length > 0) {
    toTest = json.models.filter((m) => specificModels.includes(m.id));
  } else {
    toTest = json.models.filter((m) => {
      if (!m.is_free) return false;
      // Cloudflare Workers AI uses a non-OpenAI-compatible REST API — skip validation
      if (m.id.startsWith('cloudflare/')) return false;
      const result = m.status.result;
      if (result === 'broken' || result === 'untested') return true;
      if (result === 'rate_limited') {
        if (m.status.skip_retest === true && !FORCE) return false;
        if (!FORCE) {
          const tested = m.status.tested || '';
          const oneDayAgo = new Date();
          oneDayAgo.setDate(oneDayAgo.getDate() - 1);
          if (tested >= oneDayAgo.toISOString().slice(0, 10)) return false;
        }
        return true;
      }
      if (result === 'working' && FORCE) return true;
      if (result === 'working') {
        const tested = m.status.tested || '';
        const lastSuccess = m.last_success || '';
        return !(tested >= cutoffStr && lastSuccess >= cutoffStr);
      }
      return false;
    });
  }

  if (CODING_ONLY) {
    toTest = toTest.filter(
      (m) =>
        m.best_for &&
        m.best_for.some((f) =>
          /\b(cod|programm|agentic|reasoning|tool use|fast coding|fast responses?|lightweight|small tasks|function calling|code generation|code review|refactoring|thinking)\b/i.test(
            f,
          ),
        ),
    );
  }

  if (toTest.length === 0) {
    logger.info('No models to test.');
    await die(0);
  }

  // 1. Fetch valid model IDs from each provider
  logger.info('Fetching valid model IDs from providers...');
  const validIds = {};
  for (const [name, cfg] of Object.entries(ENDPOINT_CONFIG)) {
    try {
      validIds[name] = await cfg.fetchIds(cfg.key());
      logger.info(
        `  ${name}: ${validIds[name] ? validIds[name].size + ' models' : "can't pre-validate"}`,
      );
    } catch (e) {
      logger.info(`  ${name}: fetch failed (${e.message})`);
      validIds[name] = null;
    }
  }
  logger.info();

  // 2. Separate into confirmed-valid vs not-found
  const notFound = [];
  const confirmed = [];
  for (const m of toTest) {
    const ep = getEndpoint(m.id);
    const vIds = validIds[ep];
    if (!vIds) {
      confirmed.push(m); // can't pre-validate, test anyway
      continue;
    }
    const apiId = resolveApiModelId(m.id, ep, vIds);
    if (vIds.has(apiId)) {
      confirmed.push(m);
    } else {
      notFound.push({ model: m, triedId: apiId, endpoint: ep });
    }
  }

  if (notFound.length > 0) {
    logger.info(`Skipping ${notFound.length} models not found in provider API:`);
    for (const nf of notFound) logger.info(`  ${nf.model.id} → "${nf.triedId}" on ${nf.endpoint}`);
    logger.info();
  }

  if (confirmed.length === 0) {
    logger.info('No valid models to test.');
    await die(0);
  }

  // Load datapoint_model_ids for observation recording
  let dmIdByFullId = {};
  try {
    const { rows: dmIdRows } = await DB_POOL.query(
      'SELECT id, full_id FROM datapoint_models WHERE full_id = ANY($1)',
      [confirmed.map((m) => m.id)],
    );
    for (const r of dmIdRows) dmIdByFullId[r.full_id] = r.id;
  } catch (e) {
    logger.info(`Could not load DM IDs for observations: ${e.message}`);
  }

  // 3. Test confirmed models — endpoints in parallel, sequential within each
  logger.info(`Testing ${confirmed.length} models...\n`);
  const byEp = {};
  for (const m of confirmed) {
    const ep = getEndpoint(m.id);
    (byEp[ep] = byEp[ep] || []).push(m);
  }

  const allResults = [];

  async function testOne(m, dmIdMap, burstDelay, normalDelay) {
    const ep = getEndpoint(m.id);
    const cfg = ENDPOINT_CONFIG[ep];
    const vIds = validIds[ep];
    let apiId = resolveApiModelId(m.id, ep, vIds || new Set());
    // If resolveApiModelId returns something not in valid set, it's a fallback — still try it

    logger.info(`[${ep}] ${m.id} → ${apiId}`);
    let burst, delayed;
    try {
      burst = await testModel(apiId, 'burst', cfg.key(), cfg.url, burstDelay, normalDelay);
      delayed = await testModel(apiId, 'delayed', cfg.key(), cfg.url, burstDelay, normalDelay);
    } catch (e) {
      // Catch any unhandled errors from testModel
      logger.info(`  => \x1b[31mbroken\x1b[0m (unhandled error: ${e.message})\n`);
      recordModelResult(ep, m.id, 'broken', e.message);
      return {
        id: m.id,
        status: 'broken',
        detail: `Unhandled error: ${e.message}`,
        burst: [],
        delayed: [],
        observations: [],
      };
    }
    logger.info(`  Burst:   ${burst.map((r) => r.status).join(', ')}`);
    logger.info(`  Delayed: ${delayed.map((r) => r.status).join(', ')}`);

    // Track HTTP-level errors for key health monitoring
    for (const r of [...burst, ...delayed]) {
      if (
        r.status !== 'OK' &&
        r.status !== 'TIMEOUT' &&
        r.status !== 'ERR' &&
        !isNaN(parseInt(r.status))
      ) {
        recordEndpointHttpError(ep, r.status);
      }
    }

    // Build observation rows from individual request results
    const observations = [];
    function addObservations(arr, phase) {
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        observations.push({
          datapoint_model_id: dmIdMap[m.id] || null,
          full_id: m.id,
          provider: ep,
          model_name: m.name || null,
          status: r.status === 'OK' ? 'pass' : 'fail',
          latency_ms: r.latencyMs,
          error_type: r.errorType,
          metadata: JSON.stringify({
            request_phase: phase,
            api_model_id: apiId,
            request_num: i + 1,
          }),
        });
      }
    }
    addObservations(burst, 'burst');
    addObservations(delayed, 'delayed');

    const all = [...burst, ...delayed];
    const ok = all.filter((r) => r.status === 'OK').length;
    const total = all.length;

    let status, detail;
    if (ok === total) {
      status = 'working';
      detail = `All ${total} requests succeeded.`;
    } else if (ok === 0) {
      const all429 = all.every((r) => r.status === '429');
      const allTimeout = all.some((r) => r.status === 'TIMEOUT');
      status = all429 ? 'rate_limited' : allTimeout ? 'broken' : 'broken';
      detail = all429
        ? `All ${total} requests rate-limited (429).`
        : allTimeout
          ? `All ${total} requests timed out.`
          : `All ${total} requests failed — server errors or connection issues.`;
    } else if (ok >= 4) {
      status = 'working';
      detail = `${ok}/${total} OK. Intermittent failures under load.`;
    } else {
      status = 'rate_limited';
      detail = `${ok}/${total} OK - sporadic, not reliably usable.`;
    }

    // Apply cooldown based on observed error types (Item 9)
    const nonOkErrorTypes = new Set(
      all
        .filter((r) => r.status !== 'OK')
        .map((r) => r.errorType)
        .filter(Boolean),
    );
    for (const et of nonOkErrorTypes) applyCooldown(ep, et);

    recordModelResult(ep, m.id, status, detail);

    const color = status === 'working' ? '\x1b[32m' : '\x1b[33m';
    logger.info(`  => ${color}${status}\x1b[0m\n`);
    return { id: m.id, status, detail, burst, delayed, observations };
  }

  async function runEndpoint(ep) {
    if (isInCooldown(ep)) {
      const cd = cooldownState.get(ep);
      const remaining = Math.ceil((cd.until - Date.now()) / 1000);
      logger.info(`  [${ep}] in cooldown (${cd.reason}) — ${remaining}s remaining, skipping`);
      return;
    }
    const rl = getRateLimit(ep);
    const burstDelayMs = Math.ceil(rl.delayMs * 0.5);
    const normalDelayMs = rl.delayMs;
    logger.info(
      `  [${ep}] rate limit: ${rl.rpm ? rl.rpm + ' RPM' : 'default'} → burst ${burstDelayMs}ms, normal ${normalDelayMs}ms`,
    );

    const models = byEp[ep] || [];
    for (let i = 0; i < models.length; i++) {
      allResults.push(await testOne(models[i], dmIdByFullId, burstDelayMs, normalDelayMs));
      if (i < models.length - 1) {
        await sleep(normalDelayMs);
      }
    }
  }

  await Promise.all(Object.keys(byEp).map(runEndpoint));

  // Add not_found entries
  for (const nf of notFound) {
    recordModelResult(nf.endpoint, nf.model.id, 'not_found', `Model "${nf.triedId}" not found`);
    allResults.push({
      id: nf.model.id,
      status: 'not_found',
      detail: `Model "${nf.triedId}" not found in ${nf.endpoint} API.`,
      burst: [],
      delayed: [],
    });
  }

  // --- Summary ---
  printResultsTable();

  // Provider outage alerts with stale=healthy semantics (Item 10)
  // Providers in cooldown are assumed healthy — they were skipped intentionally
  const outageProviders = [];
  for (const [ep, s] of Object.entries(endpointStats)) {
    if (s.tested > 0 && s.passed / s.tested < 0.5) {
      outageProviders.push({
        endpoint: ep,
        passRate: `${Math.round((s.passed / s.tested) * 100)}%`,
        failed: s.failed,
        tested: s.tested,
      });
    }
  }
  if (outageProviders.length > 0) {
    logger.info('⚠ Potential provider outages detected:');
    for (const p of outageProviders) {
      logger.info(`  ${p.endpoint}: ${p.passed}/${p.tested} passed (${p.passRate})`);
    }
    logger.info('');
  }

  // Report currently cooldowned providers (assumed healthy, not flagged as outage)
  const now = Date.now();
  const activeCooldowns = [...cooldownState.entries()].filter(([, v]) => v.until > now);
  if (activeCooldowns.length > 0) {
    logger.info('─── Cooldown States (stale = healthy) ───');
    for (const [ep, cd] of activeCooldowns) {
      const remaining = Math.ceil((cd.until - now) / 1000);
      logger.info(`  ${ep}: ${cd.reason} (${remaining}s remaining)`);
    }
    logger.info('────────────────────────\n');
  }

  // --- Key health classification ---
  const today = new Date().toISOString().slice(0, 10);

  function classifyEndpointHealth(ep) {
    const s = endpointStats[ep];
    if (!s || s.tested === 0) return 'unknown';
    if (s.passed === s.tested) return 'healthy';

    const httpErrs = endpointHttpErrors[ep] || {};
    // Count total non-OK HTTP responses (not timeouts/network errors, just HTTP status codes)
    let totalHttpErrors = 0;
    let authErrors = 0;
    let rateLimitErrors = 0;
    for (const [code, count] of Object.entries(httpErrs)) {
      totalHttpErrors += count;
      if (code === '401' || code === '403') authErrors += count;
      if (code === '429') rateLimitErrors += count;
    }

    if (totalHttpErrors > 0 && authErrors === totalHttpErrors) return 'expired';
    if (totalHttpErrors > 0 && rateLimitErrors === totalHttpErrors) return 'rate_limited';
    if (s.passed > 0) return 'degraded';
    return 'broken';
  }

  const keyHealth = {};
  for (const ep of Object.keys(endpointStats)) {
    keyHealth[ep] = {
      status: classifyEndpointHealth(ep),
      tested: endpointStats[ep].tested,
      passed: endpointStats[ep].passed,
      failed: endpointStats[ep].failed,
      timedOut: endpointStats[ep].timedOut,
      date: today,
    };
  }
  // Include endpoints in cooldown (they were skipped, so last known state is the best we have)
  // Cooldowned endpoints get a 'cooldown_skipped' status to distinguish from intentionally-untested
  for (const [ep, cd] of activeCooldowns) {
    if (!keyHealth[ep]) {
      keyHealth[ep] = {
        status: 'cooldown_skipped',
        tested: 0,
        passed: 0,
        failed: 0,
        timedOut: 0,
        date: today,
        cooldown_reason: cd.reason,
      };
    }
  }

  // Print key health overview
  logger.info('─── API Key Health ───');
  for (const [ep, kh] of Object.entries(keyHealth).sort()) {
    const icon =
      kh.status === 'healthy'
        ? ''
        : kh.status === 'expired'
          ? ' (KEY MAY BE EXPIRED)'
          : kh.status === 'rate_limited'
            ? ' (RATE LIMITED)'
            : kh.status === 'degraded'
              ? ' (DEGRADED)'
              : kh.status === 'broken'
                ? ' (BROKEN)'
                : '';
    logger.info(`  ${ep.padEnd(16)} ${kh.status}${icon}`);
    // Distinguish "model is dead" from "key expired" — print HTTP error breakdown for degraded endpoints
    if (kh.status !== 'healthy' && kh.status !== 'unknown' && kh.status !== 'cooldown_skipped') {
      const httpErrs = endpointHttpErrors[ep] || {};
      const parts = Object.entries(httpErrs)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([code, count]) => `${code}:${count}`);
      if (parts.length > 0) logger.info(`    HTTP errors: ${parts.join(', ')}`);
    }
  }
  logger.info('─────────────────────\n');

  if (!APPLY) {
    logger.info('\nReport mode. Use --apply to update available-models.json');
    return;
  }

  // --- Apply results ---

  // NOTE: opencode/ models are skipped (require Zen SDK). They keep their existing status.
  // NOTE: _role_rankings are NOT updated here — that's rank-models.js's job.
  for (const r of allResults) {
    const model = json.models.find((m) => m.id === r.id);
    if (!model) continue;

    model.status.tested = today;
    model.status.result = r.status;
    model.status.detail = r.detail;
    if (r.status === 'working') model.last_success = new Date().toISOString();

    // Update test_summary
    const ts = json._test_summary.results;
    if (!ts.not_found) ts.not_found = [];
    const rmSafe = (arr, id) => {
      if (arr) {
        const i = arr.indexOf(id);
        if (i !== -1) arr.splice(i, 1);
      }
    };
    if (r.status === 'working') {
      rmSafe(ts.rate_limited, r.id);
      rmSafe(ts.broken, r.id);
      rmSafe(ts.untested, r.id);
      rmSafe(ts.not_found, r.id);
      if (!ts.working.includes(r.id)) ts.working.push(r.id);
    } else if (r.status === 'rate_limited') {
      rmSafe(ts.working, r.id);
      rmSafe(ts.broken, r.id);
      rmSafe(ts.untested, r.id);
      rmSafe(ts.not_found, r.id);
      if (!ts.rate_limited.includes(r.id)) ts.rate_limited.push(r.id);
    } else if (r.status === 'broken') {
      rmSafe(ts.working, r.id);
      rmSafe(ts.rate_limited, r.id);
      rmSafe(ts.untested, r.id);
      rmSafe(ts.not_found, r.id);
      if (!ts.broken.includes(r.id)) ts.broken.push(r.id);
    } else if (r.status === 'not_found') {
      rmSafe(ts.working, r.id);
      rmSafe(ts.rate_limited, r.id);
      rmSafe(ts.broken, r.id);
      rmSafe(ts.untested, r.id);
      if (!ts.not_found.includes(r.id)) ts.not_found.push(r.id);
    }
  }

  json._test_summary.date = today;
  json._key_health = keyHealth;

  // Collect observations from allResults for insertion
  const allObservations = [];
  for (const r of allResults) {
    if (r.observations && r.observations.length > 0) {
      allObservations.push(...r.observations);
    }
  }
  // Add observations for not_found models
  for (const nf of notFound) {
    allObservations.push({
      datapoint_model_id: dmIdByFullId[nf.model.id] || null,
      full_id: nf.model.id,
      provider: nf.endpoint,
      model_name: nf.model.name || null,
      status: 'fail',
      latency_ms: null,
      error_type: 'not_found',
      metadata: JSON.stringify({ tried_id: nf.triedId }),
    });
  }

  // Compute health snapshots for inference providers only
  const healthSnapshots = allResults
    .filter((r) => isInferenceProvider(r.id))
    .map((r) => ({
      full_id: r.id,
      status: r.status,
      detail: r.detail,
      latency_ms: computeAverageLatency(r),
    }));

  await saveToDbAndExport(allObservations, healthSnapshots);
  logger.info('DB updated and JSON exported successfully');

  // --- Auto re-rank if working set actually changed ---
  // Compare current results against previous test summary to avoid spurious re-ranking.
  let workingChanged;
  try {
    const { rows: prevRows } = await DB_POOL.query(
      "SELECT value::text FROM metadata WHERE key = '_test_summary_previous'",
    );
    if (prevRows.length > 0) {
      const prevSummary = JSON.parse(prevRows[0].value);
      const prevWorking = new Set(prevSummary.results?.working || []);
      const prevBroken = new Set(prevSummary.results?.broken || []);
      const prevRateLimited = new Set(prevSummary.results?.rate_limited || []);

      const curWorking = new Set();
      const curBroken = new Set();
      const curRateLimited = new Set();
      for (const r of allResults) {
        if (r.status === 'working') curWorking.add(r.id);
        else if (r.status === 'broken') curBroken.add(r.id);
        else if (r.status === 'rate_limited') curRateLimited.add(r.id);
      }

      // Detect actual changes in any status bucket
      const workingAdded = [...curWorking].filter((id) => !prevWorking.has(id));
      const workingDropped = [...prevWorking].filter(
        (id) => curBroken.has(id) || curRateLimited.has(id),
      );
      const brokenAdded = [...curBroken].filter((id) => !prevBroken.has(id) && prevWorking.has(id));
      const rateLimitedAdded = [...curRateLimited].filter(
        (id) => !prevRateLimited.has(id) && prevWorking.has(id),
      );
      const brokenResolved = [...prevBroken].filter((id) => curWorking.has(id));
      const rateLimitedResolved = [...prevRateLimited].filter((id) => curWorking.has(id));

      workingChanged =
        workingAdded.length > 0 ||
        workingDropped.length > 0 ||
        brokenAdded.length > 0 ||
        rateLimitedAdded.length > 0 ||
        brokenResolved.length > 0 ||
        rateLimitedResolved.length > 0;
    } else {
      // No previous summary — first run, re-rank if we have any results
      workingChanged = allResults.length > 0;
    }
  } catch (e) {
    logger.info(`Could not check previous summary: ${e.message}`);
    workingChanged = allResults.some(
      (r) => r.status === 'working' || r.status === 'broken' || r.status === 'rate_limited',
    );
  }
  if (workingChanged) {
    logger.info('\nWorking set changed — auto re-ranking...');
    const { execFileSync } = require('child_process');
    try {
      const output = execFileSync('node', [path.join(__dirname, 'rank-models.js'), '--apply'], {
        encoding: 'utf8',
      });
      logger.info(output.trim());
    } catch (e) {
      logger.error('Auto-rank failed: ' + e.message);
    }
  }

  // --- Compare with previous run (--compare) ---
  if (COMPARE && previousSummary) {
    const prevResults = {};
    for (const [category, ids] of Object.entries(previousSummary.results)) {
      for (const id of ids || []) {
        prevResults[id] = category;
      }
    }

    const currentResults = {};
    for (const r of allResults) {
      currentResults[r.id] = r.status;
    }

    const recovered = []; // was broken/rate_limited/not_found, now working
    const newFailures = []; // was working/untested, now broken/rate_limited/not_found
    const statusChanges = []; // any other status change

    for (const [id, curStatus] of Object.entries(currentResults)) {
      const prevStatus = prevResults[id];
      if (!prevStatus) continue; // newly tested, no previous run
      if (prevStatus === curStatus) continue; // no change

      if (curStatus === 'working' && prevStatus !== 'working') {
        recovered.push({ id, from: prevStatus, to: curStatus });
      } else if (curStatus !== 'working' && prevStatus === 'working') {
        newFailures.push({ id, from: prevStatus, to: curStatus });
      } else {
        statusChanges.push({ id, from: prevStatus, to: curStatus });
      }
    }

    // Also check for models that disappeared (were in prev, not in current results)
    const missing = [];
    for (const [id, prevStatus] of Object.entries(prevResults)) {
      if (
        (!currentResults[id] && id.startsWith('openrouter/')) ||
        id.startsWith('cerebras/') ||
        id.startsWith('nvidia/') ||
        id.startsWith('huggingface/') ||
        id.startsWith('deepseek/') ||
        id.startsWith('llmgateway/') ||
        id.startsWith('google/') ||
        id.startsWith('opencode/') ||
        id.startsWith('cloudflare/')
      ) {
        missing.push({ id, was: prevStatus });
      }
    }

    const totalChanges =
      recovered.length + newFailures.length + statusChanges.length + missing.length;
    logger.info('\n─── Changes Since Last Run ───');
    if (totalChanges === 0) {
      logger.info('  No changes detected.');
    } else {
      if (recovered.length > 0) {
        logger.info(`  Recovered (${recovered.length}):`);
        for (const c of recovered) logger.info(`    + ${c.id}: ${c.from} → ${c.to}`);
      }
      if (newFailures.length > 0) {
        logger.info(`  New failures (${newFailures.length}):`);
        for (const c of newFailures) logger.info(`    - ${c.id}: ${c.from} → ${c.to}`);
      }
      if (statusChanges.length > 0) {
        logger.info(`  Status changes (${statusChanges.length}):`);
        for (const c of statusChanges) logger.info(`    ~ ${c.id}: ${c.from} → ${c.to}`);
      }
      if (missing.length > 0) {
        logger.info(`  Not re-tested (${missing.length}, previously ${missing[0]?.was}):`);
        for (const c of missing.slice(0, 10)) logger.info(`    ? ${c.id}`);
        if (missing.length > 10) logger.info(`    ... and ${missing.length - 10} more`);
      }
    }
    logger.info('────────────────────────\n');
  }
})().catch(async (e) => {
  logger.error(e.message);
  await die(1);
});

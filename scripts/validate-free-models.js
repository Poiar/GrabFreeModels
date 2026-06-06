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

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');
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

async function saveToDbAndExport() {
  const client = await DB_POOL.connect();
  try {
    await client.query('BEGIN');
    for (const m of json.models) {
      await client.query(
        `UPDATE datapoint_models SET
           status_result = $1, status_tested = $2, status_detail = $3, last_success = $4
         WHERE full_id = $5`,
        [m.status.result, m.status.tested, m.status.detail, m.last_success || null, m.id],
      );
    }
    await client.query(
      `INSERT INTO metadata (key, value) VALUES ('_test_summary', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(json._test_summary)],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
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

function initEndpointStat(ep) {
  if (!endpointStats[ep]) {
    endpointStats[ep] = { tested: 0, passed: 0, failed: 0, timedOut: 0, failures: [] };
  }
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
  const data = await httpsGet(url, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
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

async function testModel(apiModelId, phase, apiKey, apiUrl) {
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
    let result;
    let retries = 0;
    while (retries <= 1) {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ETIMEDOUT')), 30000),
        );
        const res = await Promise.race([httpsPost(apiUrl, body, headers), timeout]);
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
        result = res.status >= 200 && res.status < 300 ? 'OK' : String(res.status);
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
        result = isTimeout ? 'TIMEOUT' : 'ERR';
        break;
      }
    }
    results.push(result);
    if (phase === 'burst') await sleep(300);
    else await sleep(5000);
  }
  return results;
}

// --- Load from DB ---
(async () => {
  try {
  auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  await loadFromDb();
} catch (e) {
  logger.error(`Failed to load from DB: ${e.message}\n${e.stack}`);
  process.exit(1);
}

  if (!json || !Array.isArray(json.models)) {
  logger.error('Failed to load models data');
  process.exit(1);
}
logger.info(`Loaded ${json.models.length} models from PostgreSQL`);

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
    process.exit(0);
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
    process.exit(0);
  }

  // 3. Test confirmed models — endpoints in parallel, sequential within each
  logger.info(`Testing ${confirmed.length} models...\n`);
  const byEp = {};
  for (const m of confirmed) {
    const ep = getEndpoint(m.id);
    (byEp[ep] = byEp[ep] || []).push(m);
  }

  const allResults = [];

  async function testOne(m) {
    const ep = getEndpoint(m.id);
    const cfg = ENDPOINT_CONFIG[ep];
    const vIds = validIds[ep];
    let apiId = resolveApiModelId(m.id, ep, vIds || new Set());
    // If resolveApiModelId returns something not in valid set, it's a fallback — still try it

    logger.info(`[${ep}] ${m.id} → ${apiId}`);
    let burst, delayed;
    try {
      burst = await testModel(apiId, 'burst', cfg.key(), cfg.url);
      delayed = await testModel(apiId, 'delayed', cfg.key(), cfg.url);
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
      };
    }
    logger.info(`  Burst:   ${burst.join(', ')}`);
    logger.info(`  Delayed: ${delayed.join(', ')}`);

    const all = [...burst, ...delayed];
    const ok = all.filter((r) => r === 'OK').length;
    const total = all.length;

    let status, detail;
    if (ok === total) {
      status = 'working';
      detail = `All ${total} requests succeeded.`;
    } else if (ok === 0) {
      const all429 = all.every((r) => r === '429');
      const allTimeout = all.some((r) => r === 'TIMEOUT');
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

    recordModelResult(ep, m.id, status, detail);

    const color = status === 'working' ? '\x1b[32m' : '\x1b[33m';
    logger.info(`  => ${color}${status}\x1b[0m\n`);
    return { id: m.id, status, detail, burst, delayed };
  }

  async function runEndpoint(ep) {
    for (const m of byEp[ep] || []) {
      allResults.push(await testOne(m));
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

  // Provider outage alerts
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

  if (!APPLY) {
    logger.info('\nReport mode. Use --apply to update available-models.json');
    return;
  }

  // --- Apply results ---
  const today = new Date().toISOString().slice(0, 10);

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
  await saveToDbAndExport();
  logger.info('DB updated and JSON exported successfully');

  // --- Auto re-rank if working set changed ---
  const workingChanged = allResults.some(
    (r) => r.status === 'working' || r.status === 'broken' || r.status === 'rate_limited',
  );
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
        id.startsWith('opencode/')
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
})().catch((e) => {
  logger.error(e.message);
  process.exit(1);
});

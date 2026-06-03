#!/usr/bin/env node
/**
 * validate-free-models.js
 * Re-tests free models (rate-limited and untested) via burst + delayed request phases.
 * By default skips models marked as working (7-day cache). Rate-limited models are re-tested
 * unless tested within the last 24 hours. Use --force to re-test all.
 *
 * Usage: node scripts/validate-free-models.js [--models id1,id2] [--apply] [--force] [--coding-only]
 *   --models       : Specific model IDs to test (comma-separated)
 *   --apply        : Write results to available-models.json (default: report only)
 *   --force        : Re-test all models, skipping the 7-day working model cache
 *   --coding-only  : Only test models whose best_for tags match coding/agentic/reasoning patterns
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const DB_POOL = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const CODING_ONLY = args.includes('--coding-only');
let specificModels = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--models' && args[i + 1]) {
    specificModels = args[++i].split(',').map(s => s.trim());
  }
}

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');
const AUTH_FILE = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\pc', '.local', 'share', 'opencode', 'auth.json');
const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

// Load data from PostgreSQL
let json = null;
async function loadFromDb() {
  const { rows: dmRows } = await DB_POOL.query(`
    SELECT dm.*, mm.name AS super_name, mm.slug AS super_slug, mm.author AS super_author,
           dp.name AS provider_name, dp.slug AS provider_slug
    FROM datapoint_models dm
    JOIN super_models mm ON mm.id = dm.super_model_id
    JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
    ORDER BY dm.full_id
  `);
  const dmIds = dmRows.map(r => r.id);
  const [irows, orows, frows, mrows] = (await Promise.all([
    dmIds.length
      ? DB_POOL.query('SELECT datapoint_model_id, input_type FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)', [dmIds])
      : { rows: [] },
    dmIds.length
      ? DB_POOL.query('SELECT datapoint_model_id, output_type FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)', [dmIds])
      : { rows: [] },
    dmIds.length
      ? DB_POOL.query('SELECT datapoint_model_id, feature_type, value FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)', [dmIds])
      : { rows: [] },
    DB_POOL.query('SELECT key, value::text FROM metadata ORDER BY key'),
  ])).map(r => r.rows);

  const imap = new Map(); for (const r of irows) { if (!imap.has(r.datapoint_model_id)) imap.set(r.datapoint_model_id, []); imap.get(r.datapoint_model_id).push(r.input_type); }
  const omap = new Map(); for (const r of orows) { if (!omap.has(r.datapoint_model_id)) omap.set(r.datapoint_model_id, []); omap.get(r.datapoint_model_id).push(r.output_type); }
  const knownFeatures = ['best_for', 'tag', 'supports_reasoning', 'output_limit', 'temperature', 'open_weights', 'family', 'knowledge_cutoff', 'release_date', 'last_updated'];
  const fmap = new Map(); for (const r of frows) { if (!fmap.has(r.datapoint_model_id)) { const o = { tag: [], best_for: [] }; for (const f of knownFeatures) o[f] = []; fmap.set(r.datapoint_model_id, o); } const b = knownFeatures.includes(r.feature_type) ? r.feature_type : 'tag'; fmap.get(r.datapoint_model_id)[b].push(r.value); }
  const meta = {}; for (const r of mrows) { try { meta[r.key] = JSON.parse(r.value); } catch { meta[r.key] = r.value; } }

  const ts = { working: [], rate_limited: [], broken: [], untested: [], not_found: [] };
  const outputModels = dmRows.map(dm => {
    const mid = dm.full_id;
    const r = dm.status_result || 'untested';
    if (ts[r]) ts[r].push(mid); else ts.untested.push(mid);
    const feat = fmap.get(dm.id);
    return {
      id: mid, name: dm.super_name, provider: dm.provider_name, author: dm.super_author || null,
      context_length: dm.context_length || null,
      input_price_per_million: Number(dm.input_price_per_million) || 0,
      output_price_per_million: Number(dm.output_price_per_million) || 0,
      is_free: dm.is_free, supports_tools: dm.supports_tools,
      supports_reasoning: feat?.supports_reasoning?.[0] === undefined ? null : feat.supports_reasoning[0] === 'true',
      output_limit: feat?.output_limit?.[0] ? parseInt(feat.output_limit[0], 10) : null,
      temperature: feat?.temperature?.[0] === undefined ? null : feat.temperature[0] === 'true',
      open_weights: feat?.open_weights?.[0] === undefined ? null : feat.open_weights[0] === 'true',
      family: feat?.family?.[0] || null,
      knowledge_cutoff: feat?.knowledge_cutoff?.[0] || null,
      releaseDate: feat?.release_date?.[0] || null,
      lastUpdated: feat?.last_updated?.[0] || null,
      tags: feat?.tag || [],
      best_for: feat?.best_for || [],
      input_types: imap.get(dm.id) || [],
      output_types: omap.get(dm.id) || [],
      status: { tested: dm.status_tested || null, result: dm.status_result || 'untested', detail: dm.status_detail || null },
      last_success: dm.last_success || null,
      source: dm.provider_slug,
      _removedDate: null,
      notes: null,
    };
  });

  json = {
    models: outputModels,
    _test_summary: { date: new Date().toISOString().slice(0, 10), results: ts },
    _role_rankings: meta._role_rankings || { description: '', model: [], build: [], general: [], small_model: [], explore: [], stable: [] },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
  };
}

async function saveToDbAndExport() {
  for (const m of json.models) {
    await DB_POOL.query(
      `UPDATE datapoint_models SET
         status_result = $1, status_tested = $2, status_detail = $3, last_success = $4
       WHERE full_id = $5`,
      [m.status.result, m.status.tested, m.status.detail, m.last_success || null, m.id]
    );
  }
  await DB_POOL.query(
    `INSERT INTO metadata (key, value) VALUES ('_test_summary', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(json._test_summary)]
  );
  const exporter = require('./export-from-pg');
  await exporter();
  console.log(`Exported to ${MODELS_FILE}`);
}

// --- Helpers ---
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { ...headers } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), ...headers },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Provider configuration ---
function getEndpoint(modelId) {
  if (modelId.startsWith('cerebras/')) return 'cerebras';
  if (modelId.startsWith('nvidia/')) return 'nvidia';
  if (modelId.startsWith('huggingface/')) return 'huggingface';
  if (modelId.startsWith('llmgateway/')) return 'llmgateway';
  if (modelId.startsWith('deepseek/')) return 'deepseek';
  if (modelId.startsWith('opencode/')) return 'opencode';
  if (modelId.startsWith('google/')) return 'google';
  return 'openrouter';
}

const ENDPOINT_CONFIG = {
  openrouter:  { url: 'https://openrouter.ai/api/v1/chat/completions',      key: () => auth.openrouter.key,  modelsUrl: 'https://openrouter.ai/api/v1/models',       fetchIds: async (k) => parseOpenRouterModels(k) },
  cerebras:    { url: 'https://api.cerebras.ai/v1/chat/completions',         key: () => auth.cerebras.key,    modelsUrl: 'https://api.cerebras.ai/v1/models',          fetchIds: async (k) => parseSimpleModels(k, 'https://api.cerebras.ai/v1/models') },
  nvidia:      { url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: () => auth.nvidia.key,      modelsUrl: 'https://integrate.api.nvidia.com/v1/models', fetchIds: async (k) => parseSimpleModels(k, 'https://integrate.api.nvidia.com/v1/models') },
  huggingface: { url: 'https://router.huggingface.co/v1/chat/completions',   key: () => auth.huggingface.key, fetchIds: async () => null },
  llmgateway:  { url: 'https://api.llmgateway.io/v1/chat/completions',       key: () => auth.llmgateway.key,  fetchIds: async () => null },
  deepseek:    { url: 'https://api.deepseek.com/v1/chat/completions',         key: () => auth.deepseek.key,    fetchIds: async () => null },
  opencode:    { url: 'https://opencode.ai/zen/v1/chat/completions',            key: () => auth.opencode.key,   fetchIds: async () => null },
  google:      { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: () => auth.google.key, fetchIds: async () => parseGoogleModels(auth.google.key) },
};

async function parseOpenRouterModels(key) {
  const data = await httpsGet('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
  return new Set(parsed.data.filter(m => {
    if (m.id.endsWith(':free')) return true;
    // Also include zero-priced models (like openrouter/owl-alpha)
    const p = m.pricing || {};
    if (typeof p === 'string') return p === '0';
    return parseFloat(p.prompt ?? p.input) === 0 && parseFloat(p.completion ?? p.output) === 0;
  }).map(m => m.id.replace(/^openrouter\//, ''))); // strip prefix for comparison
}

async function parseSimpleModels(key, url) {
  const data = await httpsGet(url, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
  return new Set(parsed.data.map(m => m.id));
}

async function parseGoogleModels(key) {
  const data = await httpsGet(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const parsed = JSON.parse(data);
  return new Set(parsed.models.filter(m => m.name.startsWith('models/gemini-')).map(m => m.name.replace('models/', '')));
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
  if (endpoint === 'nvidia' && !bare.startsWith('nvidia/') && validIds.has('nvidia/' + bare)) return 'nvidia/' + bare;
  return bare;
}

async function testModel(apiModelId, phase, apiKey, apiUrl) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://opencode.ai', 'X-Title': 'opencode' };
  const body = { model: apiModelId, messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 10 };
  const results = [];
  for (let i = 0; i < 3; i++) {
    try {
      const res = await httpsPost(apiUrl, body, headers);
      results.push(res.status >= 200 && res.status < 300 ? 'OK' : String(res.status));
    } catch { results.push('ERR'); }
    if (phase === 'burst') await sleep(300);
    else await sleep(5000);
  }
  return results;
}

// --- Load from DB ---
(async () => {
  await loadFromDb();
  console.log(`Loaded ${json.models.length} models from PostgreSQL`);

  // --- Determine which models to test ---
  const TEST_AGAIN_AFTER_DAYS = 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TEST_AGAIN_AFTER_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let toTest;
  if (specificModels && specificModels.length > 0) {
    toTest = json.models.filter(m => specificModels.includes(m.id));
  } else {
    toTest = json.models.filter(m => {
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
    toTest = toTest.filter(m => m.best_for && m.best_for.some(f =>
      /\b(cod|programm|agentic|reasoning|tool use|fast coding|fast responses?|lightweight|small tasks|function calling|code generation|code review|refactoring|thinking)\b/i.test(f)
    ));
  }

  if (toTest.length === 0) { console.log('No models to test.'); process.exit(0); }

  // 1. Fetch valid model IDs from each provider
  console.log('Fetching valid model IDs from providers...');
  const validIds = {};
  for (const [name, cfg] of Object.entries(ENDPOINT_CONFIG)) {
    try {
      validIds[name] = await cfg.fetchIds(cfg.key());
      console.log(`  ${name}: ${validIds[name] ? validIds[name].size + ' models' : 'can\'t pre-validate'}`);
    } catch (e) {
      console.log(`  ${name}: fetch failed (${e.message})`);
      validIds[name] = null;
    }
  }
  console.log();

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
    console.log(`Skipping ${notFound.length} models not found in provider API:`);
    for (const nf of notFound) console.log(`  ${nf.model.id} → "${nf.triedId}" on ${nf.endpoint}`);
    console.log();
  }

  if (confirmed.length === 0) {
    console.log('No valid models to test.');
    process.exit(0);
  }

  // 3. Test confirmed models — endpoints in parallel, sequential within each
  console.log(`Testing ${confirmed.length} models...\n`);
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

    console.log(`[${ep}] ${m.id} → ${apiId}`);
    const [burst, delayed] = await Promise.all([
      testModel(apiId, 'burst', cfg.key(), cfg.url),
      testModel(apiId, 'delayed', cfg.key(), cfg.url),
    ]);
    console.log(`  Burst:   ${burst.join(', ')}`);
    console.log(`  Delayed: ${delayed.join(', ')}`);

    const all = [...burst, ...delayed];
    const ok = all.filter(r => r === 'OK').length;
    const total = all.length;

    let status, detail;
    if (ok === total) { status = 'working'; detail = `All ${total} requests succeeded.`; }
    else if (ok === 0) { status = 'rate_limited'; detail = `All ${total} requests failed (non-OK).`; }
    else if (ok >= 4) { status = 'working'; detail = `${ok}/${total} OK. Intermittent failures under load.`; }
    else { status = 'rate_limited'; detail = `${ok}/${total} OK - sporadic, not reliably usable.`; }

    const color = status === 'working' ? '\x1b[32m' : '\x1b[33m';
    console.log(`  => ${color}${status}\x1b[0m\n`);
    return { id: m.id, status, detail, burst, delayed };
  }

  async function runEndpoint(ep) {
    for (const m of (byEp[ep] || [])) {
      allResults.push(await testOne(m));
    }
  }

  await Promise.all(Object.keys(byEp).map(runEndpoint));

  // Add not_found entries
  for (const nf of notFound) {
    allResults.push({ id: nf.model.id, status: 'not_found', detail: `Model "${nf.triedId}" not found in ${nf.endpoint} API.`, burst: [], delayed: [] });
  }

  // --- Summary ---
  console.log('\n=== Results ===');
  for (const r of allResults) console.log(`  ${r.id}: ${r.status} - ${r.detail}`);

  if (!APPLY) {
    console.log('\nReport mode. Use --apply to update available-models.json');
    return;
  }

  // --- Apply results ---
  const today = new Date().toISOString().slice(0, 10);

  // NOTE: opencode/ models are skipped (require Zen SDK). They keep their existing status.
  // NOTE: _role_rankings are NOT updated here — that's rank-models.js's job.
  for (const r of allResults) {
    const model = json.models.find(m => m.id === r.id);
    if (!model) continue;

    model.status.tested = today;
    model.status.result = r.status;
    model.status.detail = r.detail;
    if (r.status === 'working') model.last_success = new Date().toISOString();

    // Update test_summary
    const ts = json._test_summary.results;
    if (!ts.not_found) ts.not_found = [];
    const rm = arr => { const i = arr.indexOf(r.id); if (i !== -1) arr.splice(i, 1); };
    const rmSafe = (arr, id) => { if (arr) { const i = arr.indexOf(id); if (i !== -1) arr.splice(i, 1); } };
    if (r.status === 'working') { rmSafe(ts.rate_limited, r.id); rmSafe(ts.broken, r.id); rmSafe(ts.untested, r.id); rmSafe(ts.not_found, r.id); if (!ts.working.includes(r.id)) ts.working.push(r.id); }
    else if (r.status === 'rate_limited') { rmSafe(ts.working, r.id); rmSafe(ts.broken, r.id); rmSafe(ts.untested, r.id); rmSafe(ts.not_found, r.id); if (!ts.rate_limited.includes(r.id)) ts.rate_limited.push(r.id); }
    else if (r.status === 'broken') { rmSafe(ts.working, r.id); rmSafe(ts.rate_limited, r.id); rmSafe(ts.untested, r.id); rmSafe(ts.not_found, r.id); if (!ts.broken.includes(r.id)) ts.broken.push(r.id); }
    else if (r.status === 'not_found') { rmSafe(ts.working, r.id); rmSafe(ts.rate_limited, r.id); rmSafe(ts.broken, r.id); rmSafe(ts.untested, r.id); if (!ts.not_found.includes(r.id)) ts.not_found.push(r.id); }

  }

  json._test_summary.date = today;
  await saveToDbAndExport();
  console.log('DB updated and JSON exported successfully');

  // --- Auto re-rank if working set changed ---
  const workingChanged = allResults.some(r => r.status === 'working' || r.status === 'broken' || r.status === 'rate_limited');
  if (workingChanged) {
    console.log('\nWorking set changed — auto re-ranking...');
    const { execFileSync } = require('child_process');
    try {
      const output = execFileSync('node', [path.join(__dirname, 'rank-models.js'), '--apply'], { encoding: 'utf8' });
      console.log(output.trim());
    } catch (e) {
      console.error('Auto-rank failed:', e.message);
    }
  }

})().catch(e => { console.error(e.message); process.exit(1); });

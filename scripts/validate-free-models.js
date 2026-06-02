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

const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_POOL = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'gfm',
  password: process.env.PGPASSWORD || 'gfm',
  database: process.env.PGDATABASE || 'grabfreemodels',
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
  const { rows: providers } = await DB_POOL.query('SELECT * FROM providers ORDER BY name');
  const { rows: authors } = await DB_POOL.query('SELECT * FROM authors ORDER BY name');
  const { rows: models } = await DB_POOL.query(`
    SELECT m.*, a.name AS author_name FROM models m LEFT JOIN authors a ON a.id = m.author_id ORDER BY m.name
  `);
  const { rows: providerModels } = await DB_POOL.query(`
    SELECT pm.*, p.name AS provider_name, p.slug AS provider_slug
    FROM provider_models pm JOIN providers p ON p.id = pm.provider_id ORDER BY pm.full_id
  `);
  const { rows: irows } = await DB_POOL.query('SELECT model_id, input_type FROM model_input_types ORDER BY model_id');
  const { rows: orows } = await DB_POOL.query('SELECT model_id, output_type FROM model_output_types ORDER BY model_id');
  const { rows: frows } = await DB_POOL.query('SELECT model_id, feature_type, value FROM model_features ORDER BY model_id');
  const { rows: mrows } = await DB_POOL.query('SELECT key, value::text FROM metadata ORDER BY key');

  const modelMap = new Map(); for (const m of models) modelMap.set(m.id, m);
  const imap = new Map(); for (const r of irows) { if (!imap.has(r.model_id)) imap.set(r.model_id, []); imap.get(r.model_id).push(r.input_type); }
  const omap = new Map(); for (const r of orows) { if (!omap.has(r.model_id)) omap.set(r.model_id, []); omap.get(r.model_id).push(r.output_type); }
  const fmap = new Map(); for (const r of frows) { if (!fmap.has(r.model_id)) fmap.set(r.model_id, { tag: [], best_for: [] }); fmap.get(r.model_id)[r.feature_type].push(r.value); }
  const meta = {}; for (const r of mrows) { try { meta[r.key] = JSON.parse(r.value); } catch { meta[r.key] = r.value; } }

  // Build _test_summary from provider_models statuses
  const ts = { working: [], rate_limited: [], broken: [], untested: [], not_found: [] };
  const outputModels = providerModels.map(pm => {
    const m = modelMap.get(pm.model_id); if (!m) return null;
    const mid = pm.full_id;
    const r = pm.status_result || 'untested';
    if (ts[r]) ts[r].push(mid); else ts.untested.push(mid);
    return {
      id: mid, name: m.name, provider: pm.provider_name, author: m.author_name || null,
      context_length: m.context_length || null,
      input_price_per_million: Number(m.input_price_per_million) || 0,
      output_price_per_million: Number(m.output_price_per_million) || 0,
      is_free: m.is_free, supports_tools: m.supports_tools,
      supports_reasoning: m.supports_reasoning,
      output_limit: m.output_limit || null, temperature: m.temperature,
      open_weights: m.open_weights, family: m.family || null,
      knowledge_cutoff: m.knowledge_cutoff || null,
      releaseDate: m.release_date ? (''+m.release_date).slice(0,10) : null,
      lastUpdated: m.last_updated ? (''+m.last_updated).slice(0,10) : null,
      tags: fmap.get(m.id)?.tag || [],
      best_for: fmap.get(m.id)?.best_for || [],
      input_types: imap.get(m.id) || [],
      output_types: omap.get(m.id) || [],
      status: { tested: pm.status_tested || null, result: pm.status_result || 'untested', detail: pm.status_detail || null },
      last_success: pm.last_success || null,
    };
  }).filter(Boolean);

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
  // Update each model's status in provider_models
  for (const m of json.models) {
    await DB_POOL.query(
      `UPDATE provider_models SET
         status_result = $1, status_tested = $2, status_detail = $3, last_success = $4
       WHERE full_id = $5`,
      [m.status.result, m.status.tested, m.status.detail, m.last_success || null, m.id]
    );
  }
  // Update _test_summary date in metadata
  await DB_POOL.query(
    `INSERT INTO metadata (key, value) VALUES ('_test_summary', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(json._test_summary)]
  );
  // Export to JSON
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
    return parseFloat(p.prompt || p.input) === 0 && parseFloat(p.completion || p.output) === 0;
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

})().catch(e => { console.error(e.message); process.exit(1); });

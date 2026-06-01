#!/usr/bin/env node
/**
 * validate-free-models.js
 * Re-tests free models by first validating model IDs against provider APIs,
 * then running burst + delayed test phases only on confirmed-valid models.
 *
 * Usage: node scripts/validate-free-models.js [--models id1,id2] [--apply] [--force] [--coding-only]
 *   --models       : Specific model IDs to test (comma-separated)
 *   --apply        : Write results to available-models.json (default: report only)
 *   --force        : Re-test all models, skipping the 7-day working model cache
 *   --coding-only  : Only test models with 'cod' or 'programm' in their best_for tags
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

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
const AUTH_FILE = process.env.GFM_AUTH_FILE
  || path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'), 'opencode', 'auth.json');

const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
let json = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));

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
  return 'openrouter';
}

const ENDPOINT_CONFIG = {
  openrouter:  { url: 'https://openrouter.ai/api/v1/chat/completions',      key: () => auth.openrouter.key,  modelsUrl: 'https://openrouter.ai/api/v1/models',       fetchIds: async (k) => parseOpenRouterModels(k) },
  cerebras:    { url: 'https://api.cerebras.ai/v1/chat/completions',         key: () => auth.cerebras.key,    modelsUrl: 'https://api.cerebras.ai/v1/models',          fetchIds: async (k) => parseSimpleModels(k, 'https://api.cerebras.ai/v1/models') },
  nvidia:      { url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: () => auth.nvidia.key,      modelsUrl: 'https://integrate.api.nvidia.com/v1/models', fetchIds: async (k) => parseSimpleModels(k, 'https://integrate.api.nvidia.com/v1/models') },
  huggingface: { url: 'https://router.huggingface.co/v1/chat/completions',   key: () => auth.huggingface.key, fetchIds: async () => null },
  llmgateway:  { url: 'https://api.llmgateway.io/v1/chat/completions',       key: () => auth.llmgateway.key,  fetchIds: async () => null },
  deepseek:    { url: 'https://api.deepseek.com/v1/chat/completions',         key: () => auth.deepseek.key,    fetchIds: async () => null },
};

async function parseOpenRouterModels(key) {
  const data = await httpsGet('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
  return new Set(parsed.data.filter(m => {
    if (m.id.endsWith(':free')) return true;
    // Also include models with zero pricing (like openrouter/owl-alpha)
    const p = m.pricing || {};
    return parseFloat(p.prompt) === 0 && parseFloat(p.completion) === 0;
  }).map(m => m.id));
}

async function parseSimpleModels(key, url) {
  const data = await httpsGet(url, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(data);
  return new Set(parsed.data.map(m => m.id));
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
    if (!m.is_free || m.id.startsWith('opencode/')) return false;
    const result = m.status.result;
    if (result === 'broken' || result === 'untested') return true;
    if (result === 'rate_limited') return true;
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
  // Models useful for sub-agent / coding / agentic roles
  toTest = toTest.filter(m => m.best_for && m.best_for.some(f =>
    /\b(cod|programm|agentic|reasoning|tool use|fast coding|fast responses?|lightweight|small tasks|function calling|code generation|code review|refactoring|thinking)\b/i.test(f)
  ));
}

if (toTest.length === 0) { console.log('No models to test.'); process.exit(0); }

// --- Run ---
(async () => {
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
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usedUpProviders = [];
  if (json._provider_usage) {
    for (const [p, entry] of Object.entries(json._provider_usage)) {
      if (p !== 'description' && entry?.month === currentMonth) usedUpProviders.push(p);
    }
  }

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
    if (r.status === 'working') { rm(ts.rate_limited); rm(ts.broken); rm(ts.untested); rm(ts.not_found); if (!ts.working.includes(r.id)) ts.working.push(r.id); }
    else if (r.status === 'rate_limited') { rm(ts.working); rm(ts.broken); rm(ts.untested); rm(ts.not_found); if (!ts.rate_limited.includes(r.id)) ts.rate_limited.push(r.id); }
    else if (r.status === 'broken') { rm(ts.working); rm(ts.rate_limited); rm(ts.untested); rm(ts.not_found); if (!ts.broken.includes(r.id)) ts.broken.push(r.id); }
    else if (r.status === 'not_found') { rm(ts.working); rm(ts.rate_limited); rm(ts.broken); rm(ts.untested); if (!ts.not_found.includes(r.id)) ts.not_found.push(r.id); }

    // Update _role_rankings — remove non-working, rate_limited, broken, not_found
    const roles = ['model', 'build', 'general', 'small_model', 'explore'];
    for (const role of roles) {
      const list = json._role_rankings[role] || [];
      const idx = list.indexOf(r.id);
      if (r.status === 'working' && idx === -1) list.push(r.id);
      else if (r.status !== 'working' && idx !== -1) list.splice(idx, 1);
    }
  }

  json._test_summary.date = today;
  fs.writeFileSync(MODELS_FILE, JSON.stringify(json, null, 2), 'utf8');
  console.log(`Updated ${MODELS_FILE}`);
  try { JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')); console.log('JSON validation: OK'); }
  catch (e) { console.log(`JSON validation: FAILED - ${e.message}`); }

})().catch(e => { console.error(e.message); process.exit(1); });

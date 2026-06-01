#!/usr/bin/env node
/**
 * validate-free-models.js
 * Re-tests rate-limited and untested free models to check if their status has changed.
 * Runs both burst (rapid) and delayed test phases for each model.
 *
 * Usage: node scripts/validate-free-models.js [--models id1,id2] [--apply] [--force] [--coding-only]
 *   --models     : Specific model IDs to test (comma-separated; default: all rate-limited and untested)
 *   --apply      : Write results to available-models.json (default: report only)
 *   --force      : Re-test all models, skipping the 7-day working model cache
 *   --coding-only: Only test models tagged with coding/programming/reasoning/agent keywords
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

// --- Provider endpoint configuration ---
// Each endpoint has: url, apiKey getter, and a function to fetch valid model IDs
const ENDPOINTS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: () => auth.openrouter.key,
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    // OpenRouter free models have :free suffix
    fetchIds: async (key) => {
      const data = await httpsGet('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${key}` });
      const parsed = JSON.parse(data);
      return new Set(parsed.data.filter(m => m.id.endsWith(':free')).map(m => m.id));
    },
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    key: () => auth.cerebras.key,
    modelsUrl: 'https://api.cerebras.ai/v1/models',
    fetchIds: async (key) => {
      const data = await httpsGet('https://api.cerebras.ai/v1/models', { Authorization: `Bearer ${key}` });
      const parsed = JSON.parse(data);
      return new Set(parsed.data.map(m => m.id));
    },
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: () => auth.nvidia.key,
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    fetchIds: async (key) => {
      const data = await httpsGet('https://integrate.api.nvidia.com/v1/models', { Authorization: `Bearer ${key}` });
      const parsed = JSON.parse(data);
      return new Set(parsed.data.map(m => m.id));
    },
  },
  huggingface: {
    url: 'https://router.huggingface.co/v1/chat/completions',
    key: () => auth.huggingface.key,
    // HuggingFace doesn't have a simple models list API we can use for validation
    // Skip model ID pre-validation for this endpoint
    fetchIds: async () => null, // null = can't validate IDs upfront
  },
  llmgateway: {
    url: 'https://api.llmgateway.io/v1/chat/completions',
    key: () => auth.llmgateway.key,
    fetchIds: async () => null, // unknown API
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: () => auth.deepseek.key,
    fetchIds: async () => null, // unknown API
  },
};

function getEndpoint(modelId) {
  if (modelId.startsWith('cerebras/')) return 'cerebras';
  if (modelId.startsWith('nvidia/')) return 'nvidia';
  if (modelId.startsWith('huggingface/')) return 'huggingface';
  if (modelId.startsWith('llmgateway/')) return 'llmgateway';
  if (modelId.startsWith('deepseek/')) return 'deepseek';
  return 'openrouter';
}

// Convert stored model ID to the API-expected format
function toApiModelId(modelId, endpoint) {
  const ep = ENDPOINTS[endpoint];
  // Strip provider prefix for non-OpenRouter endpoints
  if (endpoint !== 'openrouter') {
    const slash = modelId.indexOf('/');
    return slash !== -1 ? modelId.slice(slash + 1) : modelId;
  }
  // OpenRouter: strip openrouter/ prefix if present
  if (modelId.startsWith('openrouter/')) return modelId.replace(/^openrouter\//, '');
  // Bare names without / are OpenRouter models
  if (!modelId.includes('/')) return modelId;
  return modelId;
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
    if (!m.is_free) return false;
    if (m.id.startsWith('opencode/')) return false; // can't test via HTTPS
    const result = m.status.result;
    if (result === 'broken' || result === 'untested') return true;
    if (result === 'rate_limited') return true;
    if (result === 'working') {
      if (!FORCE) {
        const tested = m.status.tested || '';
        const lastSuccess = m.last_success || '';
        if (tested >= cutoffStr && lastSuccess >= cutoffStr) return false;
      }
      return true;
    }
    return false;
  });
}

if (CODING_ONLY) {
  toTest = toTest.filter(m => m.best_for && m.best_for.some(f => /cod|programm|reason|agent|thinking/i.test(f)));
}

if (toTest.length === 0) {
  console.log('No models to test.');
  process.exit(0);
}

const skipped = json.models.filter(m => m.is_free && !toTest.includes(m) && !m.id.startsWith('opencode/'));
if (skipped.length > 0) {
  console.log(`Skipping ${skipped.length} recently-tested working models (tested within ${TEST_AGAIN_AFTER_DAYS} days)`);
}

console.log(`=== Validate Free Models ===`);
console.log(`Testing ${toTest.length} models\n`);

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ...headers },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testModel(apiModelId, phase, apiKey, apiUrl) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://opencode.ai',
    'X-Title': 'opencode',
  };
  const body = { model: apiModelId, messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 10 };
  const results = [];
  for (let i = 0; i < 3; i++) {
    try {
      const res = await httpsPost(apiUrl, body, headers);
      if (res.status >= 200 && res.status < 300) {
        results.push('OK');
      } else {
        results.push(String(res.status));
      }
    } catch {
      results.push('ERR');
    }
    if (phase === 'burst') await sleep(300);
    else await sleep(5000);
  }
  return results;
}

function getApiUrl(modelId) {
  if (modelId.startsWith('cerebras/')) return 'https://api.cerebras.ai/v1/chat/completions';
  if (modelId.startsWith('nvidia/')) return 'https://integrate.api.nvidia.com/v1/chat/completions';
  if (modelId.startsWith('huggingface/')) return 'https://router.huggingface.co/v1/chat/completions';
  if (modelId.startsWith('llmgateway/')) return 'https://api.llmgateway.io/v1/chat/completions';
  if (modelId.startsWith('deepseek/')) return 'https://api.deepseek.com/v1/chat/completions';
  return 'https://openrouter.ai/api/v1/chat/completions';
}

function getApiKey(modelId) {
  if (modelId.startsWith('cerebras/')) return auth.cerebras.key;
  if (modelId.startsWith('nvidia/')) return auth.nvidia.key;
  if (modelId.startsWith('huggingface/')) return auth.huggingface.key;
  if (modelId.startsWith('llmgateway/')) return auth.llmgateway.key;
  if (modelId.startsWith('deepseek/')) return auth.deepseek.key;
  return auth.openrouter.key;
}

function getEndpointKey(modelId) {
  if (modelId.startsWith('cerebras/')) return 'cerebras';
  if (modelId.startsWith('nvidia/')) return 'nvidia';
  if (modelId.startsWith('huggingface/')) return 'huggingface';
  if (modelId.startsWith('llmgateway/')) return 'llmgateway';
  if (modelId.startsWith('deepseek/')) return 'deepseek';
  return 'openrouter';
}

// --- Run tests ---
(async () => {

  async function testOne(m) {
    const id = m.id;
    const url = getApiUrl(id);
    const key = getApiKey(id);
    const endpoint = getEndpointKey(id);

    console.log(`[${endpoint}] ${id}`);

    const [burstResults, delayedResults] = await Promise.all([
      testModel(id, 'burst', key, url),
      testModel(id, 'delayed', key, url),
    ]);

    console.log(`  Burst:   ${burstResults.join(', ')}`);
    console.log(`  Delayed: ${delayedResults.join(', ')}`);

    const allResults = [...burstResults, ...delayedResults];
    const okCount = allResults.filter(r => r === 'OK').length;
    const totalCount = allResults.length;
    const allFailed = allResults.filter(r => r !== 'OK').length === totalCount;
    const anyOk = okCount > 0;

    let status, detail;
    if (okCount === totalCount) {
      status = 'working';
      detail = `All ${totalCount} requests succeeded.`;
    } else if (allFailed) {
      status = 'rate_limited';
      detail = `429 on all ${totalCount} requests - persistently rate limited.`;
    } else if (okCount >= 4) {
      status = 'working';
      detail = `${okCount}/${totalCount} OK. Intermittent 429s under load, reliable sequentially.`;
    } else if (anyOk) {
      status = 'rate_limited';
      detail = `${okCount}/${totalCount} OK - sporadic success, not reliably usable.`;
    } else {
      status = 'broken';
      detail = `0/${totalCount} OK - all requests failed.`;
    }

    const color = status === 'working' ? '\x1b[32m' : status === 'rate_limited' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  => ${color}${status}\x1b[0m`);

    return { id, status, detail, burst: burstResults, delayed: delayedResults };
  }

  // Group models by API endpoint; test one model per endpoint at a time
  const byEndpoint = {};
  for (const m of toTest) {
    const ep = getEndpointKey(m.id);
    (byEndpoint[ep] = byEndpoint[ep] || []).push(m);
  }
  const endpoints = Object.keys(byEndpoint);
  const iterators = endpoints.map(ep => byEndpoint[ep][Symbol.iterator]());
  const results = [];
  let remaining = toTest.length;

  while (remaining > 0) {
    const batch = [];
    for (let i = 0; i < endpoints.length; i++) {
      const next = iterators[i].next();
      if (!next.done) batch.push(next.value);
    }
    if (batch.length === 0) break;
    const batchResults = await Promise.all(batch.map(m => testOne(m)));
    results.push(...batchResults);
    remaining -= batch.length;
  }

  // --- Summary ---
  console.log('\n=== Results ===');
  for (const r of allResults) {
    console.log(`  ${r.id}: ${r.status} - ${r.detail}`);
  }

  if (!APPLY) {
    console.log('\nReport mode. Use --apply to update available-models.json');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const usedUpProviders = [];
    if (json._provider_usage) {
      for (const [p, entry] of Object.entries(json._provider_usage)) {
        if (p === 'description') continue;
        if (entry && entry.month === currentMonth) usedUpProviders.push(p);
      }
    }

    for (const r of allResults) {
      const model = json.models.find(m => m.id === r.id);
      if (!model) continue;

      const providerPrefix = r.id.split('/')[0];
      if ((r.status === 'broken' || r.status === 'not_found') && !usedUpProviders.includes(providerPrefix)) {
        const providerModels = json.models.filter(m => m.id.startsWith(`${providerPrefix}/`) && m.is_free);
        const allBroken = providerModels.filter(m => m.status.result === 'broken' || m.status.result === 'not_found').length === providerModels.length;
        if (allBroken && providerModels.length > 0) {
          if (!json._provider_usage) json._provider_usage = {};
          json._provider_usage[providerPrefix] = {
            month: currentMonth,
            reason: `All ${providerPrefix} models are broken as of ${today}`,
          };
          usedUpProviders.push(providerPrefix);
          console.log(`  ⚠ Auto-flagged provider '${providerPrefix}' as used-up for ${currentMonth}`);
        }
      }

      model.status.tested = today;
      model.status.result = r.status;
      model.status.detail = r.detail;
      if (r.status === 'working') model.last_success = new Date().toISOString();

      // Update test_summary
      const ts = json._test_summary.results;
      const removeFrom = arr => { const idx = arr.indexOf(r.id); if (idx !== -1) arr.splice(idx, 1); };

      if (r.status === 'working') {
        removeFrom(ts.rate_limited);
        removeFrom(ts.broken);
        removeFrom(ts.untested);
        removeFrom(ts.not_found);
        if (!ts.working.includes(r.id)) ts.working.push(r.id);
      } else if (r.status === 'rate_limited') {
        removeFrom(ts.working);
        removeFrom(ts.broken);
        removeFrom(ts.untested);
        removeFrom(ts.not_found);
        if (!ts.rate_limited.includes(r.id)) ts.rate_limited.push(r.id);
      } else if (r.status === 'broken') {
        removeFrom(ts.working);
        removeFrom(ts.rate_limited);
        removeFrom(ts.untested);
        removeFrom(ts.not_found);
        if (!ts.broken.includes(r.id)) ts.broken.push(r.id);
      } else if (r.status === 'not_found') {
        if (!ts.not_found) ts.not_found = [];
        removeFrom(ts.working);
        removeFrom(ts.rate_limited);
        removeFrom(ts.broken);
        removeFrom(ts.untested);
        if (!ts.not_found.includes(r.id)) ts.not_found.push(r.id);
      }

      // Update _role_rankings
      const modelProvider = r.id.split('/')[0];
      const isProviderUsedUp = usedUpProviders.includes(modelProvider);
      const roles = ['model', 'build', 'general', 'small_model', 'explore'];

      for (const role of roles) {
        const list = json._role_rankings[role] || [];
        const idx = list.indexOf(r.id);
        if (r.status === 'working' && !isProviderUsedUp && idx === -1) {
          list.push(r.id);
        } else if ((r.status !== 'working' || isProviderUsedUp) && idx !== -1) {
          list.splice(idx, 1);
        }
      }
    }

    json._test_summary.date = today;

    fs.writeFileSync(MODELS_FILE, JSON.stringify(json, null, 2), 'utf8');
    console.log(`Updated ${MODELS_FILE}`);

    try {
      JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
      console.log('JSON validation: OK');
    } catch (e) {
      console.log(`JSON validation: FAILED - ${e.message}`);
    }
  }
})().catch(e => { console.error(e.message); process.exit(1); });

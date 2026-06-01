#!/usr/bin/env node
/**
 * validate-free-models.js
 * Re-tests rate-limited and untested free models to check if their status has changed.
 * Runs both burst (rapid) and delayed test phases for each model.
 *
 * Usage: node scripts/validate-free-models.js [--models id1,id2] [--apply] [--force]
 *   --models : Specific model IDs to test (comma-separated; default: all rate-limited and untested)
 *   --apply  : Write results to available-models.json (default: report only)
 *   --force  : Re-test all models, skipping the 7-day working model cache
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
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
    // Always re-test broken and untested
    if (result === 'broken' || result === 'untested') return true;
    // Re-test rate-limited (they might recover)
    if (result === 'rate_limited') return true;
    // Re-test working only if not tested recently
    if (result === 'working') {
      if (!FORCE) {
        const tested = m.status.tested || '';
        const lastSuccess = m.last_success || '';
        // Skip if tested within the last N days AND had a recent success
        if (tested >= cutoffStr && lastSuccess >= cutoffStr) return false;
      }
      return true;
    }
    return false;
  });
}

if (toTest.length === 0) {
  console.log('No models to test.');
  process.exit(0);
}

const skipped = json.models.filter(m => m.is_free && !toTest.includes(m));
if (skipped.length > 0) {
  console.log(`Skipping ${skipped.length} recently-tested working models (tested within ${TEST_AGAIN_AFTER_DAYS} days)`);
}

if (toTest.length === 0) {
  console.log('No models to test.');
  process.exit(0);
}

console.log(`=== Validate Free Models ===`);
console.log(`Testing ${toTest.length} models\n`);

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

async function testModel(modelId, phase, apiKey, apiUrl) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://opencode.ai',
    'X-Title': 'opencode',
  };

  const cleanId = modelId.replace(/^openrouter\//, '');
  const body = { model: cleanId, messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 10 };
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
  for (const r of results) {
    console.log(`  ${r.id}: ${r.status} - ${r.detail}`);
  }

  if (!APPLY) {
    console.log('\nReport mode. Use --apply to update available-models.json');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Check if a model's provider is marked as used-up for the current month
    const usedUpProviders = [];
    if (json._provider_usage) {
      for (const [p, entry] of Object.entries(json._provider_usage)) {
        if (p === 'description') continue;
        if (entry && entry.month === currentMonth) usedUpProviders.push(p);
      }
    }

    for (const r of results) {
      const model = json.models.find(m => m.id === r.id);
      if (!model) continue;

      // Auto-flag provider as used-up if all its free models are broken
      const providerPrefix = r.id.split('/')[0];
      if (r.status === 'broken' && !usedUpProviders.includes(providerPrefix)) {
        const providerModels = json.models.filter(m => m.id.startsWith(`${providerPrefix}/`) && m.is_free);
        const allBroken = providerModels.filter(m => m.status.result === 'broken').length === providerModels.length;
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
        if (!ts.working.includes(r.id)) ts.working.push(r.id);
      } else if (r.status === 'rate_limited') {
        removeFrom(ts.working);
        removeFrom(ts.broken);
        removeFrom(ts.untested);
        if (!ts.rate_limited.includes(r.id)) ts.rate_limited.push(r.id);
      } else if (r.status === 'broken') {
        removeFrom(ts.working);
        removeFrom(ts.rate_limited);
        removeFrom(ts.untested);
        if (!ts.broken.includes(r.id)) ts.broken.push(r.id);
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

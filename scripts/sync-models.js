#!/usr/bin/env node
/**
 * sync-models.js
 * Fetches latest free model lists from all providers and diffs against available-models.json.
 *
 * Usage: node scripts/sync-models.js [--apply]
 *   --apply  : Write changes to available-models.json (default: dry-run / report only)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const REPO_ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(REPO_ROOT, 'available-models.json');

// Auth file: check env var first, then platform default locations
const AUTH_FILE = process.env.GFM_AUTH_FILE
  || path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'), 'opencode', 'auth.json');

const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
const json = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
const models = json.models;
const existingIds = new Set(models.map(m => m.id));

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    https.get(options, res => {
let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function getOpenRouterFreeModels() {
  const data = await httpsGet('https://openrouter.ai/api/v1/models');
  return data.data.filter(m => m.pricing === '0' || m.id.endsWith(':free'));
}

async function getCerebrasModels() {
  const headers = { Authorization: `Bearer ${auth.cerebras.key}` };
  const data = await httpsGet('https://api.cerebras.ai/v1/models', headers);
  return data.data.map(m => ({
    id: m.id,
    name: m.id,
    context_length: 131072,
  }));
}

async function getNvidiaFreeModels() {
  const headers = { Authorization: `Bearer ${auth.nvidia.key}` };
  const data = await httpsGet('https://integrate.api.nvidia.com/v1/models', headers);
  const excludePattern = /embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse/i;
  return data.data.filter(m => {
    if (m.object !== 'model') return false;
    if (m.task && m.task !== 'chat' && m.task !== 'text-generation' && m.type !== 'chat') return false;
    const isFree = !m.pricing || m.pricing === '0' || (m.pricing.input === '0' && m.pricing.output === '0');
    if (!isFree) return false;
    if (excludePattern.test(m.id)) return false;
    return true;
  });
}

(async () => {
console.log('=== Syncing free models ===\n');

// --- OpenRouter ---
console.log('[OpenRouter] Fetching...');
const orModels = await getOpenRouterFreeModels();
console.log(`  Found ${orModels.length} free models`);

const newOr = [];
for (const m of orModels) {
  const id = `openrouter/${m.id}`;
  if (!existingIds.has(id)) {
    newOr.push({ id, name: m.id, provider: 'OpenRouter', context_length: m.context_length, pricing: m.pricing });
  }
}
console.log(`  New: ${newOr.length}`);
for (const n of newOr) console.log(`    + ${n.id}`);

// --- Cerebras ---
console.log('\n[Cerebras] Fetching...');
let newCb = [];
let cbModels = [];
try {
  cbModels = await getCerebrasModels();
  console.log(`  Found ${cbModels.length} models`);
  for (const m of cbModels) {
    if (!existingIds.has(m.id)) newCb.push(m);
  }
  console.log(`  New: ${newCb.length}`);
  for (const n of newCb) console.log(`    + ${n.id}`);
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
}

// --- NVIDIA ---
console.log('\n[NVIDIA] Fetching...');
let newNv = [];
try {
  const nvModels = await getNvidiaFreeModels();
  console.log(`  Found ${nvModels.length} free models`);
  for (const m of nvModels) {
    if (!existingIds.has(m.id) && !existingIds.has(`nvidia/${m.id}`)) {
      newNv.push({ id: m.id, name: m.id, provider: 'NVIDIA', context_length: m.context_length });
    }
  }
  console.log(`  New: ${newNv.length}`);
  for (const n of newNv) console.log(`    + ${n.id}`);
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
}

// --- HuggingFace Router & LLM Gateway ---
// These providers have no public free-model listing API.
// HuggingFace: free models must be tested manually.
// LLM Gateway: models must be added manually.
// See docs/provider-details.md for details.

// --- Detect removed models ---
console.log('\n[Status Check] Models in JSON but no longer in OpenRouter/Cerebras...');
const allCurrentFreeIds = new Set([
  ...orModels.map(m => `openrouter/${m.id}`),
  ...(cbModels || []).map(m => m.id),
]);

const orCbProviders = ['OpenRouter', 'Cerebras'];
const potentiallyRemoved = [];
for (const m of models) {
  if (!m.is_free) continue;
  if (m.provider === 'OpenCode Zen') continue;
  // Skip special auto-routing models that don't appear in standard listings
  // but are verified to still be operational (e.g. owl-alpha, openrouter/free)
  const SKIP_REMOVAL_CHECK = new Set([
    'openrouter/owl-alpha',
    'openrouter/openrouter/free',
  ]);
  if (SKIP_REMOVAL_CHECK.has(m.id)) continue;
  if (orCbProviders.includes(m.provider) && !allCurrentFreeIds.has(m.id)) {
    potentiallyRemoved.push(m.id);
  }
}
console.log(`  Potentially removed: ${potentiallyRemoved.length}`);
for (const r of potentiallyRemoved) console.log(`    ? ${r}`);

// --- Summary ---
const totalNew = newOr.length + newCb.length + newNv.length;
console.log('\n=== Summary ===');
console.log(`  New models found:    ${totalNew}`);
console.log(`  Potentially removed: ${potentiallyRemoved.length}`);

if (!APPLY) {
  console.log('\nDry-run mode. Use --apply to update available-models.json');
} else {
  console.log('\nApplying changes...');

  function makeEntry(m, provider, contextLength) {
    return {
      id: m.id,
      name: m.name,
      provider,
      context_length: contextLength || null,
      input_price_per_million: 0,
      output_price_per_million: 0,
      is_free: true,
      best_for: ['General tasks'],
      notes: 'Auto-discovered by sync script',
      status: { tested: null, result: 'untested', detail: 'Not yet tested' },
    };
  }

  for (const m of newOr) json.models.push(makeEntry(m, 'OpenRouter', m.context_length));
  for (const m of newCb) json.models.push(makeEntry(m, 'Cerebras', m.context_length));
  for (const m of newNv) json.models.push(makeEntry(m, 'NVIDIA', m.context_length));

  // Flag potentially removed models
  for (const m of json.models) {
    if (potentiallyRemoved.includes(m.id) && m.is_free) {
      m._removed = true;
      m._removedDate = new Date().toISOString().slice(0, 10);
      m.status.result = 'untested';
      m.status.detail = `Provider no longer lists this model as free (detected ${m._removedDate})`;
    }
  }

  // Move removed models to end of array after 30 days
  const REMOVE_ARCHIVE_DAYS = 30;
  const archiveCutoff = new Date();
  archiveCutoff.setDate(archiveCutoff.getDate() - REMOVE_ARCHIVE_DAYS);
  const archiveCutoffStr = archiveCutoff.toISOString().slice(0, 10);
  const toArchive = json.models.filter(m => m._removed && m._removedDate <= archiveCutoffStr && m.is_free);
  if (toArchive.length > 0) {
    for (const m of toArchive) {
      m.is_free = false;
      m.status.detail = `Archived: provider stopped offering free tier on ${m._removedDate}`;
    }
    console.log(`  Archived ${toArchive.length} models (removed >${REMOVE_ARCHIVE_DAYS} days ago)`);
  }

  fs.writeFileSync(MODELS_FILE, JSON.stringify(json, null, 2), 'utf8');
  console.log(`  Updated ${MODELS_FILE}`);

  // Validate
  try {
    JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
    console.log('  JSON validation: OK');
  } catch (e) {
    console.log(`  JSON validation: FAILED - ${e.message}`);
    }
}
})().catch(e => { console.error(e.message); process.exit(1); });

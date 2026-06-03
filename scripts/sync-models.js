#!/usr/bin/env node
/**
 * sync-models.js
 * Fetches latest free model lists from all providers and syncs against Neon PostgreSQL (v2 schema).
 *
 * Usage: node scripts/sync-models.js [--apply]
 *   --apply  : Write changes to PostgreSQL (default: dry-run / report only)
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
  connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const AUTH_FILE = process.env.GFM_AUTH_FILE
  || path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'), 'opencode', 'auth.json');

const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    mod.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function getOpenRouterFreeModels() {
  const { data } = await httpGet('https://openrouter.ai/api/v1/models');
  return (data.data || []).filter(m => {
    if (m.id.endsWith(':free')) return true;
    const p = m.pricing || {};
    if (typeof p === 'string') return p === '0';
    return parseFloat(p.prompt || p.input) === 0 && parseFloat(p.completion || p.output) === 0;
  });
}

async function getCerebrasModels() {
  const { data } = await httpGet('https://api.cerebras.ai/v1/models', { Authorization: `Bearer ${auth.cerebras.key}` });
  return (data.data || []).map(m => ({
    id: `cerebras/${m.id}`,
    name: m.id,
    context_length: 131072,
  }));
}

async function getNvidiaFreeModels() {
  const { data } = await httpGet('https://integrate.api.nvidia.com/v1/models', { Authorization: `Bearer ${auth.nvidia.key}` });
  const excludePattern = /embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse/i;
  return (data.data || []).filter(m => {
    if (m.object !== 'model') return false;
    if (m.task && m.task !== 'chat' && m.task !== 'text-generation' && m.type !== 'chat') return false;
    const isFree = !m.pricing || m.pricing === '0' || (m.pricing.input === '0' && m.pricing.output === '0');
    if (!isFree) return false;
    if (excludePattern.test(m.id)) return false;
    return true;
  }).map(m => ({ id: m.id, name: m.id, context_length: m.context_length ?? null }));
}

async function getSkipRemovalCheck(client) {
  const { rows } = await client.query("SELECT value FROM metadata WHERE key = '_skip_removal_check'");
  if (rows.length > 0) {
    try {
      const value = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      return new Set(Array.isArray(value) ? value : [value]);
    } catch {
      return new Set(['openrouter/owl-alpha', 'openrouter/openrouter/free']);
    }
  }
  return new Set(['openrouter/owl-alpha', 'openrouter/openrouter/free']);
}

function normalizeModelSlug(name) {
  let slug = name.toLowerCase()
    .replace(/\(free\)/g, '')
    .replace(/\(free tier\)/g, '')
    .replace(/^coding-/, '')
    .replace(/^xiaomi-/, '')
    .replace(/-free$/, '')
    .replace(/-free-/, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
  return slug;
}

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== Syncing free models ===\n');

    // Get existing free model IDs from datapoint_models
    const { rows: existingRows } = await client.query(`
      SELECT dm.full_id FROM datapoint_models dm WHERE dm.is_free = true ORDER BY dm.full_id
    `);
    const existingIds = new Set(existingRows.map(r => r.full_id));

    // --- OpenRouter ---
    console.log('[OpenRouter] Fetching...');
    const orModels = await getOpenRouterFreeModels();
    console.log(`  Found ${orModels.length} free models`);

    const newOr = [];
    for (const m of orModels) {
      const id = `openrouter/${m.id}`;
      if (!existingIds.has(id)) {
        newOr.push({ id, name: m.id, provider: 'openrouter', context_length: m.context_length, pricing: m.pricing });
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
        const storedId = `nvidia/${m.id}`;
        if (!existingIds.has(storedId) && !existingIds.has(m.id)) {
          newNv.push({ id: storedId, name: m.id, provider: 'nvidia', context_length: m.context_length });
        }
      }
      console.log(`  New: ${newNv.length}`);
      for (const n of newNv) console.log(`    + ${n.id}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }

    // --- HuggingFace ---
    console.log('\n[HuggingFace] Fetching...');
    let newHf = [];
    let hfFree = [];
    try {
      const hfData = await httpGet('https://huggingface.co/api/inference-providers', { Authorization: `Bearer ${auth.huggingface.key}` });
      const hfModelsData = await httpGet(
        'https://huggingface.co/api/models?inference_provider=huggingface&tags=text-generation&limit=200',
        { Authorization: `Bearer ${auth.huggingface.key}` }
      );
      const hfModelList = Array.isArray(hfModelsData.data) ? hfModelsData.data :
        (hfModelsData.data?.models || hfModelsData.data?.data || []);
      for (const m of hfModelList) {
        const id = m.id || m.modelId;
        if (!id) continue;
        const isInferenceFree = m.inference === 'free' || m.inference === 'feather';
        const isFreeByConfig = m.tags && m.tags.includes('free');
        if (isInferenceFree || isFreeByConfig) {
          hfFree.push({ id: `huggingface/${id}`, name: id, context_length: m.generation_parameters?.max_new_tokens || null });
        }
      }
      console.log(`  Found ${hfFree.length} free models`);
      for (const m of hfFree) {
        if (!existingIds.has(m.id)) newHf.push(m);
      }
      console.log(`  New: ${newHf.length}`);
      for (const n of newHf) console.log(`    + ${n.id}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }

    // --- Detect removed models ---
    console.log('\n[Status Check] Models in DB but no longer in provider listings...');
    const allCurrentFreeIds = new Set([
      ...orModels.map(m => `openrouter/${m.id}`),
      ...(cbModels || []).map(m => m.id),
      ...hfFree.map(m => m.id),
    ]);

    const skipRemovalCheck = await getSkipRemovalCheck(client);
    const potentiallyRemoved = [];

    const { rows: dbModels } = await client.query(`
      SELECT dm.full_id, dp.name AS provider_name
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true AND dm.is_removed = false
    `);

    for (const m of dbModels) {
      if (!allCurrentFreeIds.has(m.full_id) && !skipRemovalCheck.has(m.full_id)) {
        potentiallyRemoved.push(m);
      }
    }
    console.log(`  Potentially removed: ${potentiallyRemoved.length}`);
    for (const r of potentiallyRemoved) console.log(`    ? ${r.full_id}`);

    // --- Summary ---
    const totalNew = newOr.length + newCb.length + newNv.length + newHf.length;
    console.log('\n=== Summary ===');
    console.log(`  New models found:    ${totalNew}`);
    console.log(`  Potentially removed: ${potentiallyRemoved.length}`);

    if (!APPLY) {
      console.log('\nDry-run mode. Use --apply to update PostgreSQL');
    } else {
      console.log('\nApplying changes...');
      await client.query('BEGIN');

      try {
        // Ensure datapoint_providers exist
        const providerSlugs = ['openrouter', 'cerebras', 'nvidia', 'huggingface'];
        for (const slug of providerSlugs) {
          await client.query(
            `INSERT INTO datapoint_providers (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
            [slug, slug.charAt(0).toUpperCase() + slug.slice(1)]
          );
        }

        // Get provider ID map
        const { rows: providerRows } = await client.query('SELECT id, slug FROM datapoint_providers');
        const providerMap = new Map(providerRows.map(r => [r.slug, r.id]));

        const allNew = [...newOr, ...newCb, ...newNv, ...newHf];

        for (const m of allNew) {
          const providerSlug = m.id.split('/')[0];
          const providerId = providerMap.get(providerSlug);
          if (!providerId) { console.log(`  SKIP ${m.id}: unknown provider "${providerSlug}"`); continue; }

          const remoteId = m.id.includes('/') ? m.id.slice(m.id.indexOf('/') + 1) : m.id;
          const superSlug = normalizeModelSlug(m.name);

          // Upsert super model
          const { rows: mmRows } = await client.query(
            `INSERT INTO super_models (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [m.name, superSlug]
          );
          const superId = mmRows[0].id;

          // Upsert datapoint model
          await client.query(
            `INSERT INTO datapoint_models (super_model_id, datapoint_provider_id, remote_id, full_id, context_length, is_free, status_result, status_detail)
             VALUES ($1, $2, $3, $4, $5, true, 'untested', 'Auto-discovered by sync script')
             ON CONFLICT (datapoint_provider_id, remote_id) DO UPDATE SET
               context_length = EXCLUDED.context_length,
               is_removed = false,
               updated_at = now()`,
            [superId, providerId, remoteId, m.id, m.context_length]
          );
        }

        // Mark potentially removed models
        for (const m of potentiallyRemoved) {
          await client.query(
            `UPDATE datapoint_models
             SET is_removed = true, status_result = 'untested', status_detail = $1, status_tested = NULL, updated_at = now()
             WHERE full_id = $2`,
            [`Provider no longer lists this model as free (detected ${new Date().toISOString().slice(0, 10)})`, m.full_id]
          );
        }

        await client.query('COMMIT');
        console.log('  Changes committed to PostgreSQL');

        // Export to JSON
        const { spawn } = require('child_process');
        const exportScript = path.join(__dirname, 'export-from-pg.js');
        const exportProcess = spawn('node', [exportScript]);
        exportProcess.stdout.on('data', d => console.log(d.toString().trim()));
        exportProcess.stderr.on('data', d => console.error(d.toString().trim()));
        exportProcess.on('close', code => console.log(code === 0 ? '  JSON export completed' : `  JSON export failed with code ${code}`));

      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error applying changes:', err.message);
        process.exitCode = 1;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

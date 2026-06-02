#!/usr/bin/env node
/**
 * sync-models.js
 * Fetches latest free model lists from all providers and syncs against PostgreSQL.
 *
 * Usage: node scripts/sync-models.js [--apply]
 *   --apply  : Write changes to PostgreSQL (default: dry-run / report only)
 */

const https = require('https');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'gfm',
  password: process.env.PGPASSWORD || 'gfm',
  database: process.env.PGDATABASE || 'grabfreemodels',
});

// Auth file: check env var first, then platform default locations
const fs = require('fs');
const path = require('path');
const AUTH_FILE = process.env.GFM_AUTH_FILE
  || path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'), 'opencode', 'auth.json');

const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));

// Add removed column to provider_models if not exists
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE provider_models 
      ADD COLUMN IF NOT EXISTS removed BOOLEAN DEFAULT false
    `);
    console.log('Schema check: ensured "removed" column exists');
  } finally {
    client.release();
  }
}

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
  return data.data.filter(m => {
    if (m.id.endsWith(':free')) return true;
    const p = m.pricing || {};
    if (typeof p === 'string') return p === '0';
    return parseFloat(p.prompt || p.input) === 0 && parseFloat(p.completion || p.output) === 0;
  });
}

async function getCerebrasModels() {
  const headers = { Authorization: `Bearer ${auth.cerebras.key}` };
  const data = await httpsGet('https://api.cerebras.ai/v1/models', headers);
  return data.data.map(m => ({
    id: `cerebras/${m.id}`,
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
  }).map(m => ({ id: m.id, name: m.id, context_length: m.context_length ?? null }));
}

async function getSkipRemovalCheck(client) {
  const { rows } = await client.query('SELECT value::text FROM metadata WHERE key = $1', ['_skip_removal_check']);
  if (rows.length > 0) {
    try {
      const value = JSON.parse(rows[0].value);
      return new Set(Array.isArray(value) ? value : [value]);
    } catch {
      return new Set(['openrouter/owl-alpha', 'openrouter/openrouter/free']);
    }
  }
  return new Set(['openrouter/owl-alpha', 'openrouter/openrouter/free']);
}

(async () => {
  await ensureSchema();
  
  const client = await pool.connect();
  try {
    console.log('=== Syncing free models ===\n');

    // Get existing model IDs from PostgreSQL
    const { rows: existingRows } = await client.query(`
      SELECT pm.full_id FROM provider_models pm 
      WHERE pm.source = 'synced' OR pm.source IS NULL
      ORDER BY pm.full_id
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
        const storedId = `nvidia/${m.id}`;
        if (!existingIds.has(storedId) && !existingIds.has(m.id)) {
          newNv.push({ id: storedId, name: m.id, provider: 'NVIDIA', context_length: m.context_length });
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
      const hfData = await httpsGet('https://huggingface.co/api/inference-providers', { Authorization: `Bearer ${auth.huggingface.key}` });
      hfFree = [];
      const hfModelsData = await httpsGet(
        'https://huggingface.co/api/models?inference_provider=huggingface&tags=text-generation&limit=200'
      );
      const hfModelList = Array.isArray(hfModelsData) ? hfModelsData :
        (hfModelsData.models || hfModelsData.data || []);
      for (const m of hfModelList) {
        const id = m.id || m.modelId;
        if (!id) continue;
        const isInferenceFree = m.inference === 'free' || m.inference === 'feather';
        const config = m.config || {};
        const cfgSamplers = config.samplers || {};
        const isFreeByConfig = m.tags && m.tags.includes('free');
        if (isInferenceFree || isFreeByConfig) {
          hfFree.push({ id: `huggingface/${id}`, name: id, context_length: m.generation_parameters?.max_new_tokens || null, huggingfaceId: id });
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
    console.log('\n[Status Check] Models in DB but no longer in OpenRouter/Cerebras...');
    const allCurrentFreeIds = new Set([
      ...orModels.map(m => `openrouter/${m.id}`),
      ...(cbModels || []).map(m => m.id),
      ...hfFree.map(m => m.id),
      ...orModels.map(m => m.id),
    ]);

    const skipRemovalCheck = await getSkipRemovalCheck(client);
    const potentiallyRemoved = [];
    
    const { rows: dbModels } = await client.query(`
      SELECT pm.full_id, pm.provider_id, p.name AS provider_name
      FROM provider_models pm 
      JOIN providers p ON p.id = pm.provider_id 
      WHERE pm.source IN ('synced', 'curated') OR pm.source IS NULL
      AND pm.removed = false
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

      // Start transaction
      await client.query('BEGIN');

      try {
        // Insert new providers
        const providers = ['OpenRouter', 'Cerebras', 'NVIDIA', 'Hugging Face'];
        for (const provider of providers) {
          await client.query(
            `INSERT INTO providers (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
            [provider, provider.toLowerCase()]
          );
        }

        // Insert new canonical models
        const newModels = [];
        for (const m of [...newOr, ...newCb, ...newNv, ...newHf]) {
          if (!newModels.find(nm => nm.name === m.name)) {
            newModels.push({
              name: m.name,
              context_length: m.context_length,
              is_free: true,
              supports_tools: null,
              source: 'synced'
            });
          }
        }

        for (const model of newModels) {
          await client.query(
            `INSERT INTO models (name, context_length, is_free, supports_tools, source) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (name) DO UPDATE SET 
               context_length = EXCLUDED.context_length,
               is_free = EXCLUDED.is_free,
               supports_tools = EXCLUDED.supports_tools,
               source = EXCLUDED.source`,
            [model.name, model.context_length, model.is_free, model.supports_tools, model.source]
          );
        }

        // Get provider and model IDs
        const { rows: providerRows } = await client.query('SELECT id, name FROM providers');
        const providerMap = new Map(providerRows.map(r => [r.name, r.id]));
        
        const { rows: modelRows } = await client.query('SELECT id, name FROM models WHERE source = $1', ['synced']);
        const modelMap = new Map(modelRows.map(r => [r.name, r.id]));

        // Insert new provider_models
        for (const m of newOr) {
          await client.query(
            `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id, source, status_result, status_tested, status_detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [modelMap.get(m.name), providerMap.get('OpenRouter'), m.name, m.id, 'synced', 'untested', null, 'Auto-discovered by sync script']
          );
        }

        for (const m of newCb) {
          await client.query(
            `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id, source, status_result, status_tested, status_detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [modelMap.get(m.name), providerMap.get('Cerebras'), m.name, m.id, 'synced', 'untested', null, 'Auto-discovered by sync script']
          );
        }

        for (const m of newNv) {
          await client.query(
            `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id, source, status_result, status_tested, status_detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [modelMap.get(m.name), providerMap.get('NVIDIA'), m.name, m.id, 'synced', 'untested', null, 'Auto-discovered by sync script']
          );
        }

        for (const m of newHf) {
          await client.query(
            `INSERT INTO provider_models (model_id, provider_id, remote_id, full_id, source, status_result, status_tested, status_detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [modelMap.get(m.name), providerMap.get('Hugging Face'), m.name, m.id, 'synced', 'untested', null, 'Auto-discovered by sync script']
          );
        }

        // Mark potentially removed models
        for (const m of potentiallyRemoved) {
          await client.query(
            `UPDATE provider_models 
             SET removed = true, status_result = 'untested', status_detail = $1, status_tested = NULL
             WHERE id = $2`,
            [`Provider no longer lists this model as free (detected ${new Date().toISOString().slice(0, 10)})`, m.id]
          );
        }

        await client.query('COMMIT');
        console.log('  Changes committed to PostgreSQL');

        // Export to JSON
        const { spawn } = require('child_process');
        const exportScript = path.join(__dirname, 'export-from-pg.js');
        const exportProcess = spawn('node', [exportScript]);

        exportProcess.stdout.on('data', (data) => {
          console.log(data.toString().trim());
        });

        exportProcess.stderr.on('data', (data) => {
          console.error(data.toString().trim());
        });

        exportProcess.on('close', (code) => {
          if (code === 0) {
            console.log('  JSON export completed');
          } else {
            console.error(`  JSON export failed with code ${code}`);
          }
        });

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
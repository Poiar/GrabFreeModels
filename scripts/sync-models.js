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
const logger = require('./utils/logger');
const path = require('path');

const APPLY = process.argv.includes('--apply');

let connectionString = process.env.DATABASE_URL;
if (
  connectionString &&
  connectionString.includes('sslmode=require') &&
  !connectionString.includes('uselibpqcompat')
) {
  connectionString = connectionString.replace(
    'sslmode=require',
    'uselibpqcompat=true&sslmode=require',
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const AUTH_FILE =
  process.env.GFM_AUTH_FILE ||
  path.join(
    process.env.XDG_DATA_HOME ||
      path.join(process.env.HOME || process.env.USERPROFILE, '.local', 'share'),
    'opencode',
    'auth.json',
  );

let auth;
try {
  auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
} catch (e) {
  logger.error(`Failed to read auth file (${AUTH_FILE}): ${e.message}`);
  process.exit(1);
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    mod
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function getOpenRouterFreeModels() {
  const { data } = await httpGet('https://openrouter.ai/api/v1/models');
  return (data.data || []).filter((m) => {
    if (m.id.endsWith(':free')) return true;
    const p = m.pricing || {};
    if (typeof p === 'string') return p === '0';
    return parseFloat(p.prompt ?? p.input) === 0 && parseFloat(p.completion ?? p.output) === 0;
  });
}

async function testOpenRouterModel(modelId, key) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: modelId,
      max_tokens: 4,
      messages: [{ role: 'user', content: 'ok' }],
    });
    const req = https.request(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://opencode.ai',
          'X-Title': 'GrabFreeModels',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) resolve(true);
          else if (res.statusCode === 404 || res.statusCode === 429) resolve(false);
          else {
            try {
              const j = JSON.parse(body);
              const err = j.error?.message || body.slice(0, 200);
              if (err.includes('not found') || err.includes('not available')) resolve(false);
              else resolve(true); // 5xx or unknown = still add it
            } catch {
              resolve(true);
            }
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function getCerebrasModels() {
  const { data } = await httpGet('https://api.cerebras.ai/v1/models', {
    Authorization: `Bearer ${auth.cerebras.key}`,
  });
  return (data.data || []).map((m) => ({
    id: `cerebras/${m.id}`,
    name: m.id,
    context_length: 131072,
  }));
}

async function getNvidiaFreeModels() {
  const { data } = await httpGet('https://integrate.api.nvidia.com/v1/models', {
    Authorization: `Bearer ${auth.nvidia.key}`,
  });
  const excludePattern =
    /embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse/i;
  return (data.data || [])
    .filter((m) => {
      if (m.object !== 'model') return false;
      if (m.task && m.task !== 'chat' && m.task !== 'text-generation' && m.type !== 'chat')
        return false;
      const isFree =
        !m.pricing || m.pricing === '0' || (m.pricing.input === '0' && m.pricing.output === '0');
      if (!isFree) return false;
      if (excludePattern.test(m.id)) return false;
      return true;
    })
    .map((m) => ({
      id: m.id.replace(/^nvidia\//, ''),
      name: m.id,
      context_length: m.context_length ?? null,
    }));
}

async function getGoogleModels() {
  const key = auth.google?.key;
  if (!key) throw new Error('No Google API key found in auth');
  const { data } = await httpGet(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
  );
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({
      id: `google/${m.name.replace('models/', '')}`,
      name: m.displayName || m.name.replace('models/', ''),
      context_length: m.inputTokenLimit ?? null,
      model_id: m.name.replace('models/', ''),
    }));
}

async function getDeepSeekModels() {
  const key = auth.deepseek?.key;
  if (!key) throw new Error('No DeepSeek API key found in auth');
  const { data } = await httpGet('https://api.deepseek.com/models', {
    Authorization: `Bearer ${key}`,
  });
  return (data.data || []).map((m) => ({
    id: `deepseek/${m.id}`,
    name: m.id,
    context_length: null,
  }));
}

async function getGroqModels() {
  const groqJsonPath = path.join(__dirname, '..', 'groq-models.json');
  if (!fs.existsSync(groqJsonPath)) {
    logger.info('  (no groq-models.json found — run scripts/extract-groq.js first)');
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(groqJsonPath, 'utf8'));
  const models = raw.models || [];
  return models
    .filter((m) => {
      if (m.is_free) return true;
      if (m.input_price_per_million === null && m.output_price_per_million === null) return true;
      if (m.input_price_per_million === 0 || m.output_price_per_million === 0) return true;
      return false;
    })
    .map((m) => ({
      id: `groq/${m.model_id}`,
      name: m.display_name || m.model_id,
      context_length: m.context_length ?? null,
    }));
}

async function getOpenCodeModels() {
  const key = auth.opencode?.key;
  if (!key) throw new Error('No OpenCode API key found in auth');
  const { data: resp } = await httpGet('https://opencode.ai/zen/v1/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  const freeIds = [
    'big-pickle',
    'deepseek-v4-flash-free',
    'mimo-v2.5-free',
    'qwen3.6-plus-free',
    'minimax-m3-free',
    'nemotron-3-super-free',
  ];
  return modelList
    .filter((m) => freeIds.includes(m.id))
    .map((m) => ({
      id: `opencode/${m.id}`,
      name: m.id,
      context_length: null,
    }));
}

async function getSkipRemovalCheck(client) {
  const { rows } = await client.query(
    "SELECT value FROM metadata WHERE key = '_skip_removal_check'",
  );
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
  let slug = name
    .toLowerCase()
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
    logger.info('=== Syncing free models ===\n');

    // Get existing free model IDs from datapoint_models
    const { rows: existingRows } = await client.query(`
      SELECT dm.full_id FROM datapoint_models dm WHERE dm.is_free = true ORDER BY dm.full_id
    `);
    const existingIds = new Set(existingRows.map((r) => r.full_id));

    // --- OpenRouter ---
    logger.info('[OpenRouter] Fetching...');
    const orModels = await getOpenRouterFreeModels();
    logger.info(`  Found ${orModels.length} free models`);

    const newOr = [];
    for (const m of orModels) {
      const id = `openrouter/${m.id}`;
      if (!existingIds.has(id)) {
        newOr.push({
          id,
          name: m.id,
          provider: 'openrouter',
          context_length: m.context_length,
          pricing: m.pricing,
        });
      }
    }
    logger.info(`  New: ${newOr.length}`);
    for (const n of newOr) logger.info(`    + ${n.id}`);

    // --- Cerebras ---
    logger.info('\n[Cerebras] Fetching...');
    let newCb = [];
    let cbModels = [];
    try {
      cbModels = await getCerebrasModels();
      logger.info(`  Found ${cbModels.length} models`);
      for (const m of cbModels) {
        if (!existingIds.has(m.id)) newCb.push(m);
      }
      logger.info(`  New: ${newCb.length}`);
      for (const n of newCb) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- NVIDIA ---
    logger.info('\n[NVIDIA] Fetching...');
    let newNv = [];
    let nvModels = [];
    try {
      nvModels = await getNvidiaFreeModels();
      logger.info(`  Found ${nvModels.length} free models`);
      for (const m of nvModels) {
        const storedId = `nvidia/${m.id}`;
        if (!existingIds.has(storedId) && !existingIds.has(m.id)) {
          newNv.push({
            id: storedId,
            name: m.id,
            provider: 'nvidia',
            context_length: m.context_length,
          });
        }
      }
      logger.info(`  New: ${newNv.length}`);
      for (const n of newNv) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- HuggingFace ---
    logger.info('\n[HuggingFace] Fetching...');
    let newHf = [];
    let hfFree = [];
    try {
      const hfModelsData = await httpGet(
        'https://huggingface.co/api/models?inference_provider=huggingface&tags=text-generation&limit=200',
        { Authorization: `Bearer ${auth.huggingface.key}` },
      );
      const hfModelList = Array.isArray(hfModelsData.data)
        ? hfModelsData.data
        : hfModelsData.data?.models || hfModelsData.data?.data || [];
      for (const m of hfModelList) {
        const id = m.id || m.modelId;
        if (!id) continue;
        const isInferenceFree = m.inference === 'free' || m.inference === 'feather';
        const isFreeByConfig = m.tags && m.tags.includes('free');
        if (isInferenceFree || isFreeByConfig) {
          hfFree.push({
            id: `huggingface/${id}`,
            name: id,
            context_length: m.generation_parameters?.max_new_tokens || null,
          });
        }
      }
      logger.info(`  Found ${hfFree.length} free models`);
      for (const m of hfFree) {
        if (!existingIds.has(m.id)) newHf.push(m);
      }
      logger.info(`  New: ${newHf.length}`);
      for (const n of newHf) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- Google Gemini ---
    logger.info('\n[Google] Fetching...');
    let newGoogle = [];
    let googleModels = [];
    try {
      googleModels = await getGoogleModels();
      logger.info(`  Found ${googleModels.length} chat models`);
      for (const m of googleModels) {
        if (!existingIds.has(m.id)) newGoogle.push(m);
      }
      logger.info(`  New: ${newGoogle.length}`);
      for (const n of newGoogle) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- DeepSeek ---
    logger.info('\n[DeepSeek] Fetching...');
    let newDs = [];
    let dsModels = [];
    try {
      dsModels = await getDeepSeekModels();
      logger.info(`  Found ${dsModels.length} models`);
      for (const m of dsModels) {
        if (!existingIds.has(m.id)) newDs.push(m);
      }
      logger.info(`  New: ${newDs.length}`);
      for (const n of newDs) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- Groq ---
    logger.info('\n[Groq] Fetching...');
    let newGroq = [];
    const groqModels = await getGroqModels();
    logger.info(`  Found ${groqModels.length} free models`);
    for (const m of groqModels) {
      if (!existingIds.has(m.id)) newGroq.push(m);
    }
    logger.info(`  New: ${newGroq.length}`);
    for (const n of newGroq) logger.info(`    + ${n.id}`);

    // --- OpenCode ---
    logger.info('\n[OpenCode] Fetching...');
    let newOc = [];
    let ocModels = [];
    try {
      ocModels = await getOpenCodeModels();
      logger.info(`  Found ${ocModels.length} free models`);
      for (const m of ocModels) {
        if (!existingIds.has(m.id)) newOc.push(m);
      }
      logger.info(`  New: ${newOc.length}`);
      for (const n of newOc) logger.info(`    + ${n.id}`);
    } catch (e) {
      logger.info(`  ERROR: ${e.message}`);
    }

    // --- Detect removed models ---
    logger.info('\n[Status Check] Models in DB but no longer in provider listings...');
    const allCurrentFreeIds = new Set([
      ...orModels.map((m) => `openrouter/${m.id}`),
      ...(cbModels || []).map((m) => m.id),
      ...(nvModels || []).map((m) => `nvidia/${m.id}`),
      ...hfFree.map((m) => m.id),
      ...(googleModels || []).map((m) => m.id),
      ...(dsModels || []).map((m) => m.id),
      ...groqModels.map((m) => m.id),
      ...(ocModels || []).map((m) => m.id),
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
    logger.info(`  Potentially removed: ${potentiallyRemoved.length}`);
    for (const r of potentiallyRemoved) logger.info(`    ? ${r.full_id}`);

    // --- Summary ---
    const totalNew =
      newOr.length +
      newCb.length +
      newNv.length +
      newHf.length +
      newGoogle.length +
      newDs.length +
      newGroq.length +
      newOc.length;
    logger.info('\n=== Summary ===');
    logger.info(`  New models found:    ${totalNew}`);
    logger.info(`  Potentially removed: ${potentiallyRemoved.length}`);

    if (!APPLY) {
      logger.info('\nDry-run mode. Use --apply to update PostgreSQL');
    } else {
      // --- Pre-validate: test new OpenRouter models respond before adding to DB ---
      const newOrIds = newOr.map((m) => m.id);
      if (newOrIds.length > 0) {
        logger.info('\n[Pre-validate] Testing', newOrIds.length, 'new OpenRouter models...');
        for (let i = newOr.length - 1; i >= 0; i--) {
          const m = newOr[i];
          const apiModelId = m.id.replace('openrouter/', '');
          try {
            const valid = await testOpenRouterModel(apiModelId, auth.openrouter?.key);
            if (valid) {
              logger.info(`  ✓ ${m.id}`);
            } else {
              logger.info(`  ✗ ${m.id} — not responding, skipping`);
              newOr.splice(i, 1);
            }
          } catch (e) {
            logger.info(`  ✗ ${m.id} — ${e.message}`);
            newOr.splice(i, 1);
          }
        }
      }

      logger.info('\nApplying changes...');
      await client.query('BEGIN');

      try {
        // Ensure datapoint_providers exist
        const providerSlugs = [
          'openrouter',
          'cerebras',
          'nvidia',
          'huggingface',
          'google',
          'deepseek',
          'groq',
          'opencode',
        ];
        for (const slug of providerSlugs) {
          await client.query(
            `INSERT INTO datapoint_providers (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
            [slug, slug.charAt(0).toUpperCase() + slug.slice(1)],
          );
        }

        // Get provider ID map
        const { rows: providerRows } = await client.query(
          'SELECT id, slug FROM datapoint_providers',
        );
        const providerMap = new Map(providerRows.map((r) => [r.slug, r.id]));

        const allNew = [
          ...newOr,
          ...newCb,
          ...newNv,
          ...newHf,
          ...newGoogle,
          ...newDs,
          ...newGroq,
          ...newOc,
        ];

        for (const m of allNew) {
          const providerSlug = m.id.split('/')[0];
          const providerId = providerMap.get(providerSlug);
          if (!providerId) {
            logger.info(`  SKIP ${m.id}: unknown provider "${providerSlug}"`);
            continue;
          }

          const remoteId = m.id.includes('/') ? m.id.slice(m.id.indexOf('/') + 1) : m.id;
          const superSlug = normalizeModelSlug(m.name);

          // Upsert super model
          const { rows: mmRows } = await client.query(
            `INSERT INTO super_models (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [m.name, superSlug],
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
            [superId, providerId, remoteId, m.id, m.context_length],
          );
        }

        // Mark potentially removed models
        for (const m of potentiallyRemoved) {
          await client.query(
            `UPDATE datapoint_models
             SET is_removed = true, status_result = 'untested', status_detail = $1, status_tested = NULL, updated_at = now()
             WHERE full_id = $2`,
            [
              `Provider no longer lists this model as free (detected ${new Date().toISOString().slice(0, 10)})`,
              m.full_id,
            ],
          );
        }

        await client.query('COMMIT');
        logger.info('  Changes committed to PostgreSQL');

        // Export to JSON
        const { spawn } = require('child_process');
        const exportScript = path.join(__dirname, 'export-from-pg.js');
        const exportProcess = spawn('node', [exportScript]);
        exportProcess.stdout.on('data', (d) => logger.info(d.toString().trim()));
        exportProcess.stderr.on('data', (d) => console.error(d.toString().trim()));
        const exportCode = await new Promise((resolve) => exportProcess.on('close', resolve));
        logger.info(
          exportCode === 0
            ? '  JSON export completed'
            : `  JSON export failed with code ${exportCode}`,
        );
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
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

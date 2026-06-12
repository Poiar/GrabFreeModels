#!/usr/bin/env node
/**
 * discover-new-models.js
 * Polls each provider's /models endpoint for their current model list and compares
 * against the database to find models not yet tracked.
 *
 * Usage: node scripts/discover-new-models.js [--apply] [--json] [--provider X]
 *   --apply     : Write discoveries to scripts/discoveries/YYYY-MM-DD.json (default: dry-run)
 *   --json      : Machine-readable JSON output to stdout
 *   --provider X: Check only a single provider
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');
const SINGLE_PROVIDER = (() => {
  const idx = process.argv.indexOf('--provider');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
})();

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
    const req = mod.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

// ── Provider definitions ──

const PROVIDERS = [
  {
    slug: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/models',
    authPath: null,
    parse: (json) => {
      return (json.data || [])
        .filter((m) => {
          if (m.id.endsWith(':free')) return true;
          const p = m.pricing || {};
          if (typeof p === 'string') return p === '0';
          return (
            parseFloat(p.prompt ?? p.input) === 0 && parseFloat(p.completion ?? p.output) === 0
          );
        })
        .map((m) => {
          const p = m.pricing || {};
          const pricing =
            typeof p === 'string'
              ? { prompt: 0, completion: 0 }
              : {
                  prompt: parseFloat(p.prompt ?? p.input ?? 0),
                  completion: parseFloat(p.completion ?? p.output ?? 0),
                };
          return {
            id: m.id,
            context_length: m.context_length ?? m.max_context_length ?? null,
            pricing: pricing.prompt === 0 && pricing.completion === 0 ? 'free' : pricing,
          };
        });
    },
  },
  {
    slug: 'nvidia',
    name: 'NVIDIA',
    url: 'https://integrate.api.nvidia.com/v1/models',
    authPath: 'nvidia.key',
    parse: (json) => {
      const excludePattern =
        /embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse/i;
      return (json.data || [])
        .filter((m) => {
          if (m.object !== 'model') return false;
          if (m.task && m.task !== 'chat' && m.task !== 'text-generation' && m.type !== 'chat')
            return false;
          const isFree =
            !m.pricing ||
            m.pricing === '0' ||
            (m.pricing?.input === '0' && m.pricing?.output === '0');
          if (!isFree) return false;
          if (excludePattern.test(m.id)) return false;
          return true;
        })
        .map((m) => ({
          id: m.id,
          context_length: m.context_length ?? null,
          pricing: 'free',
        }));
    },
  },
  {
    slug: 'cerebras',
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/models',
    authPath: 'cerebras.key',
    parse: (json) => {
      return (json.data || []).map((m) => ({
        id: m.id,
        context_length: m.max_context_length ?? 131072,
        pricing: 'free',
      }));
    },
  },
  {
    slug: 'groq',
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/models',
    authPath: 'groq.key',
    parse: (json) => {
      const excludePattern = /whisper|guard|safeguard|orpheus/i;
      return (json.data || [])
        .filter((m) => {
          if (!m.active) return false;
          if (excludePattern.test(m.id)) return false;
          return true;
        })
        .map((m) => ({
          id: m.id,
          context_length: m.context_window ?? null,
          pricing: 'free',
        }));
    },
  },
  {
    slug: 'deepseek',
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/models',
    authPath: 'deepseek.key',
    parse: (json) => {
      return (json.data || []).map((m) => ({
        id: m.id,
        context_length: null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'google',
    name: 'Google',
    url: null, // uses query param auth, constructed in fetch
    authPath: 'google.key',
    parse: null,
    fetch: async (key) => {
      const { data } = await httpGet(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      );
      return (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          id: `google/${m.name.replace('models/', '')}`,
          context_length: m.inputTokenLimit ?? null,
          pricing: 'free',
        }));
    },
  },
  {
    slug: 'together',
    name: 'Together',
    url: 'https://api.together.xyz/v1/models',
    authPath: 'together.key',
    parse: (json) => {
      return (json.data || []).map((m) => ({
        id: m.id,
        context_length: m.context_length ?? m.max_context_length ?? null,
        pricing: m.pricing
          ? m.pricing === '0' || (m.pricing.input === '0' && m.pricing.output === '0')
            ? 'free'
            : m.pricing
          : null,
      }));
    },
  },
  {
    slug: 'mistral',
    name: 'Mistral',
    url: 'https://api.mistral.ai/v1/models',
    authPath: 'mistral.key',
    parse: (json) => {
      return (json.data || []).map((m) => ({
        id: m.id,
        context_length: m.max_context_length ?? null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'deepinfra',
    name: 'DeepInfra',
    url: 'https://api.deepinfra.com/v1/openai/models',
    authPath: 'deepinfra.key',
    parse: (json) => {
      const modelList = Array.isArray(json) ? json : json.data || [];
      return modelList
        .filter((m) => m.owned_by !== 'openai')
        .map((m) => ({
          id: m.id,
          context_length: m.context_window ?? m.max_input_tokens ?? null,
          pricing: null,
        }));
    },
  },
  {
    slug: 'novitaai',
    name: 'NovitaAI',
    url: 'https://api.novita.ai/v3/openai/models',
    authPath: 'novitaai.key',
    parse: (json) => {
      const modelList = Array.isArray(json) ? json : json.data || [];
      return modelList.map((m) => ({
        id: m.id,
        context_length: m.context_window ?? m.max_input_tokens ?? null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'siliconflow',
    name: 'SiliconFlow',
    url: 'https://api.siliconflow.com/v1/models',
    authPath: 'siliconflow.key',
    parse: (json) => {
      const modelList = Array.isArray(json) ? json : json.data || [];
      return modelList.map((m) => ({
        id: m.id,
        context_length: m.context_window ?? m.max_input_tokens ?? null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'xai',
    name: 'xAI',
    url: 'https://api.x.ai/v1/models',
    authPath: 'xai.key',
    parse: (json) => {
      const modelList = Array.isArray(json) ? json : json.data || [];
      return modelList.map((m) => ({
        id: m.id,
        context_length: m.context_window ?? m.max_input_tokens ?? null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'zhipuai',
    name: 'ZhipuAI',
    url: 'https://open.bigmodel.cn/api/paas/v4/models',
    authPath: 'zhipuai.key',
    parse: (json) => {
      const modelList = Array.isArray(json) ? json : json.data || [];
      return modelList.map((m) => ({
        id: m.id,
        context_length: m.context_window ?? m.max_input_tokens ?? null,
        pricing: null,
      }));
    },
  },
  {
    slug: 'huggingface',
    name: 'HuggingFace',
    url: 'https://huggingface.co/api/models?filter=inference&sort=likes',
    authPath: null,
    parse: (json) => {
      return (Array.isArray(json) ? json : []).map((m) => ({
        id: m.id,
        context_length: null,
        pricing: null,
      }));
    },
  },
];

// ── Helpers to get auth key ──

function getAuthKey(authPath) {
  if (!authPath) return null;
  const parts = authPath.split('.');
  let val = auth;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return null;
    val = val[p];
  }
  return val || null;
}

function buildAuthHeaders(authPath) {
  const key = getAuthKey(authPath);
  if (!key) return {};
  const slug = authPath.split('.')[0];
  if (slug === 'google') return {};
  return { Authorization: `Bearer ${key}` };
}

// ── Fetch from a single provider ──

async function fetchProvider(provider) {
  const { slug, name, url, authPath, parse, fetch: customFetch } = provider;

  const key = getAuthKey(authPath);
  if (authPath && !key) {
    return { slug, name, models: [], error: `No auth key found (auth.${authPath})`, skipped: true };
  }

  if (customFetch) {
    try {
      const models = await customFetch(key);
      return { slug, name, models, error: null, skipped: false };
    } catch (e) {
      return { slug, name, models: [], error: e.message, skipped: false };
    }
  }

  try {
    const headers = buildAuthHeaders(authPath);
    const { data, status } = await httpGet(url, headers);
    if (status < 200 || status >= 300) {
      return { slug, name, models: [], error: `HTTP ${status}`, skipped: false };
    }
    const models = parse(data);
    return { slug, name, models, error: null, skipped: false };
  } catch (e) {
    return { slug, name, models: [], error: e.message, skipped: false };
  }
}

// ── DB access ──

async function getExistingModelIds() {
  const { Pool } = require('pg');

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
    max: 1,
  });

  try {
    const { rows } = await pool.query(
      `SELECT full_id FROM datapoint_models WHERE is_free = true ORDER BY full_id`,
    );
    return new Set(rows.map((r) => r.full_id));
  } finally {
    await pool.end();
  }
}

// ── Main ──

(async () => {
  const providersToCheck = SINGLE_PROVIDER
    ? PROVIDERS.filter((p) => p.slug === SINGLE_PROVIDER)
    : PROVIDERS;

  if (SINGLE_PROVIDER && providersToCheck.length === 0) {
    logger.error(
      `Unknown provider "${SINGLE_PROVIDER}". Valid providers: ${PROVIDERS.map((p) => p.slug).join(', ')}`,
    );
    process.exit(1);
  }

  logger.info('=== Model Discovery ===\n');

  // Fetch from all providers in parallel
  const results = await Promise.allSettled(providersToCheck.map((p) => fetchProvider(p)));

  const providerResults = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          slug: 'unknown',
          name: 'Unknown',
          models: [],
          error: r.reason?.message || 'Unknown error',
          skipped: false,
        },
  );

  // Get existing DB model IDs
  let existingIds;
  try {
    existingIds = await getExistingModelIds();
    logger.info(`Loaded ${existingIds.size} existing free models from database\n`);
  } catch (e) {
    logger.error(`Failed to load DB models: ${e.message}`);
    process.exit(1);
  }

  // Find new models per provider
  const discoveries = {};
  let totalNew = 0;
  let providersWithNew = 0;

  for (const pr of providerResults) {
    const newModels = [];
    for (const m of pr.models) {
      const fullId = `${pr.slug}/${m.id}`;
      if (!existingIds.has(fullId)) {
        newModels.push({
          full_id: fullId,
          provider: pr.slug,
          model_id: m.id,
          context_length: m.context_length,
          pricing: m.pricing,
        });
      }
    }

    if (SINGLE_PROVIDER || pr.error || pr.skipped || newModels.length > 0) {
      if (pr.skipped) {
        logger.info(`[${pr.name}] Skipped (no auth key)`);
      } else if (pr.error) {
        logger.warn(`[${pr.name}] Error: ${pr.error}`);
      } else {
        logger.info(`[${pr.name}] ${pr.models.length} models, ${newModels.length} new`);
        for (const n of newModels.slice(0, 20)) {
          const ctx = n.context_length ? ` [ctx: ${n.context_length}]` : '';
          const pricing =
            n.pricing && n.pricing !== 'free' ? ` [pricing: ${JSON.stringify(n.pricing)}]` : '';
          logger.info(`  + ${n.full_id}${ctx}${pricing}`);
        }
        if (newModels.length > 20) {
          logger.info(`  ... and ${newModels.length - 20} more`);
        }
      }
    }

    if (newModels.length > 0) {
      discoveries[pr.slug] = newModels;
      totalNew += newModels.length;
      providersWithNew++;
    }
  }

  // Summary
  const summary = `Found ${totalNew} new models across ${providersWithNew} providers`;
  logger.info(`\n=== ${summary} ===`);

  if (JSON_OUTPUT) {
    const output = {
      date: new Date().toISOString().slice(0, 10),
      summary: { total_new: totalNew, providers_with_new: providersWithNew },
      discoveries,
    };
    console.log(JSON.stringify(output, null, 2));
  }

  if (totalNew === 0) {
    process.exit(0);
  }

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to write discoveries to disk');
    process.exit(0);
  }

  // Write discoveries file
  const discoveriesDir = path.join(__dirname, 'discoveries');
  const today = new Date().toISOString().slice(0, 10);
  const filePath = path.join(discoveriesDir, `${today}.json`);

  try {
    fs.mkdirSync(discoveriesDir, { recursive: true });
  } catch (e) {
    logger.error(`Failed to create discoveries directory: ${e.message}`);
    process.exit(1);
  }

  const outputData = {
    date: today,
    summary: { total_new: totalNew, providers_with_new: providersWithNew },
    discoveries,
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
    logger.info(`\nDiscoveries saved to ${filePath}`);
  } catch (e) {
    logger.error(`Failed to write discoveries file: ${e.message}`);
    process.exit(1);
  }
})().catch((e) => {
  logger.error(e.message);
  process.exit(1);
});

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

// Known free tier limitations per provider
const PROVIDER_LIMITATIONS = {
  openrouter: {
    rate_limit: '20 RPM / 1,000 TPM',
    notes: 'Free models on OpenRouter have shared rate limits across all free models',
  },
  cerebras: {
    rate_limit: '30 RPM / 1M TPM',
    daily_tokens: 1000000,
    notes: 'Free tier via Cerebras Cloud. Higher limits for open-source models.',
  },
  nvidia: {
    daily_requests: 5000,
    rate_limit: '5,000 requests/day',
    notes: 'Free tier via NVIDIA NIM API. Requires NVIDIA account login.',
  },
  google: {
    daily_requests: 1500,
    rate_limit: '15 RPM / 1M TPM (Gemini 2.5 Flash); lower for Pro models',
    notes: 'Free tier via Google AI Studio. Rate limits vary by model tier.',
  },
  deepseek: {
    rate_limit: 'Varies; throttled during peak',
    notes: 'Free tier access. May be throttled during peak hours. Requires DeepSeek account.',
  },
  groq: {
    rate_limit: '30 RPM / 7,000 TPM',
    notes: 'Free tier. Rate limits may decrease during high demand.',
  },
  opencode: {
    rate_limit: 'Varies by model',
    notes: 'Free tier models via OpenCode Zen. Requires OpenCode account.',
  },
  'github-models': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via GitHub Models. Requires GitHub account. Rate limits vary by model.',
  },
  cloudflare: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Cloudflare Workers AI. Limited daily requests.',
  },
  'cloudflare-ai-gateway': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Cloudflare AI Gateway. Limited daily requests.',
  },
  cohere: {
    rate_limit: 'Varies by model',
    notes: 'Free trial tier via Cohere. Rate limited.',
  },
  mistral: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Mistral API. Rate limited.',
  },
  gitlab: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via GitLab AI. Requires GitLab account.',
  },
  iflowcn: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via iFlow CN. Rate limited.',
  },
  kilo: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Kilo. Rate limited.',
  },
  modelsdev: {
    rate_limit: 'Varies by model',
    notes: 'Free inference via Hugging Face community providers. Cold starts and rate limits apply.',
  },
  deepinfra: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Deep Infra. Rate limited, pay-as-you-go for higher limits.',
  },
  novitaai: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via NovitaAI. Requires account. Rate limited.',
  },
  siliconflow: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via SiliconFlow. Requires account. Rate limited.',
  },
  'alibaba-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Alibaba Cloud coding plan. Requires account.',
  },
  'alibaba-coding-plan-cn': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Alibaba Cloud coding plan (CN). Requires account.',
  },
  'tencent-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Tencent Cloud coding plan. Requires account.',
  },
  'xiaomi-token-plan-ams': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Xiaomi token plan (AMS). Requires account.',
  },
  'xiaomi-token-plan-cn': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Xiaomi token plan (CN). Requires account.',
  },
  'xiaomi-token-plan-sgp': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Xiaomi token plan (SGP). Requires account.',
  },
  'minimax-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via MiniMax coding plan. Requires account.',
  },
  'minimax-cn-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via MiniMax coding plan (CN). Requires account.',
  },
  'zhipuai-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via ZhipuAI coding plan. Requires account.',
  },
  'zai-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Z.ai coding plan. Requires account.',
  },
  'kimi-for-coding': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Kimi for Coding. Requires account.',
  },
  'umans-ai-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Uman\'s AI coding plan. Requires account.',
  },
  'kuae-cloud-coding-plan': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Kuae Cloud coding plan. Requires account.',
  },
  modelscope: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via ModelScope. Requires account.',
  },
  llama: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Llama API. Rate limited.',
  },
  cortecs: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Cortecs. Rate limited.',
  },
  'atomic-chat': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Atomic Chat. Rate limited.',
  },
  aihubmix: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via AI Hub Mix. Rate limited.',
  },
  'siliconflow-cn': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via SiliconFlow (CN). Requires account.',
  },
  lmstudio: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via LM Studio. Local inference; no API limits.',
  },
  poe: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Poe by Quora. Daily message limits apply.',
  },
  vercel: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Vercel AI. Rate limited.',
  },
  zenmux: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via ZenMux. Rate limited.',
  },
  zai: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Z.ai. Requires account.',
  },
  zhipuai: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via ZhipuAI. Requires account.',
  },
  'alibaba-cn': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Alibaba Cloud (CN). Requires account.',
  },
  nova: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Nova. Rate limited.',
  },
  poolside: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Poolside. Rate limited.',
  },
  firepass: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Firepass. Rate limited.',
  },
  jiekou: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Jiekou. Rate limited.',
  },
  meganova: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via MegaNova. Rate limited.',
  },
  'nano-gpt': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via NanoGPT. Rate limited.',
  },
  'novita-ai': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Novita AI. Rate limited.',
  },
  orcarouter: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via OrcaRouter. Rate limited.',
  },
  'tencent-tokenhub': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Tencent TokenHub. Requires account.',
  },
  llmgateway: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via LLM Gateway. Rate limited.',
  },
  'privatemode-ai': {
    rate_limit: 'Varies by model',
    notes: 'Free tier via PrivateMode AI. Rate limited.',
  },
};

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
  const key = auth.groq?.key;
  if (!key) {
    logger.info('  (no Groq key — set auth.groq.key)');
    return [];
  }
  const { data } = await httpGet('https://api.groq.com/openai/v1/models', {
    Authorization: `Bearer ${key}`,
  });
  const excludePattern =
    /whisper|guard|safeguard|orpheus/i;
  return (data.data || [])
    .filter((m) => {
      if (!m.active) return false;
      if (excludePattern.test(m.id)) return false;
      return true;
    })
    .map((m) => ({
      id: `groq/${m.id}`,
      name: m.id,
      context_length: m.context_window ?? null,
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

async function getDeepInfraModels() {
  const key = auth.deepinfra?.key;
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const { data: resp } = await httpGet('https://api.deepinfra.com/v1/openai/models', headers);
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  return modelList
    .filter((m) => m.owned_by !== 'openai')
    .map((m) => ({
      id: `deepinfra/${m.id}`,
      name: m.id,
      context_length: m.context_window ?? m.max_input_tokens ?? null,
    }));
}

async function getCloudflareModels() {
  const key = auth.cloudflare?.key;
  const accountId = auth.cloudflare?.accountId;
  if (!key || !accountId) throw new Error('No Cloudflare API credentials found');
  const { data: resp } = await httpGet(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text Generation`,
    { Authorization: `Bearer ${key}` },
  );
  const modelList = Array.isArray(resp) ? resp : resp.result || [];
  return modelList
    .filter((m) => m.properties?.free === true || m.name.toLowerCase().includes('free'))
    .map((m) => ({
      id: `cloudflare/${m.name}`,
      name: m.name,
      context_length: m.properties?.context_window || null,
    }));
}

async function getNovitaModels() {
  const key = auth.novitaai?.key;
  if (!key) throw new Error('No NovitaAI API key found');
  const { data: resp } = await httpGet('https://api.novita.ai/v3/openai/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  return modelList.map((m) => ({
    id: `novitaai/${m.id}`,
    name: m.id,
    context_length: m.context_window ?? m.max_input_tokens ?? null,
  }));
}

async function getSiliconFlowModels() {
  const key = auth.siliconflow?.key;
  if (!key) throw new Error('No SiliconFlow API key found');
  const { data: resp } = await httpGet('https://api.siliconflow.com/v1/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  return modelList.map((m) => ({
    id: `siliconflow/${m.id}`,
    name: m.id,
    context_length: m.context_window ?? m.max_input_tokens ?? null,
  }));
}

async function getXaiModels() {
  const key = auth.xai?.key;
  if (!key) throw new Error('No xAI API key found');
  const { data: resp } = await httpGet('https://api.x.ai/v1/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  return modelList.map((m) => ({
    id: `xai/${m.id}`,
    name: m.id,
    context_length: m.context_window ?? m.max_input_tokens ?? null,
  }));
}

async function getZhipuaiModels() {
  const key = auth.zhipuai?.key;
  if (!key) throw new Error('No ZhipuAI API key found');
  const { data: resp } = await httpGet('https://open.bigmodel.cn/api/paas/v4/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];
  return modelList.map((m) => ({
    id: `zhipuai/${m.id}`,
    name: m.id,
    context_length: m.context_window ?? m.max_input_tokens ?? null,
  }));
}

async function getGithubModels() {
  const key = auth.github_models?.key;
  if (!key) throw new Error('No GitHub Models token found');
  const { data: resp } = await httpGet('https://models.inference.ai.azure.com/models', {
    Authorization: `Bearer ${key}`,
  });
  const modelList = Array.isArray(resp) ? resp : resp.data || [];

  const KNOWN_CTX = {
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'Meta-Llama-3.1-405B-Instruct': 131072,
    'Meta-Llama-3.1-8B-Instruct': 131072,
  };

  return modelList
    .filter((m) => m.task === 'chat-completion')
    .map((m) => ({
      id: `github-models/${m.name}`,
      name: m.name,
      context_length: KNOWN_CTX[m.name] ?? null,
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

// ── Creator name humanization ──
const CREATOR_WHITELIST = new Map([
  ['meta-llama', 'Meta'],
  ['meta', 'Meta'],
  ['mistralai', 'Mistral AI'],
  ['deepseek-ai', 'DeepSeek'],
  ['qwen', 'Alibaba'],
  ['Qwen', 'Alibaba'],
  ['google', 'Google'],
  ['nvidia', 'NVIDIA'],
  ['microsoft', 'Microsoft'],
  ['openai', 'OpenAI'],
  ['cohere', 'Cohere'],
  ['anthropic', 'Anthropic'],
  ['ibm', 'IBM'],
  ['xai', 'xAI'],
  ['01-ai', '01.AI'],
  ['tiiuae', 'TII'],
  ['rhymes-ai', 'Rhymes AI'],
  ['stabilityai', 'Stability AI'],
  ['togethercomputer', 'Together AI'],
  ['black-forest-labs', 'Black Forest Labs'],
  ['bytedance', 'ByteDance'],
  ['alibaba', 'Alibaba'],
  ['tencent', 'Tencent'],
  ['minimax', 'MiniMax'],
  ['deepinfra', 'DeepInfra'],
  ['siliconflow', 'SiliconFlow'],
  ['novitaai', 'NovitaAI'],
  ['zhipuai', 'ZhipuAI'],
]);

function humanizeCreator(raw) {
  if (CREATOR_WHITELIST.has(raw)) return CREATOR_WHITELIST.get(raw);

  // Split on hyphens/underscores -> capitalize each word
  if (/[-_]/.test(raw)) {
    return raw.split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Detect camelCase boundaries in mixed-case names
  if (/[A-Z]/.test(raw) && /[a-z]/.test(raw)) {
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // All lowercase, no separators — capitalize first letter
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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

    let newOr, orModels, newCb, cbModels, newNv, nvModels, newGoogle, googleModels, newDs, dsModels, newGroq, groqModels, newOc, ocModels, newGh, ghModels, newDi, diModels, newCf, cfModels, newNvt, nvtModels, newSf, sfModels, newXai, xaiModels, newZhipu, zhipuModels;

    // --- Batch 1: OpenRouter, Cerebras, NVIDIA ---
    async function fetchOpenRouter() {
      logger.info('[OpenRouter] Fetching...');
      newOr = []; orModels = [];
      try {
        orModels = await getOpenRouterFreeModels();
        logger.info(`  Found ${orModels.length} free models`);
        for (const m of orModels) {
          const id = `openrouter/${m.id}`;
          if (!existingIds.has(id)) {
            newOr.push({ id, name: m.id, provider: 'openrouter', context_length: m.context_length, pricing: m.pricing });
          }
        }
        logger.info(`  New: ${newOr.length}`);
        for (const n of newOr) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchCerebras() {
      logger.info('\n[Cerebras] Fetching...');
      newCb = []; cbModels = [];
      try {
        cbModels = await getCerebrasModels();
        logger.info(`  Found ${cbModels.length} models`);
        for (const m of cbModels) { if (!existingIds.has(m.id)) newCb.push(m); }
        logger.info(`  New: ${newCb.length}`);
        for (const n of newCb) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchNvidia() {
      logger.info('\n[NVIDIA] Fetching...');
      newNv = []; nvModels = [];
      try {
        nvModels = await getNvidiaFreeModels();
        logger.info(`  Found ${nvModels.length} free models`);
        for (const m of nvModels) {
          const storedId = `nvidia/${m.id}`;
          if (!existingIds.has(storedId) && !existingIds.has(m.id)) {
            newNv.push({ id: storedId, name: m.id, provider: 'nvidia', context_length: m.context_length });
          }
        }
        logger.info(`  New: ${newNv.length}`);
        for (const n of newNv) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    await Promise.allSettled([fetchOpenRouter(), fetchCerebras(), fetchNvidia()]);

    // --- Batch 2: Google, DeepSeek ---
    async function fetchGoogle() {
      logger.info('\n[Google] Fetching...');
      newGoogle = []; googleModels = [];
      try {
        googleModels = await getGoogleModels();
        logger.info(`  Found ${googleModels.length} chat models`);
        for (const m of googleModels) { if (!existingIds.has(m.id)) newGoogle.push(m); }
        logger.info(`  New: ${newGoogle.length}`);
        for (const n of newGoogle) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchDeepSeek() {
      logger.info('\n[DeepSeek] Fetching...');
      newDs = []; dsModels = [];
      try {
        dsModels = await getDeepSeekModels();
        logger.info(`  Found ${dsModels.length} models`);
        for (const m of dsModels) { if (!existingIds.has(m.id)) newDs.push(m); }
        logger.info(`  New: ${newDs.length}`);
        for (const n of newDs) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    await Promise.allSettled([fetchGoogle(), fetchDeepSeek()]);

    // --- Batch 3: Groq, OpenCode ---
    async function fetchGroq() {
      logger.info('\n[Groq] Fetching...');
      newGroq = []; groqModels = [];
      try {
        groqModels = await getGroqModels();
        logger.info(`  Found ${groqModels.length} free models`);
        for (const m of groqModels) { if (!existingIds.has(m.id)) newGroq.push(m); }
        logger.info(`  New: ${newGroq.length}`);
        for (const n of newGroq) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchOpenCode() {
      logger.info('\n[OpenCode] Fetching...');
      newOc = []; ocModels = [];
      try {
        ocModels = await getOpenCodeModels();
        logger.info(`  Found ${ocModels.length} free models`);
        for (const m of ocModels) { if (!existingIds.has(m.id)) newOc.push(m); }
        logger.info(`  New: ${newOc.length}`);
        for (const n of newOc) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    await Promise.allSettled([fetchGroq(), fetchOpenCode()]);

    // --- Batch 4: Deep Infra, Cloudflare, NovitaAI, SiliconFlow, GitHub, xAI, Zhipu ---
    async function fetchDeepInfra() {
      logger.info('\n[DeepInfra] Fetching...');
      newDi = []; diModels = [];
      try {
        diModels = await getDeepInfraModels();
        logger.info(`  Found ${diModels.length} models`);
        for (const m of diModels) { if (!existingIds.has(m.id)) newDi.push(m); }
        logger.info(`  New: ${newDi.length}`);
        for (const n of newDi) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchCloudflare() {
      logger.info('\n[Cloudflare] Fetching...');
      newCf = []; cfModels = [];
      try {
        cfModels = await getCloudflareModels();
        logger.info(`  Found ${cfModels.length} free models`);
        for (const m of cfModels) { if (!existingIds.has(m.id)) newCf.push(m); }
        logger.info(`  New: ${newCf.length}`);
        for (const n of newCf) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchNovita() {
      logger.info('\n[NovitaAI] Fetching...');
      newNvt = []; nvtModels = [];
      try {
        nvtModels = await getNovitaModels();
        logger.info(`  Found ${nvtModels.length} models`);
        for (const m of nvtModels) { if (!existingIds.has(m.id)) newNvt.push(m); }
        logger.info(`  New: ${newNvt.length}`);
        for (const n of newNvt) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchSiliconFlow() {
      logger.info('\n[SiliconFlow] Fetching...');
      newSf = []; sfModels = [];
      try {
        sfModels = await getSiliconFlowModels();
        logger.info(`  Found ${sfModels.length} models`);
        for (const m of sfModels) { if (!existingIds.has(m.id)) newSf.push(m); }
        logger.info(`  New: ${newSf.length}`);
        for (const n of newSf) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchGithub() {
      logger.info('\n[GitHub Models] Fetching...');
      newGh = []; ghModels = [];
      try {
        ghModels = await getGithubModels();
        logger.info(`  Found ${ghModels.length} models`);
        for (const m of ghModels) { if (!existingIds.has(m.id)) newGh.push(m); }
        logger.info(`  New: ${newGh.length}`);
        for (const n of newGh) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchXai() {
      logger.info('\n[xAI] Fetching...');
      newXai = []; xaiModels = [];
      try {
        xaiModels = await getXaiModels();
        logger.info(`  Found ${xaiModels.length} models`);
        for (const m of xaiModels) { if (!existingIds.has(m.id)) newXai.push(m); }
        logger.info(`  New: ${newXai.length}`);
        for (const n of newXai) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    async function fetchZhipuai() {
      logger.info('\n[ZhipuAI] Fetching...');
      newZhipu = []; zhipuModels = [];
      try {
        zhipuModels = await getZhipuaiModels();
        logger.info(`  Found ${zhipuModels.length} models`);
        for (const m of zhipuModels) { if (!existingIds.has(m.id)) newZhipu.push(m); }
        logger.info(`  New: ${newZhipu.length}`);
        for (const n of newZhipu) logger.info(`    + ${n.id}`);
      } catch (e) { logger.info(`  ERROR: ${e.message}`); }
    }
    await Promise.allSettled([fetchDeepInfra(), fetchCloudflare(), fetchNovita(), fetchSiliconFlow(), fetchGithub(), fetchXai(), fetchZhipuai()]);

    // --- Detect removed models ---
    logger.info('\n[Status Check] Models in DB but no longer in provider listings...');
    const allCurrentFreeIds = new Set([
      ...orModels.map((m) => `openrouter/${m.id}`),
      ...(cbModels || []).map((m) => m.id),
      ...(nvModels || []).map((m) => `nvidia/${m.id}`),
      ...(googleModels || []).map((m) => m.id),
      ...(dsModels || []).map((m) => m.id),
      ...groqModels.map((m) => m.id),
      ...(ocModels || []).map((m) => m.id),
      ...(diModels || []).map((m) => m.id),
      ...(cfModels || []).map((m) => m.id),
      ...(nvtModels || []).map((m) => m.id),
      ...(sfModels || []).map((m) => m.id),
      ...(ghModels || []).map((m) => m.id),
      ...(xaiModels || []).map((m) => m.id),
      ...(zhipuModels || []).map((m) => m.id),
    ]);

    const skipRemovalCheck = await getSkipRemovalCheck(client);
    const potentiallyRemoved = [];

    // Only check removal for providers with direct API sync (not community imports)
    const syncedSlugs = new Set([
      'openrouter', 'cerebras', 'nvidia', 'google',
      'deepseek', 'groq', 'opencode', 'github-models', 'deepinfra', 'cloudflare', 'novitaai', 'siliconflow', 'xai', 'zhipuai',
    ]);

    const { rows: dbModels } = await client.query(`
      SELECT dm.full_id, dp.name AS provider_name, dp.slug AS provider_slug
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true AND dm.is_removed = false
    `);

    for (const m of dbModels) {
      if (!syncedSlugs.has(m.provider_slug)) continue; // skip community-imported providers
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
      newGoogle.length +
      newDs.length +
      newGroq.length +
      newOc.length +
      newDi.length +
      newCf.length +
      newNvt.length +
      newGh.length +
      newSf.length +
      newXai.length +
      newZhipu.length;
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
          'google',
          'deepseek',
          'groq',
          'opencode',
          'github-models',
          'cloudflare',
          'cohere',
          'llmgateway',
          'deepinfra',
          'novitaai',
          'siliconflow',
          'xai',
          'zhipuai',
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

        // Ensure sources rows exist for all synced API providers (provenance tracking)
        for (const slug of providerSlugs) {
          const providerId = providerMap.get(slug);
          if (!providerId) continue;
          const sourceSlug = `${slug}-api`;
          const displayName = slug.charAt(0).toUpperCase() + slug.slice(1);
          await client.query(
            `INSERT INTO sources (slug, name, source_type, datapoint_provider_id)
             VALUES ($1, $2, 'api_provider', $3)
             ON CONFLICT (slug) DO UPDATE SET datapoint_provider_id = EXCLUDED.datapoint_provider_id`,
            [sourceSlug, `${displayName} API`, providerId],
          );
        }

        // Fetch source IDs for provenance tracking
        const { rows: sourceRows } = await client.query(
          "SELECT id, slug FROM sources WHERE source_type = 'api_provider'",
        );
        const sourceMap = new Map(sourceRows.map((r) => [r.slug, r.id]));

        const allNew = [
          ...newOr,
          ...newCb,
          ...newNv,
          ...newGoogle,
          ...newDs,
          ...newGroq,
          ...newOc,
          ...newDi,
          ...newCf,
          ...newNvt,
          ...newGh,
          ...newSf,
          ...newXai,
          ...newZhipu,
        ];

        for (const m of allNew) {
          const providerSlug = m.id.split('/')[0];
          const providerId = providerMap.get(providerSlug);
          if (!providerId) {
            logger.info(`  SKIP ${m.id}: unknown provider "${providerSlug}"`);
            continue;
          }

          const modelInstanceKey = m.id.includes('/') ? m.id.slice(m.id.indexOf('/') + 1) : m.id;
          const superSlug = normalizeModelSlug(m.name);

          // Extract creator from model ID when it contains org prefix (e.g., "org/modelName")
          const creator = modelInstanceKey.includes('/') ? humanizeCreator(modelInstanceKey.split('/')[0]) : null;

          // Upsert super model
          const { rows: mmRows } = await client.query(
            `INSERT INTO super_models (name, slug, creator) VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, creator = COALESCE(super_models.creator, EXCLUDED.creator)
             RETURNING id`,
            [m.name, superSlug, creator],
          );
          const superId = mmRows[0].id;

          // Upsert datapoint model
          const limitations = m.limitations || PROVIDER_LIMITATIONS[providerSlug] || null;
          const { rows: dmRows } = await client.query(
            `INSERT INTO datapoint_models (super_model_id, datapoint_provider_id, model_instance_key, full_id, context_length, is_free, status_result, status_detail, limitations)
             VALUES ($1, $2, $3, $4, $5, true, 'untested', 'Auto-discovered by sync script', $6)
             ON CONFLICT (datapoint_provider_id, model_instance_key) DO UPDATE SET
               context_length = EXCLUDED.context_length,
               limitations = EXCLUDED.limitations,
               is_removed = false,
               updated_at = now()
             RETURNING id`,
            [superId, providerId, modelInstanceKey, m.id, m.context_length, limitations ? JSON.stringify(limitations) : null],
          );
          const dmId = dmRows[0].id;

          // Record provenance
          const sourceSlug = `${providerSlug}-api`;
          const srcId = sourceMap.get(sourceSlug);
          if (srcId) {
            await client.query(
              `INSERT INTO datapoint_model_sources (datapoint_model_id, source_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [dmId, srcId],
            );
          }
        }

        // Refresh limitations for all existing models from synced providers
        const syncedProviderSlugs = new Set(allNew.map((m) => m.id.split('/')[0]));
        for (const slug of syncedProviderSlugs) {
          const limits = PROVIDER_LIMITATIONS[slug];
          if (!limits) continue;
          const providerId = providerMap.get(slug);
          if (!providerId) continue;
          await client.query(
            `UPDATE datapoint_models
             SET limitations = $1, updated_at = now()
             WHERE datapoint_provider_id = $2
               AND is_free = true
               AND is_removed = false
               AND (limitations IS NULL OR limitations::text <> $3::text)`,
            [JSON.stringify(limits), providerId, JSON.stringify(limits)],
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

        // Fetch external community sources
        logger.info('\n[External Sources] Fetching community model lists...');
        const externalScript = path.join(__dirname, 'fetch-external-sources.js');
        const externalProcess = spawn('node', [externalScript, '--apply']);
        externalProcess.stdout.on('data', (d) => logger.info(d.toString().trim()));
        externalProcess.stderr.on('data', (d) => console.error(d.toString().trim()));
        const externalCode = await new Promise((resolve) => externalProcess.on('close', resolve));
        logger.info(
          externalCode === 0
            ? '  External sources updated'
            : `  External sources fetch failed with code ${externalCode}`,
        );

        // Import missing models from external sources into datapoint_models
        logger.info('\n[Import] Cross-referencing external models against DB...');
        const importScript = path.join(__dirname, 'import-external-models.js');
        const importProcess = spawn('node', [importScript, '--apply']);
        importProcess.stdout.on('data', (d) => logger.info(d.toString().trim()));
        importProcess.stderr.on('data', (d) => console.error(d.toString().trim()));
        const importCode = await new Promise((resolve) => importProcess.on('close', resolve));
        logger.info(
          importCode === 0
            ? '  External model import completed'
            : `  External model import failed with code ${importCode}`,
        );

        // Backfill provenance for existing models
        logger.info('\n[Provenance] Backfilling provenance links for existing models...');
        const backfillResult = await client.query(`
          INSERT INTO datapoint_model_sources (datapoint_model_id, source_id)
          SELECT dm.id, s.id
          FROM datapoint_models dm
          JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
          JOIN sources s ON s.datapoint_provider_id = dp.id
          WHERE s.source_type = 'api_provider'
            AND dm.is_removed = false
            AND NOT EXISTS (
              SELECT 1 FROM datapoint_model_sources dms
              WHERE dms.datapoint_model_id = dm.id AND dms.source_id = s.id
            )
          ON CONFLICT DO NOTHING
        `);
        logger.info(`  Backfilled ${backfillResult.rowCount} provenance links`);
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

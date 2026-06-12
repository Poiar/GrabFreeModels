/**
 * config.js — Shared configuration constants.
 *
 * Extracts hardcoded values from scripts into a single configurable module.
 * Values can be overridden via environment variables where noted.
 */

const path = require('path');

// ── Auth file resolution ──
function resolveAuthFile() {
  if (process.env.GFM_AUTH_FILE) return process.env.GFM_AUTH_FILE;
  const xdgData =
    process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || '.', '.local', 'share');
  return path.join(xdgData, 'opencode', 'auth.json');
}

function resolveConfigFile() {
  if (process.env.GFM_CONFIG_FILE) return process.env.GFM_CONFIG_FILE;
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.config',
    'opencode',
    'opencode.jsonc',
  );
}

// ── Pipeline timing ──
const BURN_IN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — models with failures within this window are excluded
const TEST_AGAIN_AFTER_DAYS = 7; // re-test models after this many days
const HEALTH_THRESHOLD = 70; // percentage — below this triggers health alerts

// ── Validation ──
const KEY_CHECK_MAX_FAILURES = 3; // abort validation if N+ providers have dead keys

// ── Known provider limitations (free tier) ──
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
    notes: 'Free tier via GitHub Models. Requires GitHub account.',
  },
  cloudflare: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Cloudflare Workers AI. Limited daily requests.',
  },
  mistral: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Mistral API. Rate limited.',
  },
  together: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Together API. Limited free credits.',
  },
  fireworks: {
    rate_limit: 'Varies by model',
    notes: 'Free tier via Fireworks. Limited free credits.',
  },
};

// ── Known patterns for models that DON'T support tools ──
const TOOLS_FALSE_PATTERNS = [
  /chat.*small/i,
  /tiny/i,
  /nano/i,
  /embed/i,
  /rerank/i,
  /classif/i,
  /whisper/i,
  /tts/i,
  /speech/i,
  /vision(?!.*tool)/i,
];

// ── Name overrides for score propagation (free → paid name matching) ──
const NAME_OVERRIDES = {
  'llama-3.1-405b-instruct': 'llama-3.1-405b',
  'llama-3.1-70b-instruct': 'llama-3.1-70b',
  'llama-3.1-8b-instruct': 'llama-3.1-8b',
  'mixtral-8x22b-instruct': 'mixtral-8x22b',
  'mixtral-8x7b-instruct': 'mixtral-8x7b',
  'mistral-7b-instruct': 'mistral-7b',
  'gemma-2-27b-it': 'gemma-2-27b',
  'gemma-2-9b-it': 'gemma-2-9b',
  'qwen2.5-72b-instruct': 'qwen2.5-72b',
  'qwen2.5-32b-instruct': 'qwen2.5-32b',
  'qwen2.5-14b-instruct': 'qwen2.5-14b',
  'qwen2.5-7b-instruct': 'qwen2.5-7b',
  'deepseek-r1-distill-llama-70b': 'deepseek-r1-distill-llama-70b',
  'deepseek-r1-distill-qwen-32b': 'deepseek-r1-distill-qwen-32b',
  'deepseek-r1-distill-qwen-14b': 'deepseek-r1-distill-qwen-14b',
  'deepseek-r1': 'deepseek-r1',
  'deepseek-v3': 'deepseek-v3',
  'deepseek-chat': 'deepseek-v3',
  'phi-3-mini-4k-instruct': 'phi-3-mini',
  'phi-3-medium-4k-instruct': 'phi-3-medium',
  'phi-3.5-mini-instruct': 'phi-3.5-mini',
  'command-r-plus': 'command-r-plus',
  'command-r': 'command-r',
  'claude-3.5-sonnet': 'claude-3.5-sonnet',
  'claude-3-opus': 'claude-3-opus',
  'claude-3-haiku': 'claude-3-haiku',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
  'gemini-2.0-flash': 'gemini-2.0-flash',
};

module.exports = {
  resolveAuthFile,
  resolveConfigFile,
  BURN_IN_MS,
  TEST_AGAIN_AFTER_DAYS,
  HEALTH_THRESHOLD,
  KEY_CHECK_MAX_FAILURES,
  PROVIDER_LIMITATIONS,
  TOOLS_FALSE_PATTERNS,
  NAME_OVERRIDES,
};

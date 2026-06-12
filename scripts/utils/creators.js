/**
 * creators.js — Model name ↔ creator normalization utilities.
 *
 * Consolidates normalizeModelSlug(), inferCreatorFromName(),
 * humanizeCreator(), and slugifyCreator() from sync-models.js,
 * sync-paid-models.js, and build-models-data.js into one module.
 */

// Known creator slug → display name map
const CREATOR_WHITELIST = new Map([
  ['meta', 'Meta'],
  ['microsoft', 'Microsoft'],
  ['google', 'Google'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['mistralai', 'Mistral AI'],
  ['alibaba', 'Alibaba'],
  ['baidu', 'Baidu'],
  ['bytedance', 'ByteDance'],
  ['deepseek', 'DeepSeek'],
  ['nvidia', 'NVIDIA'],
  ['cerebras', 'Cerebras'],
  ['groq', 'Groq'],
  ['together', 'Together'],
  ['fireworks', 'Fireworks'],
  ['cloudflare', 'Cloudflare'],
  ['cohere', 'Cohere'],
  ['qwen', 'Qwen'],
  ['01-ai', '01.AI'],
  ['zhipu-ai', 'Zhipu AI'],
  ['minimax', 'MiniMax'],
  ['moonshot', 'Moonshot AI'],
  ['stepfun', 'StepFun'],
  ['deepseek-ai', 'DeepSeek AI'],
  ['internlm', 'InternLM'],
  ['abacusai', 'Abacus AI'],
  ['teknium', 'Teknium'],
  ['openbmb', 'OpenBMB'],
  ['salesforce', 'Salesforce'],
  ['sao10k', 'Sao10K'],
  ['kwaipilot', 'Kwaipilot'],
]);

/**
 * Convert a raw creator name into a human-readable display name.
 * Uses the whitelist for known orgs, then applies heuristics.
 */
function humanizeCreator(raw) {
  if (CREATOR_WHITELIST.has(raw)) return CREATOR_WHITELIST.get(raw);

  if (/[-_]/.test(raw)) {
    return raw
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // camelCase boundaries
  if (/[A-Z]/.test(raw) && /[a-z]/.test(raw)) {
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Create a URL-safe slug from a creator name.
 */
function slugifyCreator(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Normalize a model name to a consistent slug.
 * Strips common prefixes/suffixes, lowercases, removes special chars.
 */
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

/**
 * Heuristically infer the creator organization from a model name.
 * Returns a human-readable creator name or null.
 */
function inferCreatorFromName(name) {
  if (!name) return null;

  // org/name pattern
  const slashIdx = name.indexOf('/');
  if (slashIdx > 0 && slashIdx < name.length - 1) {
    return humanizeCreator(name.slice(0, slashIdx).trim());
  }

  const slug = normalizeModelSlug(name);

  // Exact slug matches for models with known (often router-based) origins
  const bySlug = {
    'owl-alpha': 'OpenRouter',
    bodybuilder: 'OpenRouter',
    'pareto-code': 'OpenRouter',
    spotlight: 'OpenRouter',
    'coder-large': 'Arcee AI',
    'virtuoso-large': 'Arcee AI',
    'auto-route': 'LLMGateway',
    'custom-model': 'LLMGateway',
    'ai-infer-test-1': 'NovitaAI',
    'ai-infer-test-2': 'NovitaAI',
    'ai-infer-test-3': 'NovitaAI',
    'maestro-reasoning': 'Aion Labs',
    elephant: 'Unidentifyable',
    'gt-4p': 'Unidentifyable',
  };
  if (bySlug[slug]) return bySlug[slug];

  // Prefix matches for known model families
  const byPrefix = {
    qwq: 'Alibaba',
    tongyi: 'Alibaba',
    qianfan: 'Baidu',
    sonar: 'Perplexity',
    sqlcoder: 'Defog',
    allam: 'SDAIA',
    'ui-tars': 'ByteDance',
    intellect: 'Prime Intellect',
    bunny: 'BAAI',
  };
  for (const [prefix, creator] of Object.entries(byPrefix)) {
    if (slug === prefix || slug.startsWith(prefix + '-')) return creator;
  }

  return null;
}

module.exports = {
  humanizeCreator,
  slugifyCreator,
  normalizeModelSlug,
  inferCreatorFromName,
  CREATOR_WHITELIST,
};

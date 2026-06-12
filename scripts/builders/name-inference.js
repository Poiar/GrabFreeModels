/**
 * name-inference.js — Creator name inference and slugification.
 *
 * Extracted from build-models-data.js. Uses canonical-creators.json
 * for known mappings and runs prefix-based fallback for unknown names.
 */

const REG = require('../../data/canonical-creators.json');

// Routers are not model creators — names that resolve to a router provider
// should never be used as creator. See db/migrations/022.
const ROUTER_CREATOR_BLACKLIST = new Set([
  'openrouter', 'llmgateway', 'opencode', 'huggingface', 'vercel',
  'OpenRouter', 'LLM Gateway', 'LLMGateway', 'OpenCode Zen', 'OpenCode',
  'Hugging Face', 'HuggingFace', 'Vercel AI Gateway', 'Vercel',
  'cloudflare-ai-gateway', 'Cloudflare AI Gateway',
]);

const CREATOR_BY_SLUG = new Map(Object.entries(REG.creatorBySlug));
const CREATOR_BY_PREFIX = REG.creatorByPrefix;

/**
 * Fallback: infer creator from model name when super_models.creator is NULL.
 * Tries slash-prefix, colon-prefix, then slug/prefix match against registry.
 */
function inferCreatorFromName(name) {
  if (!name) return null;
  const slashIdx = name.indexOf('/');
  if (slashIdx > 0 && slashIdx < name.length - 1) {
    const prefix = name.slice(0, slashIdx).trim();
    if (!ROUTER_CREATOR_BLACKLIST.has(prefix)) return prefix;
  }
  const colonIdx = name.indexOf(':');
  if (colonIdx > 0 && colonIdx < name.length - 1) {
    const prefix = name.slice(0, colonIdx).trim();
    if (!ROUTER_CREATOR_BLACKLIST.has(prefix)) return prefix;
  }
  // Check exact + prefix matches against slugified name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (CREATOR_BY_SLUG.has(slug)) return CREATOR_BY_SLUG.get(slug);
  for (const [prefix, creator] of CREATOR_BY_PREFIX) {
    if (slug === prefix || slug.startsWith(prefix + '-')) {
      return creator;
    }
  }
  console.warn(`name-inference: could not infer creator from name "${name}" (slug: "${slug}") — add to CREATOR_BY_PREFIX or CREATOR_BY_SLUG`);
  return null;
}

// ── Known user creators (individuals / personal accounts) ──
const KNOWN_USER_CREATOR_IDS = new Set(REG.knownUserCreatorIds);
const OTHER_CREATOR_IDS = new Set(REG.otherCreatorIds);

/** Classify creator type from provider distribution. */
function classifyCreatorType(creatorId, providerSlugs) {
  if (OTHER_CREATOR_IDS.has(creatorId)) return 'other';
  if (KNOWN_USER_CREATOR_IDS.has(creatorId)) return 'user';
  if (providerSlugs.size === 1 && providerSlugs.has('huggingface')) return 'user';
  return 'lab';
}

/** Derive creator role: "Fine-tuner" if majority of models are derivatives. */
function deriveCreatorRole(models) {
  let derivativeCount = 0;
  for (const model of models) {
    if (model.derivation_method || model.base_model) derivativeCount++;
  }
  if (derivativeCount > 0 && derivativeCount >= models.length * 0.5) return 'Fine-tuner';
  return 'Model creator';
}

const LEGAL_SUFFIX_RE = /\s*\b(llc|inc\.?|ltd\.?|corp\.?|pbc|co\.?|group|holdings)\b\.?$/gi;

/** Normalize a raw creator name for lookup. */
function normalizeCreatorName(raw) {
  return raw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const AUTHOR_OVERRIDES = REG.authorOverrides;
const DERIVATION_BY_SLUG = new Map(Object.entries(REG.derivationBySlug));

/**
 * Slugify a creator name → { id, name, _canonical }.
 * Checks AUTHOR_OVERRIDES for canonical names; falls back to slugification.
 */
function slugifyCreator(raw) {
  if (!raw) {
    console.warn('name-inference: null/undefined creator — mapping to "unknown"');
    return { id: 'unknown', name: 'Unknown', _canonical: true };
  }
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  const normalized = normalizeCreatorName(trimmed);
  const override = AUTHOR_OVERRIDES[lowered] || AUTHOR_OVERRIDES[normalized];
  if (override) return { ...override, _canonical: true };
  const cleaned = lowered.replace(LEGAL_SUFFIX_RE, '').trim();
  const slug = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || slug === 'unknown') {
    console.warn(`name-inference: creator "${trimmed}" mapped to "unknown" — add to AUTHOR_OVERRIDES or CREATOR_BY_PREFIX`);
  }
  return { id: slug || 'unknown', name: trimmed, _canonical: false };
}

module.exports = {
  inferCreatorFromName,
  classifyCreatorType,
  deriveCreatorRole,
  slugifyCreator,
  normalizeCreatorName,
  DERIVATION_BY_SLUG,
  AUTHOR_OVERRIDES,
};

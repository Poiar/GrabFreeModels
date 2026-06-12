/**
 * build-providers.js — Builds the providers array from flat outputModels.
 *
 * Aggregates provider-level stats (model count, working count, health status).
 * Description and base_url are read from the DB (migration 043).
 * JSON files are fallback only.
 */

const PROVIDER_DESCRIPTIONS = require('../../data/provider-descriptions.json');
const PROVIDER_BASE_URLS = require('../../data/provider-base-urls.json');

/**
 * @param {Array} outputModels — flat array of per-provider model entries
 * @returns {Array} providers array (sorted by name)
 */
function buildProviders(outputModels) {
  const providerRefMap = new Map();

  for (const dp of outputModels) {
    if (dp._removed) continue;
    if (!providerRefMap.has(dp.source)) {
      providerRefMap.set(dp.source, {
        id: dp.source,
        slug: dp.source,
        name: dp.provider,
        npm_package: dp.npm_package || null,
        base_url: dp.base_url || null,
        provider_type: dp.provider_type || null,
        serves_third_party: dp.serves_third_party,
        hardware: dp.hardware || null,
        is_openai_compat: dp.is_openai_compat,
        supports_streaming: dp.supports_streaming,
        requires_account_id: dp.requires_account_id,
        max_rpm: dp.max_rpm,
        max_tpm: dp.max_tpm,
        max_daily_requests: dp.max_daily_requests,
        requires_card: dp.requires_card,
        description: dp.provider_description || null, // from DB (migration 043)
        model_count: 0,
        working_count: 0,
      });
    }
    const ref = providerRefMap.get(dp.source);
    ref.model_count++;
    if (dp.status.result === 'working') ref.working_count++;
  }

  return Array.from(providerRefMap.values())
    .map((ref) => ({
      ...ref,
      base_url: ref.base_url || PROVIDER_BASE_URLS[ref.slug] || '',
      description: ref.description || PROVIDER_DESCRIPTIONS[ref.slug] || null,
      health_status:
        ref.working_count === ref.model_count && ref.model_count > 0
          ? 'healthy'
          : ref.working_count > 0
            ? 'degraded'
            : 'down',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = buildProviders;

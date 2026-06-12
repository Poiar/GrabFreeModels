/**
 * build-providers.js — Builds the providers array from flat outputModels.
 *
 * Aggregates provider-level stats (model count, working count, health status).
 * Health is derived from FREE models only — paid models are presumed working
 * (normalized by builders/index.js) and would dilute the free-model health signal.
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
        // Free-only counts for accurate health — paid models normalized to
        // 'working' by builders/index.js and always pass, so they'd dilute
        // the broken/degraded signal from free models.
        free_count: 0,
        free_working: 0,
      });
    }
    const ref = providerRefMap.get(dp.source);
    ref.model_count++;
    // Paid models normalized to status.result='working' by builders/index.js
    if (dp.status.result === 'working') ref.working_count++;
    // Free-only health tracking
    if (dp.is_free) {
      ref.free_count++;
      if (dp.status.result === 'working') ref.free_working++;
    }
  }

  return Array.from(providerRefMap.values())
    .map((ref) => {
      // Health derived from free models only — paid models normalized to
      // 'working' by builders/index.js and would dilute the signal.
      const health =
        ref.free_count === 0
          ? 'healthy'
          : ref.free_working === ref.free_count
            ? 'healthy'
            : ref.free_working > 0
              ? 'degraded'
              : 'broken';

      return {
        id: ref.id,
        slug: ref.slug,
        name: ref.name,
        npm_package: ref.npm_package,
        base_url: ref.base_url || PROVIDER_BASE_URLS[ref.slug] || '',
        provider_type: ref.provider_type,
        serves_third_party: ref.serves_third_party,
        hardware: ref.hardware,
        is_openai_compat: ref.is_openai_compat,
        supports_streaming: ref.supports_streaming,
        requires_account_id: ref.requires_account_id,
        max_rpm: ref.max_rpm,
        max_tpm: ref.max_tpm,
        max_daily_requests: ref.max_daily_requests,
        requires_card: ref.requires_card,
        description: ref.description || PROVIDER_DESCRIPTIONS[ref.slug] || null,
        model_count: ref.model_count,
        working_count: ref.working_count,
        health_status: health,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = buildProviders;

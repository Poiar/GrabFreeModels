/**
 * build-organizations.js — Unified Organization builder that merges creator + provider data.
 *
 * Takes the output of buildCreators() and buildProviders(), deduplicates entities
 * that appear in both, and returns a single organizations array.
 *
 * Each Organization has:
 *   - kind: 'creator' | 'provider' | 'both'
 *   - Creator facet: models[], creator_type, creator_role, model_count
 *   - Provider facet: base_url, npm_package, hardware, health_status, etc.
 *   - Shared: id, name, description
 */

const ORGANIZATION_DESCRIPTIONS = require('../../data/organization-descriptions.json');

/**
 * @param {Array} creators — output of buildCreators()
 * @param {Array} providers — output of buildProviders()
 * @returns {{ organizations: Array, creators: Array, providers: Array }}
 *   organizations is the new unified array.
 *   creators and providers are kept for backward compatibility.
 */
function buildOrganizations(creators, providers) {
  const creatorMap = new Map();
  for (const c of creators) {
    creatorMap.set(c.id, c);
  }

  const providerMap = new Map();
  for (const p of providers) {
    providerMap.set(p.slug, p);
  }

  // Union all keys
  const allIds = new Set([...creatorMap.keys(), ...providerMap.keys()]);

  const organizations = [];

  for (const id of allIds) {
    const creator = creatorMap.get(id);
    const provider = providerMap.get(id);

    // Determine kind
    let kind;
    if (creator && provider) kind = 'both';
    else if (creator) kind = 'creator';
    else kind = 'provider';

    // ── Name ──
    // Prefer creator name (often more canonical), fall back to provider name
    const name = creator?.name || provider?.name || id;

    // ── Description ──
    // Check merged JSON first, then fall back to individual descriptions
    const orgDesc = ORGANIZATION_DESCRIPTIONS[id];
    let description;
    if (orgDesc?.as_creator) {
      description = orgDesc.as_creator;
    } else if (creator?.description) {
      description = creator.description;
    } else if (provider?.description) {
      description = provider.description;
    } else {
      description = null;
    }

    // ── Provider description (API-specific, for provider facet) ──
    const providerDescription = orgDesc?.as_provider || provider?.description || null;

    // ── Provider slugs this org maps to ──
    const providerSlugs = [];
    if (provider) providerSlugs.push(provider.slug);
    // Also include any provider slugs found in the creator's model providers
    if (creator?.models) {
      for (const model of creator.models) {
        for (const dp of model.providers || []) {
          const ps = dp.provider_slug;
          if (ps && !providerSlugs.includes(ps)) {
            providerSlugs.push(ps);
          }
        }
      }
    }

    // ── Health status ──
    let healthStatus = null;
    let workingCount = 0;
    if (provider) {
      healthStatus = provider.health_status;
      workingCount = provider.working_count;
    } else if (creator) {
      // Derive health from models for creator-only orgs
      let total = 0;
      let working = 0;
      for (const model of creator.models) {
        for (const dp of model.providers || []) {
          if (dp._removed) continue;
          total++;
          if (dp.status?.result === 'working') working++;
        }
      }
      workingCount = working;
      healthStatus =
        total === 0 ? null : working === total ? 'healthy' : working > 0 ? 'degraded' : 'down';
    }

    const org = {
      id,
      name,
      kind,

      // ── Shared ──
      description,
      provider_description: providerDescription !== description ? providerDescription : null,
      provider_slugs: providerSlugs,

      // ── Creator facet ──
      creator_type: creator?.type || null,
      creator_role: creator?.role || null,
      models: creator?.models || [],
      model_count: creator?.model_count || 0,
      provider_count: creator?.provider_count || 0,

      // ── Provider facet ──
      base_url: provider?.base_url || null,
      npm_package: provider?.npm_package || null,
      provider_type: provider?.provider_type || null,
      serves_third_party: provider?.serves_third_party ?? null,
      hardware: provider?.hardware || null,
      is_openai_compat: provider?.is_openai_compat ?? null,
      supports_streaming: provider?.supports_streaming ?? null,
      requires_account_id: provider?.requires_account_id ?? null,
      max_rpm: provider?.max_rpm ?? null,
      max_tpm: provider?.max_tpm ?? null,
      max_daily_requests: provider?.max_daily_requests ?? null,
      requires_card: provider?.requires_card ?? null,
      health_status: healthStatus,
      working_count: workingCount,
    };

    organizations.push(org);
  }

  // Sort: "both" first, then by name
  organizations.sort((a, b) => {
    const kindOrder = { both: 0, creator: 1, provider: 2 };
    const ka = kindOrder[a.kind] ?? 3;
    const kb = kindOrder[b.kind] ?? 3;
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });

  return { organizations, creators, providers };
}

module.exports = buildOrganizations;

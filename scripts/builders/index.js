/**
 * build-models-data — Orchestrator for assembling the full ModelsData object.
 *
 * Delegates to individual builder modules for each concern:
 *   1. loadMetadata     — reads metadata key-value table
 *   2. loadModels       — reads datapoint_models + joins
 *   3. loadFeatures     — reads features, I/O types, feature_types lookup
 *   4. computePriority  — computes per-model priority scores
 *   5. loadScores       — reads model benchmark scores
 *   6. loadRankings     — reads rankings table, builds _role_rankings shape
 *   7. loadHealth       — derives model health from test_observations
 *   8. buildCreators      — builds creator → model → provider hierarchy
 *   9. buildProviders     — builds provider reference list
 *  10. buildOrganizations — merges creator + provider into unified orgs
 *  11. buildFailover      — builds failover suggestions
 *
 * Usage:
 *   const buildModelsData = require('./builders');
 *   const data = await buildModelsData(client, pool, options);
 */

const loadMetadata = require('./load-metadata');
const loadModelsData = require('./load-models');
const loadFeatures = require('./load-features');
const loadScores = require('./load-scores');
const loadRankings = require('./load-rankings');
const loadHealth = require('./load-health');
const buildCreators = require('./build-creators');
const buildProviders = require('./build-providers');
const buildOrganizations = require('./build-organizations');
const buildFailover = require('./build-failover');
const { computePriorityScores } = require('./compute-priority');
const { inferCreatorFromName } = require('./name-inference');

async function buildModelsData(client, pool, options = {}) {
  const { isFree = true } = options;

  // ── 1. Metadata ──
  const meta = await loadMetadata(client);

  // ── 2. Models ──
  const { dmRows, dmIds, sourceIdsByDm } = await loadModelsData(client, { isFree });

  // ── 3. Features ──
  const { inputMap, outputMap, featMap } = await loadFeatures(client, pool, dmIds);

  // ── 4. Build flat output entries + compute priority ──
  const { DERIVATION_BY_SLUG } = require('./name-inference');

  const autoTagCache = new Map(); // provider_slug → auto tags

  function getAutoTags(providerSlug, providerType, hardware, servesThirdParty, isOpenAiCompat) {
    if (autoTagCache.has(providerSlug)) return autoTagCache.get(providerSlug);
    const tags = [];
    if (hardware === 'lpu') tags.push('speed');
    if (hardware === 'wafer') tags.push('throughput');
    if (hardware === 'tpu') tags.push('multimodal');
    if (hardware === 'edge') tags.push('low-latency');
    if (providerType === 'router') tags.push('multi-provider');
    if (providerType === 'inference' && servesThirdParty === false) tags.push('authoritative');
    if (isOpenAiCompat === false) tags.push('specialized');
    autoTagCache.set(providerSlug, tags);
    return tags;
  }

  const outputModels = [];
  const workingIds = [];
  const rateLimitedIds = [];
  const brokenIds = [];
  const untestedIds = [];

  for (const dm of dmRows) {
    const feat = featMap.get(dm.id);
    const autoTags = getAutoTags(
      dm.provider_slug,
      dm.provider_type,
      dm.hardware,
      dm.serves_third_party,
      dm.is_openai_compat,
    );

    const entry = {
      id: dm.full_id,
      super_id: dm.super_model_id,
      super_name: dm.super_name,
      // Canonical DB slug — used by build-creators for base_model lookups
      super_slug: dm.super_slug,
      name: dm.super_name,
      provider: dm.provider_name,
      provider_description: dm.provider_description || null,
      creator: dm.super_creator || inferCreatorFromName(dm.super_name) || null,
      base_creator: dm.super_base_creator || null,
      context_length: dm.context_length ?? null,
      quantization: dm.quantization || null,
      is_free: dm.is_free,
      supports_tools: dm.supports_tools,
      limitations: dm.limitations || null,
      supports_reasoning:
        feat?.supports_reasoning?.[0] === undefined ? null : feat.supports_reasoning[0] === 'true',
      supports_attachment:
        feat?.supports_attachment?.[0] === undefined
          ? null
          : feat.supports_attachment[0] === 'true',
      supports_structured_output:
        feat?.supports_structured_output?.[0] === undefined
          ? null
          : feat.supports_structured_output[0] === 'true',
      output_limit: feat?.output_limit?.[0] ? parseInt(feat.output_limit[0], 10) : null,
      temperature: feat?.temperature?.[0] === undefined ? null : feat.temperature[0] === 'true',
      open_weights: feat?.open_weights?.[0] === undefined ? null : feat.open_weights[0] === 'true',
      family: dm.super_family || null,
      family_id: dm.super_family_id || null,
      base_model:
        dm.super_base_model || (DERIVATION_BY_SLUG.get(dm.super_slug) || {}).base_model || null,
      base_model_id: dm.super_base_model_id || null,
      derivation_method:
        dm.super_derivation_method ||
        (DERIVATION_BY_SLUG.get(dm.super_slug) || {}).derivation_method ||
        null,
      knowledge_cutoff: feat?.knowledge_cutoff?.[0] || dm.super_knowledge_cutoff || null,
      releaseDate: feat?.release_date?.[0] || dm.super_release_date || null,
      lastUpdated: feat?.last_updated?.[0] || null,
      description: feat?.description?.[0] || dm.super_description || null,
      tags: [...new Set([...(feat?.tag || []), ...autoTags])],
      best_for: [...new Set([...(feat?.best_for || []), ...autoTags])],
      input_types: inputMap.get(dm.id) || [],
      output_types: outputMap.get(dm.id) || [],
      model_tier: feat?.model_tier || [],
      model_variant: feat?.model_variant?.[0] || null,
      param_count_b: feat?.param_count_b?.[0] ? parseInt(feat.param_count_b[0], 10) : null,
      active_param_count_b: feat?.active_param_count_b?.[0]
        ? parseInt(feat.active_param_count_b[0], 10)
        : null,
      expert_count: feat?.expert_count?.[0] ? parseInt(feat.expert_count[0], 10) : null,
      thinking_variant: feat?.thinking_variant?.[0] === 'true' || false,
      model_version: feat?.model_version?.[0] || null,
      release_stage: feat?.release_stage?.[0] || null,
      coding_specialized: feat?.coding_specialized?.[0] === 'true' || false,
      // HARD RULE: paid models are ALWAYS presumed working (never tested).
      // This is the single source of truth — all downstream aggregation
      // (buildProviders, buildOrganizations, provider_health, frontend)
      // flows from this normalization.
      status: dm.is_free
        ? {
            tested: dm.status_tested || null,
            result: dm.status_result || 'untested',
            detail: dm.status_detail || null,
          }
        : {
            tested: null,
            result: 'working',
            detail: 'Presumed working (not tested)',
          },
      last_success: dm.last_success || null,
      deprecated_at: dm.deprecated_at || null,
      failure_category: dm.failure_category || null,
      base_url: dm.base_url || null,
      provider_type: dm.provider_type || null,
      serves_third_party: dm.serves_third_party,
      hardware: dm.hardware || null,
      is_openai_compat: dm.is_openai_compat,
      supports_streaming: dm.supports_streaming,
      requires_account_id: dm.requires_account_id,
      max_rpm: dm.max_rpm,
      max_tpm: dm.max_tpm,
      max_daily_requests: dm.max_daily_requests,
      requires_card: dm.requires_card,
      source: dm.provider_slug,
      npm_package: dm.npm_package || null,
      source_ids: sourceIdsByDm.get(dm.id) || [],
      _removed: dm.is_removed || false,
      _removedDate: null,
      notes: null,
      created_at: dm.created_at || null,
      priority_score: dm.priority_score || null,
    };

    outputModels.push(entry);
    const result = dm.status_result || 'untested';
    if (result === 'working') workingIds.push(dm.full_id);
    else if (result === 'rate_limited') rateLimitedIds.push(dm.full_id);
    else if (result === 'broken') brokenIds.push(dm.full_id);
    else untestedIds.push(dm.full_id);
  }

  // Compute priority scores for all entries
  computePriorityScores(outputModels);

  // ── 5. Model scores ──
  const { scoreMap } = await loadScores(client);

  // ── 6. Rankings ──
  const roleRankingsOutput = await loadRankings(client, isFree, meta);

  // ── 7. Creators hierarchy ──
  const creators = buildCreators(outputModels, roleRankingsOutput);

  // ── 8. Providers ──
  const providers = buildProviders(outputModels);

  // ── 8b. Organizations (unified creator + provider) ──
  const { organizations } = buildOrganizations(creators, providers);

  // ── 9. Failover ──
  const failoverSuggestions = buildFailover(outputModels);

  // ── 10. Health ──
  const { modelHealth, failureRates } = await loadHealth(client, isFree);

  // Populate failureRates.models with output model data
  // Re-populate from outputModels for the full list
  {
    const frModels = {};
    for (const m of outputModels) {
      if (failureRates.models[m.id]) {
        frModels[m.id] = failureRates.models[m.id];
      }
    }
    failureRates.models = frModels;
  }

  // ── Provider health ──
  const health = {};
  for (const m of outputModels) {
    if (m._removed) continue;
    if (!health[m.provider])
      health[m.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 };
    health[m.provider].total++;
    if (m.status.result === 'working') health[m.provider].working++;
    else if (m.status.result === 'rate_limited') health[m.provider].rate_limited++;
    else if (m.status.result === 'broken') health[m.provider].broken++;
  }

  // ── Family lineage coverage ──
  let familyCoverage = {
    total: 0,
    with_family: 0,
    without_family: 0,
    pct: 0,
    with_base_model_no_family: 0,
  };
  try {
    const { rows: fcRows } = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE family IS NOT NULL)::int AS with_family,
        COUNT(*) FILTER (WHERE family IS NULL)::int AS without_family,
        COUNT(*) FILTER (WHERE family IS NULL AND base_model IS NOT NULL)::int AS with_base_model_no_family
      FROM super_models sm
      WHERE EXISTS (
        SELECT 1 FROM datapoint_models dm
        WHERE dm.super_model_id = sm.id AND NOT dm.is_removed
      )
    `);
    if (fcRows.length > 0) {
      const r = fcRows[0];
      familyCoverage = {
        total: r.total,
        with_family: r.with_family,
        without_family: r.without_family,
        pct: r.total > 0 ? Math.round((r.with_family / r.total) * 100) : 0,
        with_base_model_no_family: r.with_base_model_no_family,
      };
    }
  } catch {
    /* family column may not exist yet */
  }

  return {
    /** @deprecated Use organizations instead */
    creators,
    /** @deprecated Use organizations instead */
    providers,
    organizations,
    models: outputModels.filter((m) => !m._removed),
    _test_summary: {
      date: new Date().toISOString().slice(0, 10),
      results: {
        working: workingIds,
        rate_limited: rateLimitedIds,
        broken: brokenIds,
        untested: untestedIds,
      },
    },
    _test_summary_previous: meta._test_summary_previous || null,
    _role_rankings: roleRankingsOutput,
    _model_scores: {
      description: 'External benchmark scores by source',
      sources: ['artificial_analysis', 'modelsdev'],
      scores: scoreMap,
    },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
    _failure_rates: failureRates,
    _failover_suggestions: failoverSuggestions,
    _key_health: meta._key_health || null,
    _model_health: modelHealth,
    _family_coverage: familyCoverage,
    provider_health: health,
  };
}

module.exports = buildModelsData;

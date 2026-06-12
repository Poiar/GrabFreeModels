/**
 * build-creators.js — Builds the creators array with model hierarchy and role rankings.
 *
 * Takes the flat outputModels array plus role rankings data, groups by creator,
 * then by super_model, and assembles the nested structure.
 */

const {
  slugifyCreator, classifyCreatorType, deriveCreatorRole,
} = require('./name-inference');

const CREATOR_DESCRIPTIONS = require('../../data/creator-descriptions.json');

/**
 * @param {Array} outputModels — flat array of per-provider model entries
 * @param {Object} roleRankingsOutput — the _role_rankings object
 * @returns {Array} creators array (sorted by name)
 */
function buildCreators(outputModels, roleRankingsOutput) {
  const creatorMap = new Map();

  for (const dp of outputModels) {
    if (dp._removed) continue;

    const creatorInfo = slugifyCreator(dp.creator);
    const creatorId = creatorInfo.id;

    if (!creatorMap.has(creatorId)) {
      creatorMap.set(creatorId, {
        id: creatorId,
        name: creatorInfo.name,
        _nameIsCanonical: creatorInfo._canonical || false,
        modelMap: new Map(),
      });
    }
    const creator = creatorMap.get(creatorId);

    // Prefer canonical (override) names; for non-override names, prefer longer variants
    if (creatorInfo._canonical) {
      creator.name = creatorInfo.name;
      creator._nameIsCanonical = true;
    } else if (!creator._nameIsCanonical && creatorInfo.name.length > creator.name.length) {
      creator.name = creatorInfo.name;
    }

    if (!creator.modelMap.has(dp.super_id)) {
      creator.modelMap.set(dp.super_id, {
        super_id: dp.super_id,
        name: dp.super_name,
        slug: (dp.super_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        creator: dp.creator || null,
        base_creator: dp.base_creator || null,
        family: dp.family,
        family_id: dp.family_id || null,
        base_model: dp.base_model,
        base_model_id: dp.base_model_id || null,
        derivation_method: dp.derivation_method || null,
        best_for: [...(dp.best_for || [])],
        best_context: dp.context_length || 0,
        min_context: dp.context_length || 0,
        role_rankings: {},
        providers: [],
      });
    }
    const model = creator.modelMap.get(dp.super_id);

    // Keep the best (longest) creator name across datapoints of the same model
    if (dp.creator && dp.creator.length > (model.creator || '').length) {
      model.creator = dp.creator;
    }
    if (dp.base_creator && (!model.base_creator || dp.base_creator.length > model.base_creator.length)) {
      model.base_creator = dp.base_creator;
    }
    if (dp.derivation_method && !model.derivation_method) {
      model.derivation_method = dp.derivation_method;
    }
    model.providers.push({
      full_id: dp.id,
      provider: dp.provider,
      provider_slug: dp.source,
      source_ids: dp.source_ids || [],
      context_length: dp.context_length,
      is_free: dp.is_free,
      supports_tools: dp.supports_tools,
      supports_reasoning: dp.supports_reasoning,
      supports_attachment: dp.supports_attachment,
      supports_structured_output: dp.supports_structured_output,
      output_limit: dp.output_limit,
      temperature: dp.temperature,
      open_weights: dp.open_weights,
      family: dp.family,
      family_id: dp.family_id,
      base_model: dp.base_model,
      base_model_id: dp.base_model_id,
      tags: dp.tags,
      best_for: dp.best_for,
      input_types: dp.input_types,
      output_types: dp.output_types,
      model_tier: dp.model_tier,
      model_variant: dp.model_variant,
      param_count_b: dp.param_count_b,
      active_param_count_b: dp.active_param_count_b,
      expert_count: dp.expert_count,
      thinking_variant: dp.thinking_variant,
      model_version: dp.model_version,
      release_stage: dp.release_stage,
      coding_specialized: dp.coding_specialized,
      description: dp.description,
      status: dp.status,
      last_success: dp.last_success,
      deprecated_at: dp.deprecated_at,
      failure_category: dp.failure_category || null,
      _removed: dp._removed,
      _removedDate: dp._removedDate,
      notes: dp.notes,
      priority_score: dp.priority_score,
      limitations: dp.limitations,
      knowledge_cutoff: dp.knowledge_cutoff || null,
      last_updated: dp.lastUpdated || null,
      release_date: dp.releaseDate || null,
      quantization: dp.quantization || null,
      hardware: dp.hardware || null,
      provider_type: dp.provider_type || null,
      serves_third_party: dp.serves_third_party,
      is_openai_compat: dp.is_openai_compat,
      supports_streaming: dp.supports_streaming,
      requires_account_id: dp.requires_account_id,
      max_rpm: dp.max_rpm,
      max_tpm: dp.max_tpm,
      max_daily_requests: dp.max_daily_requests,
      requires_card: dp.requires_card,
      base_url: dp.base_url || null,
      npm_package: dp.npm_package || null,
      created_at: dp.created_at || null,
    });

    // Update model-level aggregates
    if (dp.context_length && dp.context_length > model.best_context) {
      model.best_context = dp.context_length;
    }
    if (dp.context_length && (!model.min_context || dp.context_length < model.min_context)) {
      model.min_context = dp.context_length;
    }
    for (const tag of dp.best_for || []) {
      if (!model.best_for.includes(tag)) model.best_for.push(tag);
    }
  }

  return Array.from(creatorMap.values())
    .map((creator) => {
      const models = Array.from(creator.modelMap.values())
        .map((model) => ({
          super_id: model.super_id,
          name: model.name,
          slug: model.slug,
          creator: model.creator || null,
          base_creator: model.base_creator || null,
          family: model.family || null,
          family_id: model.family_id || null,
          base_model: model.base_model || null,
          base_model_id: model.base_model_id || null,
          derivation_method: model.derivation_method || null,
          best_for: model.best_for,
          best_context: model.best_context,
          min_context: model.min_context || null,
          role_rankings: {},
          providers: model.providers,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const providerSet = new Set();
      for (const model of models) {
        for (const p of model.providers) providerSet.add(p.provider_slug);
      }

      const rawModels = Array.from(creator.modelMap.values());

      return {
        id: creator.id,
        name: creator.name,
        type: classifyCreatorType(creator.id, providerSet),
        role: deriveCreatorRole(rawModels),
        description: CREATOR_DESCRIPTIONS[creator.id] || null,
        model_count: models.length,
        provider_count: providerSet.size,
        models,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = buildCreators;

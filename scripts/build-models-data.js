#!/usr/bin/env node
/**
 * build-models-data.js — shared core for building models data from PostgreSQL.
 *
 * Takes a connected pg client, returns the full ModelsData object
 * (same shape as GET /api/data).
 *
 * Usage:
 *   const buildModelsData = require('./build-models-data');
 *   const data = await buildModelsData(client);
 */

async function buildModelsData(client, pool, options = {}) {
  const { isFree = true } = options;

  const { rows: metadataRows } = await client.query(
    'SELECT key, value::text FROM metadata ORDER BY key',
  );
  const meta = {};
  for (const r of metadataRows) {
    try {
      meta[r.key] = JSON.parse(r.value);
    } catch {
      meta[r.key] = r.value;
    }
  }

  const { rows: dmRows } = await client.query(`
    SELECT dm.*, mm.name AS super_name, mm.slug AS super_slug, mm.creator AS super_creator,
           mm.base_creator AS super_base_creator,
           dp.name AS provider_name, dp.slug AS provider_slug
    FROM datapoint_models dm
    JOIN super_models mm ON mm.id = dm.super_model_id
    JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
    WHERE dm.is_free = $1 AND dm.is_removed = false
    ORDER BY mm.name, dp.name
  `, [isFree]);

  const dmIds = dmRows.map((r) => r.id);

  // Batch-fetch provenance (source_ids per datapoint_model)
  const sourceIdsByDm = new Map();
  if (dmIds.length > 0) {
    const { rows: provRows } = await client.query(`
      SELECT datapoint_model_id, source_id
      FROM datapoint_model_sources
      WHERE datapoint_model_id = ANY($1)
    `, [dmIds]);
    for (const r of provRows) {
      if (!sourceIdsByDm.has(r.datapoint_model_id)) sourceIdsByDm.set(r.datapoint_model_id, []);
      sourceIdsByDm.get(r.datapoint_model_id).push(r.source_id);
    }
  }
  const inputMap = new Map();
  const outputMap = new Map();
  const featMap = new Map();
  const knownFeatures = [
    'best_for',
    'tag',
    'supports_reasoning',
    'output_limit',
    'temperature',
    'open_weights',
    'family',
    'knowledge_cutoff',
    'release_date',
    'last_updated',
  ];

  if (dmIds.length > 0) {
    const useClient = pool || client;
    const combinedQuery = `SELECT datapoint_model_id, 'input' AS kind, input_type AS type_val, NULL AS feat_val FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1) UNION ALL SELECT datapoint_model_id, 'output' AS kind, output_type AS type_val, NULL AS feat_val FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1) UNION ALL SELECT datapoint_model_id, 'feature' AS kind, feature_type AS type_val, value AS feat_val FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)`;
    const { rows: combinedRows } = await useClient.query(combinedQuery, [dmIds]);

    for (const r of combinedRows) {
      if (r.kind === 'input') {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.type_val);
      } else if (r.kind === 'output') {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.type_val);
      } else if (r.kind === 'feature') {
        if (!featMap.has(r.datapoint_model_id)) {
          const obj = { tag: [], best_for: [] };
          for (const f of knownFeatures) obj[f] = [];
          featMap.set(r.datapoint_model_id, obj);
        }
        const bucket = knownFeatures.includes(r.type_val) ? r.type_val : 'tag';
        featMap.get(r.datapoint_model_id)[bucket].push(r.feat_val);
      }
    }
  }

  const CTX_NORM = 1048756;
  const outputModels = [];
  const workingIds = [];
  const rateLimitedIds = [];
  const brokenIds = [];
  const untestedIds = [];

  for (const dm of dmRows) {
    const feat = featMap.get(dm.id);
    const entry = {
      id: dm.full_id,
      super_id: dm.super_model_id,
      super_name: dm.super_name,
      name: dm.super_name,
      provider: dm.provider_name,
      creator: dm.super_creator || null,
      base_creator: dm.super_base_creator || null,
      context_length: dm.context_length ?? null,
      is_free: dm.is_free,
      supports_tools: dm.supports_tools,
      limitations: dm.limitations || null,
      supports_reasoning:
        feat?.supports_reasoning?.[0] === undefined ? null : feat.supports_reasoning[0] === 'true',
      output_limit: feat?.output_limit?.[0] ? parseInt(feat.output_limit[0], 10) : null,
      temperature: feat?.temperature?.[0] === undefined ? null : feat.temperature[0] === 'true',
      open_weights: feat?.open_weights?.[0] === undefined ? null : feat.open_weights[0] === 'true',
      family: feat?.family?.[0] || null,
      knowledge_cutoff: feat?.knowledge_cutoff?.[0] || null,
      releaseDate: feat?.release_date?.[0] || null,
      lastUpdated: feat?.last_updated?.[0] || null,
      tags: feat?.tag || [],
      best_for: feat?.best_for || [],
      input_types: inputMap.get(dm.id) || [],
      output_types: outputMap.get(dm.id) || [],
      status: {
        tested: dm.status_tested || null,
        result: dm.status_result || 'untested',
        detail: dm.status_detail || null,
      },
      last_success: dm.last_success || null,
      source: dm.provider_slug,
      source_ids: sourceIdsByDm.get(dm.id) || [],
      _removed: dm.is_removed || false,
      _removedDate: null,
      notes: null,
    };

    const ctx_val = entry.context_length ? entry.context_length / CTX_NORM : -0.5;
    const toolsBonus = entry.supports_tools === true ? 2 : 0;
    const codingTags = (entry.best_for || []).some((t) =>
      /\b(cod|programm|agentic|reasoning|tool use|function calling|refactor)\b/i.test(t),
    )
      ? 1.5
      : 0;
    entry.priority_score = Math.round((ctx_val * 1.0 + toolsBonus + codingTags) * 100) / 100;

    outputModels.push(entry);
    const result = dm.status_result || 'untested';
    if (result === 'working') workingIds.push(dm.full_id);
    else if (result === 'rate_limited') rateLimitedIds.push(dm.full_id);
    else if (result === 'broken') brokenIds.push(dm.full_id);
    else untestedIds.push(dm.full_id);
  }

  // ── Hierarchy building: creators → models → providers ──

  const AUTHOR_OVERRIDES = {
    'google llc': { id: 'google', name: 'Google' },
    google: { id: 'google', name: 'Google' },
    'meta platforms, inc.': { id: 'meta', name: 'Meta' },
    'meta platforms inc.': { id: 'meta', name: 'Meta' },
    meta: { id: 'meta', name: 'Meta' },
    anthropic: { id: 'anthropic', name: 'Anthropic' },
    'anthropic, pbc': { id: 'anthropic', name: 'Anthropic' },
    openai: { id: 'openai', name: 'OpenAI' },
    'openai, llc.': { id: 'openai', name: 'OpenAI' },
    'mistral ai': { id: 'mistral', name: 'Mistral' },
    'mistral ai, pbc': { id: 'mistral', name: 'Mistral' },
    deepseek: { id: 'deepseek', name: 'DeepSeek' },
    'alibaba group': { id: 'alibaba', name: 'Alibaba' },
    'alibaba cloud': { id: 'alibaba', name: 'Alibaba' },
    nvidia: { id: 'nvidia', name: 'NVIDIA' },
    'nvidia corporation': { id: 'nvidia', name: 'NVIDIA' },
    cohere: { id: 'cohere', name: 'Cohere' },
    'cohere inc.': { id: 'cohere', name: 'Cohere' },
    microsoft: { id: 'microsoft', name: 'Microsoft' },
    'microsoft corporation': { id: 'microsoft', name: 'Microsoft' },
    xai: { id: 'xai', name: 'xAI' },
    'xai corp': { id: 'xai', name: 'xAI' },
    'zhipu ai': { id: 'zhipu', name: 'Zhipu AI' },
    '01-ai': { id: '01-ai', name: '01.AI' },
    minimax: { id: 'minimax', name: 'MiniMax' },
    'minimax group': { id: 'minimax', name: 'MiniMax' },
    'moonshot ai': { id: 'moonshot', name: 'Moonshot AI' },
    stepfun: { id: 'stepfun', name: 'StepFun' },
    bytedance: { id: 'bytedance', name: 'ByteDance' },
    tencent: { id: 'tencent', name: 'Tencent' },
    'tencent cloud': { id: 'tencent', name: 'Tencent' },
    baidu: { id: 'baidu', name: 'Baidu' },
    'inflection ai': { id: 'inflection', name: 'Inflection' },
    'stability ai': { id: 'stability', name: 'Stability AI' },
    eleutherai: { id: 'eleutherai', name: 'EleutherAI' },
    qwq: { id: 'qwen', name: 'Qwen' },
    qwen: { id: 'qwen', name: 'Qwen' },
    'alibaba tongyi lab': { id: 'qwen', name: 'Qwen' },
  };

  const LEGAL_SUFFIX_RE = /\s*\b(llc|inc\.?|ltd\.?|corp\.?|pbc|co\.?|group|holdings)\b\.?$/gi;

  function slugifyCreator(raw) {
    if (!raw) return { id: 'unknown', name: 'Unknown' };
    const trimmed = raw.trim();
    const lowered = trimmed.toLowerCase();
    if (AUTHOR_OVERRIDES[lowered]) return AUTHOR_OVERRIDES[lowered];
    const cleaned = lowered.replace(LEGAL_SUFFIX_RE, '').trim();
    const slug = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { id: slug || 'unknown', name: trimmed };
  }

  // Group by creator → super_model → providers
  const creatorMap = new Map();
  const roleRankingsKey = isFree ? '_role_rankings' : '_role_rankings_paid';
  const roleRankingsRaw = meta[roleRankingsKey] || {};

  for (const dp of outputModels) {
    if (dp._removed) continue;

    const creatorInfo = slugifyCreator(dp.creator);
    const creatorId = creatorInfo.id;

    if (!creatorMap.has(creatorId)) {
      creatorMap.set(creatorId, {
        id: creatorId,
        name: creatorInfo.name,
        modelMap: new Map(),
      });
    }
    const creator = creatorMap.get(creatorId);

    // Update creator name if we find a better (longer/more canonical) one
    if (creatorInfo.name.length > creator.name.length) {
      creator.name = creatorInfo.name;
    }

    if (!creator.modelMap.has(dp.super_id)) {
      creator.modelMap.set(dp.super_id, {
        super_id: dp.super_id,
        name: dp.super_name,
        slug: (dp.super_name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        creator: dp.creator || null,
        base_creator: dp.base_creator || null,
        family: dp.family,
        best_for: [...(dp.best_for || [])],
        best_context: dp.context_length || 0,
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
    model.providers.push({
      full_id: dp.id,
      provider: dp.provider,
      provider_slug: dp.source,
      source_ids: dp.source_ids || [],
      context_length: dp.context_length,
      is_free: dp.is_free,
      supports_tools: dp.supports_tools,
      supports_reasoning: dp.supports_reasoning,
      output_limit: dp.output_limit,
      temperature: dp.temperature,
      open_weights: dp.open_weights,
      tags: dp.tags,
      best_for: dp.best_for,
      input_types: dp.input_types,
      output_types: dp.output_types,
      status: dp.status,
      last_success: dp.last_success,
      _removed: dp._removed,
      _removedDate: dp._removedDate,
      notes: dp.notes,
      priority_score: dp.priority_score,
      limitations: dp.limitations,
    });

    // Update model-level aggregates
    if (dp.context_length && dp.context_length > model.best_context) {
      model.best_context = dp.context_length;
    }
    for (const tag of dp.best_for || []) {
      if (!model.best_for.includes(tag)) model.best_for.push(tag);
    }
  }

  // Build role_rankings per model (map full_id rankings to super_id)
  const roleRankingBySuperId = {};
  for (const [role, ids] of Object.entries(roleRankingsRaw)) {
    if (!Array.isArray(ids) || role.startsWith('_')) continue;
    for (const fullId of ids) {
      const dp = outputModels.find((m) => m.id === fullId);
      if (dp) {
        const key = `${dp.super_id}`;
        if (!roleRankingBySuperId[key]) roleRankingBySuperId[key] = {};
        const rank = ids.indexOf(fullId) + 1;
        if (!roleRankingBySuperId[key][role] || roleRankingBySuperId[key][role] > rank) {
          roleRankingBySuperId[key][role] = rank;
        }
      }
    }
  }

  // Assemble creators array
  const creators = Array.from(creatorMap.values())
    .map((creator) => {
      const models = Array.from(creator.modelMap.values())
        .map((model) => ({
          super_id: model.super_id,
          name: model.name,
          slug: model.slug,
          creator: model.creator || null,
          base_creator: model.base_creator || null,
          family: model.family || null,
          best_for: model.best_for,
          best_context: model.best_context,
          role_rankings: roleRankingBySuperId[`${model.super_id}`] || {},
          providers: model.providers,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const providerSet = new Set();
      for (const model of models) {
        for (const p of model.providers) providerSet.add(p.provider_slug);
      }

      return {
        id: creator.id,
        name: creator.name,
        model_count: models.length,
        provider_count: providerSet.size,
        models,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build provider references
  const providerRefMap = new Map();
  for (const dp of outputModels) {
    if (dp._removed) continue;
    if (!providerRefMap.has(dp.source)) {
      providerRefMap.set(dp.source, {
        id: dp.source,
        slug: dp.source,
        name: dp.provider,
        model_count: 0,
        working_count: 0,
      });
    }
    const ref = providerRefMap.get(dp.source);
    ref.model_count++;
    if (dp.status.result === 'working') ref.working_count++;
  }

  const PROVIDER_BASE_URLS = {
    openrouter: 'https://openrouter.ai/api/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    groq: 'https://api.groq.com/openai/v1',
    togetherai: 'https://api.together.xyz/v1',
    mistral: 'https://api.mistral.ai/v1',
    deepseek: 'https://api.deepseek.com/v1',
    huggingface: 'https://api-inference.huggingface.co/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
  };

  const providers = Array.from(providerRefMap.values())
    .map((ref) => ({
      ...ref,
      base_url: PROVIDER_BASE_URLS[ref.slug] || '',
      health_status:
        ref.working_count === ref.model_count && ref.model_count > 0
          ? 'healthy'
          : ref.working_count > 0
            ? 'degraded'
            : 'down',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Model scores
  const { rows: scoreRows } = await client.query(
    'SELECT dm.full_id, ms.source, ms.score_type, ms.score_value FROM model_scores ms JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id',
  );
  const scoreMap = {};
  for (const r of scoreRows) {
    if (!scoreMap[r.full_id]) scoreMap[r.full_id] = [];
    scoreMap[r.full_id].push({
      source: r.source,
      score_type: r.score_type,
      score_value: r.score_value !== null ? Number(r.score_value) : null,
    });
  }

  // Provider health
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

  return {
    creators,
    providers,
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
    _role_rankings: meta[roleRankingsKey] || {
      description: '',
      model: [],
      build: [],
      general: [],
      small_model: [],
      explore: [],
    },
    _model_scores: {
      description: 'External benchmark scores by source',
      sources: ['artificial_analysis'],
      scores: scoreMap,
    },
    _provider_usage: meta._provider_usage || { description: '' },
    _known_issues: meta._known_issues || { description: '', issues: [] },
    _validation_method: meta._validation_method || { description: '' },
    provider_health: health,
  };
}

module.exports = buildModelsData;

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
           mm.base_creator AS super_base_creator, mm.family AS super_family, mm.base_model AS super_base_model,
           mm.derivation_method AS super_derivation_method,
           dp.name AS provider_name, dp.slug AS provider_slug,
           dp.npm_package, dp.base_url
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
    'supports_attachment',
    'supports_structured_output',
    'model_tier',
    'model_variant',
    'param_count_b',
    'active_param_count_b',
    'expert_count',
    'thinking_variant',
    'model_version',
    'release_stage',
    'coding_specialized',
    'modality_vision',
    'modality_video',
    'modality_audio',
    'description',
  ];

  if (dmIds.length > 0) {
    const useClient = pool || client;

    try {
      const { rows } = await useClient.query(
        'SELECT datapoint_model_id, input_type AS type_val FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      for (const r of rows) {
        if (!inputMap.has(r.datapoint_model_id)) inputMap.set(r.datapoint_model_id, []);
        inputMap.get(r.datapoint_model_id).push(r.type_val);
      }
    } catch { /* table may not exist */ }

    try {
      const { rows } = await useClient.query(
        'SELECT datapoint_model_id, output_type AS type_val FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      for (const r of rows) {
        if (!outputMap.has(r.datapoint_model_id)) outputMap.set(r.datapoint_model_id, []);
        outputMap.get(r.datapoint_model_id).push(r.type_val);
      }
    } catch { /* table may not exist */ }

    try {
      const { rows } = await useClient.query(
        'SELECT datapoint_model_id, feature_type AS type_val, value AS feat_val FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)',
        [dmIds]
      );
      for (const r of rows) {
        if (!featMap.has(r.datapoint_model_id)) {
          const obj = { tag: [], best_for: [] };
          for (const f of knownFeatures) obj[f] = [];
          featMap.set(r.datapoint_model_id, obj);
        }
        const bucket = knownFeatures.includes(r.type_val) ? r.type_val : 'tag';
        featMap.get(r.datapoint_model_id)[bucket].push(r.feat_val);
      }
    } catch { /* table may not exist */ }
  }

  // Known model slug → creator, for models with no explicit creator set.
  // Exact matches first, then prefix-based matches for model families.
  const CREATOR_BY_SLUG = new Map([
    // OpenRouter native models & routers (id = openrouter/*)
    ['owl-alpha', 'OpenRouter'],
    ['bodybuilder', 'OpenRouter'],
    ['pareto-code', 'OpenRouter'],
    ['spotlight', 'OpenRouter'],
    // Arcee AI models (id = arcee-ai/*, but stored without org prefix)
    ['coder-large', 'Arcee AI'],
    ['virtuoso-large', 'Arcee AI'],
    // LLMGateway routers
    ['auto-route', 'LLMGateway'],
    ['custom-model', 'LLMGateway'],
    // NovitaAI test models
    ['ai-infer-test-1', 'NovitaAI'],
    ['ai-infer-test-2', 'NovitaAI'],
    ['ai-infer-test-3', 'NovitaAI'],
    // Miscellaneous
    ['maestro-reasoning', 'Aion Labs'],
    ['elephant', 'Unidentifyable'],
    ['gt-4p', 'Unidentifyable'],
  ]);
  const CREATOR_BY_PREFIX = [
    ['qwq', 'Alibaba'],
    ['tongyi', 'Alibaba'],
    ['qianfan', 'Baidu'],
    ['sonar', 'Perplexity'],
    ['sqlcoder', 'Defog'],
    ['allam', 'SDAIA'],
    ['ui-tars', 'ByteDance'],
    ['intellect', 'Prime Intellect'],
    ['bunny', 'BAAI'],
  ];
  // Known base model + derivation method for specific slugs
  const DERIVATION_BY_SLUG = new Map([
    ['coder-large', { base_model: 'qwen-2.5-instruct', derivation_method: 'finetune' }],
  ]);

  // Fallback: infer creator from model name when super_models.creator is NULL
  function inferCreatorFromName(name) {
    if (!name) return null;
    const slashIdx = name.indexOf('/');
    if (slashIdx > 0 && slashIdx < name.length - 1) {
      return name.slice(0, slashIdx).trim();
    }
    const colonIdx = name.indexOf(':');
    if (colonIdx > 0 && colonIdx < name.length - 1) {
      return name.slice(0, colonIdx).trim();
    }
    // Check exact + prefix matches against slugified name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (CREATOR_BY_SLUG.has(slug)) return CREATOR_BY_SLUG.get(slug);
    for (const [prefix, creator] of CREATOR_BY_PREFIX) {
      if (slug === prefix || slug.startsWith(prefix + '-')) {
        return creator;
      }
    }
    return null;
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
        feat?.supports_attachment?.[0] === undefined ? null : feat.supports_attachment[0] === 'true',
      supports_structured_output:
        feat?.supports_structured_output?.[0] === undefined ? null : feat.supports_structured_output[0] === 'true',
      output_limit: feat?.output_limit?.[0] ? parseInt(feat.output_limit[0], 10) : null,
      temperature: feat?.temperature?.[0] === undefined ? null : feat.temperature[0] === 'true',
      open_weights: feat?.open_weights?.[0] === undefined ? null : feat.open_weights[0] === 'true',
      family: dm.super_family || feat?.family?.[0] || null,
      base_model: dm.super_base_model || (DERIVATION_BY_SLUG.get(dm.super_slug) || {}).base_model || null,
      derivation_method: dm.super_derivation_method || (DERIVATION_BY_SLUG.get(dm.super_slug) || {}).derivation_method || null,
      knowledge_cutoff: feat?.knowledge_cutoff?.[0] || null,
      releaseDate: feat?.release_date?.[0] || null,
      lastUpdated: feat?.last_updated?.[0] || null,
      tags: feat?.tag || [],
      best_for: feat?.best_for || [],
      input_types: inputMap.get(dm.id) || [],
      output_types: outputMap.get(dm.id) || [],
      model_tier: feat?.model_tier || [],
      model_variant: feat?.model_variant?.[0] || null,
      param_count_b: feat?.param_count_b?.[0] ? parseInt(feat.param_count_b[0], 10) : null,
      active_param_count_b: feat?.active_param_count_b?.[0] ? parseInt(feat.active_param_count_b[0], 10) : null,
      expert_count: feat?.expert_count?.[0] ? parseInt(feat.expert_count[0], 10) : null,
      thinking_variant: feat?.thinking_variant?.[0] === 'true' || false,
      model_version: feat?.model_version?.[0] || null,
      release_stage: feat?.release_stage?.[0] || null,
      coding_specialized: feat?.coding_specialized?.[0] === 'true' || false,
      description: feat?.description?.[0] || null,
      status: {
        tested: dm.status_tested || null,
        result: dm.status_result || 'untested',
        detail: dm.status_detail || null,
      },
      last_success: dm.last_success || null,
      deprecated_at: dm.deprecated_at || null,
      base_url: dm.base_url || null,
      source: dm.provider_slug,
      npm_package: dm.npm_package || null,
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
    // Major AI labs — canonical forms
    'google llc': { id: 'google', name: 'Google' },
    google: { id: 'google', name: 'Google' },
    'meta platforms, inc.': { id: 'meta', name: 'Meta' },
    'meta platforms inc.': { id: 'meta', name: 'Meta' },
    meta: { id: 'meta', name: 'Meta' },
    'meta-llama': { id: 'meta', name: 'Meta' },
    anthropic: { id: 'anthropic', name: 'Anthropic' },
    'anthropic, pbc': { id: 'anthropic', name: 'Anthropic' },
    openai: { id: 'openai', name: 'OpenAI' },
    'openai, llc.': { id: 'openai', name: 'OpenAI' },
    'mistral ai': { id: 'mistral', name: 'Mistral AI' },
    'mistral ai, pbc': { id: 'mistral', name: 'Mistral AI' },
    mistral: { id: 'mistral', name: 'Mistral AI' },
    mistralai: { id: 'mistral', name: 'Mistral AI' },
    deepseek: { id: 'deepseek', name: 'DeepSeek' },
    'deepseek-ai': { id: 'deepseek', name: 'DeepSeek' },
    'alibaba group': { id: 'alibaba', name: 'Alibaba' },
    'alibaba cloud': { id: 'alibaba', name: 'Alibaba' },
    alibaba: { id: 'alibaba', name: 'Alibaba' },
    nvidia: { id: 'nvidia', name: 'NVIDIA' },
    'nvidia corporation': { id: 'nvidia', name: 'NVIDIA' },
    cohere: { id: 'cohere', name: 'Cohere' },
    'cohere inc.': { id: 'cohere', name: 'Cohere' },
    microsoft: { id: 'microsoft', name: 'Microsoft' },
    'microsoft corporation': { id: 'microsoft', name: 'Microsoft' },
    xai: { id: 'xai', name: 'xAI' },
    'xai corp': { id: 'xai', name: 'xAI' },
    'x-ai': { id: 'xai', name: 'xAI' },
    'zhipu ai': { id: 'zhipu', name: 'Zhipu AI' },
    '01-ai': { id: '01-ai', name: '01.AI' },
    minimax: { id: 'minimax', name: 'MiniMax' },
    'minimax group': { id: 'minimax', name: 'MiniMax' },
    'minimax ai': { id: 'minimax', name: 'MiniMax' },
    'moonshot ai': { id: 'moonshot', name: 'Moonshot AI' },
    moonshotai: { id: 'moonshot', name: 'Moonshot AI' },
    stepfun: { id: 'stepfun', name: 'StepFun' },
    bytedance: { id: 'bytedance', name: 'ByteDance' },
    tencent: { id: 'tencent', name: 'Tencent' },
    'tencent cloud': { id: 'tencent', name: 'Tencent' },
    baidu: { id: 'baidu', name: 'Baidu' },
    'inflection ai': { id: 'inflection', name: 'Inflection' },
    'stability ai': { id: 'stability', name: 'Stability AI' },
    stabilityai: { id: 'stability', name: 'Stability AI' },
    eleutherai: { id: 'eleutherai', name: 'EleutherAI' },
    qwq: { id: 'qwen', name: 'Alibaba' },
    qwen: { id: 'qwen', name: 'Alibaba' },
    'alibaba tongyi lab': { id: 'qwen', name: 'Alibaba' },
    // Additional aliases
    'ai21 labs': { id: 'ai21', name: 'AI21 Labs' },
    ai21labs: { id: 'ai21', name: 'AI21 Labs' },
    'ibm-granite': { id: 'ibm', name: 'IBM' },
    ibm: { id: 'ibm', name: 'IBM' },
    tii: { id: 'tii', name: 'TII' },
    tiiuae: { id: 'tii', name: 'TII' },
    bigcode: { id: 'bigcode', name: 'BigCode' },
    'big code': { id: 'bigcode', name: 'BigCode' },
    'rhymes ai': { id: 'rhymes', name: 'Rhymes AI' },
    apple: { id: 'apple', name: 'Apple' },
    databricks: { id: 'databricks', name: 'Databricks' },
    'h2o.ai': { id: 'h2o', name: 'H2O.ai' },
    h2oai: { id: 'h2o', name: 'H2O.ai' },
    upstage: { id: 'upstage', name: 'Upstage' },
    writer: { id: 'writer', name: 'Writer' },
    yandex: { id: 'yandex', name: 'Yandex' },
    sberbank: { id: 'sber', name: 'Sber' },
    'together ai': { id: 'together', name: 'Together AI' },
    togethercomputer: { id: 'together', name: 'Together AI' },
    siliconflow: { id: 'siliconflow', name: 'SiliconFlow' },
    'siliconflow-cn': { id: 'siliconflow', name: 'SiliconFlow' },
    'z.ai': { id: 'zhipu', name: 'Zhipu AI' },
    'z ai': { id: 'zhipu', name: 'Zhipu AI' },
    'z-ai': { id: 'zhipu', name: 'Zhipu AI' },
    'zai-org': { id: 'zhipu', name: 'Zhipu AI' },
    'hugging face': { id: 'huggingface', name: 'Hugging Face' },
    huggingface: { id: 'huggingface', name: 'Hugging Face' },
    'arcee ai': { id: 'arcee', name: 'Arcee AI' },
    allenai: { id: 'ai2', name: 'AI2' },
    ai2: { id: 'ai2', name: 'AI2' },
    amazon: { id: 'amazon', name: 'Amazon' },
    intel: { id: 'intel', name: 'Intel' },
    samsung: { id: 'samsung', name: 'Samsung' },
    oracle: { id: 'oracle', name: 'Oracle' },
    salesforce: { id: 'salesforce', name: 'Salesforce' },
    sambanova: { id: 'sambanova', name: 'SambaNova' },
    perplexity: { id: 'perplexity', name: 'Perplexity' },
    perceptron: { id: 'perceptron', name: 'Perceptron' },
    'inclusion ai': { id: 'inclusion', name: 'Inclusion AI' },
    inclusionai: { id: 'inclusion', name: 'Inclusion AI' },
    'inception ai': { id: 'inception', name: 'Inception AI' },
    'liquid ai': { id: 'liquid', name: 'Liquid AI' },
    'essential ai': { id: 'essential', name: 'Essential AI' },
    'deep cogito': { id: 'deepcogito', name: 'Deep Cogito' },
    'nous research': { id: 'nous', name: 'Nous Research' },
    'prime intellect': { id: 'primeintellect', name: 'Prime Intellect' },
    'nex agi': { id: 'nexagi', name: 'Nex AGI' },
    'aion labs': { id: 'aion', name: 'Aion Labs' },
    poolside: { id: 'poolside', name: 'Poolside' },
    kwaipilot: { id: 'kwaipilot', name: 'Kwaipilot' },
    'kwai pilot': { id: 'kwaipilot', name: 'Kwaipilot' },
    morph: { id: 'morph', name: 'Morph' },
    relace: { id: 'relace', name: 'Relace' },
    mancer: { id: 'mancer', name: 'Mancer' },
    sao10k: { id: 'sao10k', name: 'Sao10K' },
    thedrummer: { id: 'thedrummer', name: 'TheDrummer' },
    'the drummer': { id: 'thedrummer', name: 'TheDrummer' },
    xiaomi: { id: 'xiaomi', name: 'Xiaomi' },
    'xiaomi mimo': { id: 'xiaomi', name: 'Xiaomi' },
    'deci ai': { id: 'deci', name: 'Deci AI' },
    kyutai: { id: 'kyutai', name: 'Kyutai' },
    // opencode is a router/proxy, not a model creator
    'lg ai': { id: 'lg', name: 'LG AI' },
    deepgram: { id: 'deepgram', name: 'Deepgram' },
    viivox: { id: 'viivox', name: 'ViiVox' },
    // Alibaba namespace artifacts
    thenlper: { id: 'alibaba', name: 'Alibaba' },
    nlper: { id: 'alibaba', name: 'Alibaba' },
    rokid: { id: 'rokid', name: 'Rokid' },
    corwealth: { id: 'corwealth', name: 'CorWealth' },
  };

const LEGAL_SUFFIX_RE = /\s*\b(llc|inc\.?|ltd\.?|corp\.?|pbc|co\.?|group|holdings)\b\.?$/gi;

  // Normalize a raw creator name for lookup: strip dots (Z.AI → ZAI),
  // collapse whitespace, lowercase. Prevents duplicate creator IDs from
  // punctuation variants of the same name.
  function normalizeCreatorName(raw) {
    return raw
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugifyCreator(raw) {
    if (!raw) return { id: 'unknown', name: 'Unknown' };
    const trimmed = raw.trim();
    const lowered = trimmed.toLowerCase();
    // Try exact match first, then normalized match
    const normalized = normalizeCreatorName(trimmed);
    if (AUTHOR_OVERRIDES[lowered]) return AUTHOR_OVERRIDES[lowered];
    if (AUTHOR_OVERRIDES[normalized]) return AUTHOR_OVERRIDES[normalized];
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
        base_model: dp.base_model,
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
      base_model: dp.base_model,
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
      _removed: dp._removed,
      _removedDate: dp._removedDate,
      notes: dp.notes,
      priority_score: dp.priority_score,
      limitations: dp.limitations,
      knowledge_cutoff: dp.knowledge_cutoff || null,
      last_updated: dp.lastUpdated || null,
      release_date: dp.releaseDate || null,
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
          base_model: model.base_model || null,
          derivation_method: model.derivation_method || null,
          best_for: model.best_for,
          best_context: model.best_context,
          min_context: model.min_context || null,
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
        npm_package: dp.npm_package || null,
        base_url: dp.base_url || null,
        description: null,
        model_count: 0,
        working_count: 0,
      });
    }
    const ref = providerRefMap.get(dp.source);
    ref.model_count++;
    if (dp.status.result === 'working') ref.working_count++;
  }

  const PROVIDER_DESCRIPTIONS = {
    'alibaba-cn': 'Alibaba Cloud\'s DashScope API for Qwen models (Tongyi, QwQ) — China-based inference with strong reasoning and multilingual capabilities.',
    'alibaba-coding-plan': 'Alibaba Cloud\'s DashScope API for Qwen models (Tongyi, QwQ) — China-based inference with strong reasoning and multilingual capabilities.',
    'alibaba-coding-plan-cn': 'Alibaba Cloud\'s DashScope API for Qwen models (Tongyi, QwQ) — China-based inference with strong reasoning and multilingual capabilities.',
    anthropic: 'Anthropic\'s official API for the Claude model family — frontier models known for safety, reasoning, and coding capabilities.',
    cerebras: 'Inference provider leveraging Cerebras\' wafer-scale hardware to deliver extremely high token throughput (thousands of tokens per second) for select open models.',
    cloudflare: 'Cloudflare\'s global edge network serving Workers AI models, including their AI Gateway for routing and observability across providers.',
    'cloudflare-ai-gateway': 'Cloudflare\'s AI Gateway — a unified endpoint for routing requests across multiple LLM providers with built-in caching, rate limiting, and analytics.',
    cohere: 'Cohere\'s API platform for the Command and Aya model families, specializing in RAG, multilingual, and enterprise use cases.',
    deepinfra: 'Community-driven inference provider offering pay-per-token access to hundreds of open models with minimal hosting markup.',
    deepseek: 'DeepSeek\'s official API for their frontier models (DeepSeek-V3, DeepSeek-R1) offering competitive pricing for both chat and reasoning workloads.',
    firepass: 'Alternative API endpoint for Fireworks inference, serving open models at competitive prices.',
    fireworks: 'Serverless inference platform optimized for speed and cost-efficiency, supporting a broad catalog of open models with LoRA adapters.',
    'github-models': 'GitHub\'s model playground and API offering free access to popular models from multiple providers running on Azure AI infrastructure.',
    google: 'Google\'s official API for the Gemini and Gemma model families, providing free-tier access with generous rate limits and multimodal support.',
    groq: 'LPU-based inference provider delivering ultra-low latency (hundreds of tokens per second) for open models running on custom hardware.',
    huggingface: 'The largest open-source ML community — hosts and serves thousands of models, datasets, and demos via the Hugging Face Inference API and TGI-powered serverless endpoints.',
    llmgateway: 'Open-source API gateway providing a unified OpenAI-compatible interface for calling open-weight models from various inference backends.',
    lmstudio: 'Local inference platform — runs models directly on your hardware with an OpenAI-compatible localhost API, no cloud dependency.',
    mistral: 'Mistral AI\'s official API platform for their frontier models (Mistral Large, Codestral, Ministral) with competitive free-tier access.',
    modelsdev: 'Community-driven model discovery platform that indexes and compares LLM pricing, context windows, and provider availability across the ecosystem.',
    'novita-ai': 'Novita AI\'s API platform providing inference for open models with competitive free-tier pricing and OpenAI-compatible endpoints.',
    novitaai: 'Novita AI\'s API platform providing inference for open models with competitive free-tier pricing and OpenAI-compatible endpoints.',
    nvidia: 'NVIDIA\'s API platform providing high-performance inference for open models running on their GPU infrastructure, including the Nemotron and Llama families.',
    openai: 'OpenAI\'s official API for GPT-4o, GPT-4.1, and other frontier models — the most widely adopted LLM API ecosystem.',
    opencode: 'OpenCode Zen API — focused on fast, affordable inference for coding and agentic workloads running on optimized infrastructure.',
    openrouter: 'Multi-provider API gateway offering unified access to 300+ models across dozens of providers with a single API key, standardized billing, and automatic failover.',
    siliconflow: 'Chinese inference provider offering competitive pricing for open models, with strong coverage of Qwen and DeepSeek model variants.',
    'siliconflow-cn': 'Chinese inference provider offering competitive pricing for open models, with strong coverage of Qwen and DeepSeek model variants.',
    together: 'Together AI\'s API platform for large-scale inference of open-source models across a broad catalog with competitive pricing and fine-tuning support.',
    xai: 'xAI\'s official API for the Grok model family — frontier models with real-time knowledge and strong reasoning.',
    zhipuai: 'Zhipu AI\'s official API for the GLM model family with strong Chinese-English bilingual capabilities and multimodal support.',
    'zhipuai-coding-plan': 'Zhipu AI\'s official API for the GLM model family with strong Chinese-English bilingual capabilities and multimodal support.',
    zai: 'Zhipu AI\'s (formerly Z.AI) API for the GLM model family, providing Chinese-English bilingual models with competitive regional pricing.',
    'zai-coding-plan': 'Zhipu AI\'s (formerly Z.AI) API for the GLM model family, providing Chinese-English bilingual models with competitive regional pricing.',
    vercel: 'Vercel AI Gateway — a single API endpoint to access multiple LLM providers with built-in caching, rate limiting, and observability.',
  };

  const PROVIDER_BASE_URLS = {
    'alibaba-cn': 'https://dashscope.aliyuncs.com/api/v1',
    'alibaba-coding-plan': 'https://dashscope.aliyuncs.com/api/v1',
    'alibaba-coding-plan-cn': 'https://dashscope.aliyuncs.com/api/v1',
    anthropic: 'https://api.anthropic.com',
    cerebras: 'https://api.cerebras.ai/v1',
    cloudflare: 'https://api.cloudflare.com/client/v4',
    'cloudflare-ai-gateway': 'https://gateway.ai.cloudflare.com/v1',
    cohere: 'https://api.cohere.ai/v1',
    deepinfra: 'https://api.deepinfra.com/v1/openai',
    deepseek: 'https://api.deepseek.com/v1',
    firepass: 'https://api.fireworks.ai',
    fireworks: 'https://api.fireworks.ai',
    'github-models': 'https://models.inference.ai.azure.com',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    groq: 'https://api.groq.com/openai/v1',
    huggingface: 'https://router.huggingface.co/v1',
    llmgateway: 'https://api.llmgateway.io/v1',
    lmstudio: 'http://localhost:1234/v1',
    mistral: 'https://api.mistral.ai/v1',
    modelsdev: 'https://models.dev',
    'novita-ai': 'https://api.novita.ai/v3/openai',
    novitaai: 'https://api.novita.ai/v3/openai',
    nvidia: 'https://integrate.api.nvidia.com/v1',
    openai: 'https://api.openai.com',
    opencode: 'https://opencode.ai/zen/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    siliconflow: 'https://api.siliconflow.cn/v1',
    'siliconflow-cn': 'https://api.siliconflow.cn/v1',
    together: 'https://api.together.xyz',
    xai: 'https://api.x.ai/v1',
    zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
    'zhipuai-coding-plan': 'https://open.bigmodel.cn/api/paas/v4',
    zai: 'https://api.z.ai/api/v1',
    'zai-coding-plan': 'https://api.z.ai/api/v1',
  };

  const providers = Array.from(providerRefMap.values())
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

  // Model scores — cross-reference scores to all full_ids of the same super model
  // so lookups work regardless of which provider listing is used as key.
  // Build super_id → full_ids from ALL datapoints (free + paid), not just
  // the filtered outputModels, so benchmark-provider entries propagate to API-provider entries.
  const { rows: allDpRows } = await client.query(
    'SELECT id, full_id, super_model_id FROM datapoint_models',
  );
  const superIdToFullIds = {};
  for (const r of allDpRows) {
    if (!superIdToFullIds[r.super_model_id]) superIdToFullIds[r.super_model_id] = [];
    superIdToFullIds[r.super_model_id].push(r.full_id);
  }

  const { rows: scoreRows } = await client.query(
    'SELECT dm.full_id, dm.super_model_id, ms.source, ms.score_type, ms.score_value FROM model_scores ms JOIN datapoint_models dm ON dm.id = ms.datapoint_model_id',
  );
  const scoreMap = {};
  const seen = new Set();
  for (const r of scoreRows) {
    const siblings = superIdToFullIds[r.super_model_id] || [r.full_id];
    const entry = {
      source: r.source,
      score_type: r.score_type,
      score_value: r.score_value !== null ? Number(r.score_value) : null,
    };
    for (const fid of siblings) {
      const dedupeKey = `${fid}|${r.source}|${r.score_type}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (!scoreMap[fid]) scoreMap[fid] = [];
      scoreMap[fid].push(entry);
    }
  }

  // ── Failover suggestions ──
  // For every broken model, find working alternatives on other providers for the same super_model
  const failoverSuggestions = { forward: {}, reverse: {} };
  {
    const workingBySuperId = new Map();
    const brokenBySuperId = new Map();
    for (const m of outputModels) {
      if (m._removed) continue;
      if (m.status.result === 'working') {
        if (!workingBySuperId.has(m.super_id)) workingBySuperId.set(m.super_id, []);
        workingBySuperId.get(m.super_id).push(m.id);
      } else if (m.status.result === 'broken') {
        if (!brokenBySuperId.has(m.super_id)) brokenBySuperId.set(m.super_id, []);
        brokenBySuperId.get(m.super_id).push(m.id);
      }
    }
    for (const [superId, broken] of brokenBySuperId) {
      const working = workingBySuperId.get(superId) || [];
      if (working.length === 0) continue;
      for (const brokenId of broken) {
        failoverSuggestions.forward[brokenId] = working;
      }
      for (const wId of working) {
        failoverSuggestions.reverse[wId] = (failoverSuggestions.reverse[wId] || []).concat(broken);
      }
    }
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

  // Per-model failure rates from test_observations (7d and 30d)
  let failureRates = { description: 'Per-model failure rates from test_observations', models: {} };
  try {
    const { rows: frRows } = await client.query(`
      SELECT
        full_id,
        ROUND(COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1) AS failure_rate_7d,
        COUNT(*) AS samples_7d,
        COUNT(*) FILTER (WHERE status = 'fail') AS failures_7d
      FROM test_observations
      WHERE tested_at >= now() - interval '7 days'
      GROUP BY full_id
    `);
    const { rows: frRows30d } = await client.query(`
      SELECT
        full_id,
        ROUND(COUNT(*) FILTER (WHERE status = 'fail') * 100.0 / NULLIF(COUNT(*), 0), 1) AS failure_rate_30d,
        COUNT(*) AS samples_30d,
        COUNT(*) FILTER (WHERE status = 'fail') AS failures_30d
      FROM test_observations
      WHERE tested_at >= now() - interval '30 days'
      GROUP BY full_id
    `);

    const frMap7d = {};
    for (const r of frRows) {
      frMap7d[r.full_id] = r;
    }
    const frMap30d = {};
    for (const r of frRows30d) {
      frMap30d[r.full_id] = r;
    }

    failureRates.models = {};
    for (const m of outputModels) {
      const fr7 = frMap7d[m.id];
      const fr30 = frMap30d[m.id];
      if (fr7 || fr30) {
        failureRates.models[m.id] = {
          failure_rate_7d: fr7 ? Number(fr7.failure_rate_7d) : null,
          samples_7d: fr7 ? parseInt(fr7.samples_7d, 10) : 0,
          failures_7d: fr7 ? parseInt(fr7.failures_7d, 10) : 0,
          failure_rate_30d: fr30 ? Number(fr30.failure_rate_30d) : null,
          samples_30d: fr30 ? parseInt(fr30.samples_30d, 10) : 0,
          failures_30d: fr30 ? parseInt(fr30.failures_30d, 10) : 0,
        };
      }
    }
  } catch {
    // test_observations table may not exist yet (migration not run)
    failureRates.note = 'test_observations table not available';
  }

  // ── Model health snapshots ──
  // Only track providers with is_health_trackable = true (excludes HuggingFace etc.)
  let modelHealth = {};

  try {
    const { rows: healthRows } = await client.query(`
      WITH inference_models AS (
        SELECT dm.full_id
        FROM datapoint_models dm
        JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
        WHERE dm.is_free = $1 AND dm.is_removed = false
          AND (dp.is_health_trackable = true OR dp.is_health_trackable IS NULL)
      )
      SELECT hs.full_id, hs.tested_at, hs.status, hs.detail, hs.latency_ms
      FROM model_health_snapshots hs
      JOIN inference_models im ON im.full_id = hs.full_id
      WHERE hs.tested_at >= now() - interval '30 days'
      ORDER BY hs.full_id, hs.tested_at DESC
    `, [isFree]);

    // Group by full_id
    const healthMap = new Map();
    for (const r of healthRows) {
      if (!healthMap.has(r.full_id)) healthMap.set(r.full_id, []);
      healthMap.get(r.full_id).push(r);
    }

    for (const [fullId, snapshots] of healthMap) {
      // Keep last 20 snapshots (they're already sorted DESC by tested_at)
      const limited = snapshots.slice(0, 20);

      const total = limited.length;
      const working = limited.filter((s) => s.status === 'working').length;
      const stability = total > 0 ? Math.round((working / total) * 100) : 0;

      const lastWorking = limited.find((s) => s.status === 'working');
      const lastWorkingDate = lastWorking ? new Date(lastWorking.tested_at).toISOString().slice(0, 10) : null;

      // Compute streak: consecutive 'working' from most recent test backward
      let streak = 0;
      for (const s of limited) {
        if (s.status === 'working') streak++;
        else break;
      }

      modelHealth[fullId] = {
        snapshots: limited.map((s) => ({
          date: new Date(s.tested_at).toISOString().slice(0, 10),
          status: s.status,
          detail: s.detail || '',
          latency_ms: s.latency_ms !== null ? Number(s.latency_ms) : null,
        })),
        stability,
        last_working: lastWorkingDate,
        streak,
      };
    }
  } catch {
    // model_health_snapshots table may not exist yet (migration not run)
    modelHealth = { _note: 'model_health_snapshots table not available' };
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
    _test_summary_previous: meta._test_summary_previous || null,
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
    provider_health: health,
  };
}

module.exports = buildModelsData;
